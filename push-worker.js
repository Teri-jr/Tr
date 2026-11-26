// StudyLine 用: アプリを閉じていても区切りの通知を送る(Cloudflare Workers に置くプログラム)
// 準備: D1 データベースを「DB」という名前でつなぎ、Cron トリガーを「毎分(* * * * *)」にする。
// StudyLine が「いつ・どんな通知を出すか」を送ってくるので、その時刻になったら Web プッシュで届ける。
// 通知の中身は暗号化して送る(RFC 8291)。送り主の確認には VAPID(RFC 8292)を使う。鍵は初めて動いたときに自動で作る。

const KEY = '__KEY__'; // 合言葉。StudyLine と同じでないと受け付けない
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LATE_MS = 3 * 60 * 1000; // 3分より前に過ぎた通知は、もう送らない

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (!env.DB) return json({ error: 'D1 データベースがつながっていません(ワーカーの設定 → バインディング で、変数名 DB の D1 を追加してください)' }, 500);
    try {
      await setup(env);
      if (req.method === 'GET') {
        const v = await vapid(env);
        const last = await getKv(env, 'lastCron');
        return json({ ok: true, app: 'studyline-push', key: v.pub, cron: last ? Number(last) : 0, now: Date.now() });
      }
      const b = await req.json().catch(() => null);
      if (!b || b.key !== KEY) return json({ error: '合言葉がちがいます' }, 403);
      if (!b.sub || !b.sub.endpoint || !b.sub.keys) return json({ error: '通知の登録(subscription)がありません' }, 400);
      const dev = await devId(b.sub.endpoint);
      if (b.type === 'remove') {
        await env.DB.batch([env.DB.prepare('DELETE FROM jobs WHERE dev = ?').bind(dev), env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(dev)]);
        return json({ ok: true });
      }
      if (b.type === 'sync') {
        const now = Date.now();
        const jobs = (Array.isArray(b.jobs) ? b.jobs : []).filter(j => j && typeof j.at === 'number' && j.at > now - LATE_MS && j.at < now + 2 * 86400000).slice(0, 60);
        const st = [env.DB.prepare('INSERT INTO devices (id, sub, seen) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET sub = excluded.sub, seen = excluded.seen').bind(dev, JSON.stringify(b.sub), now),
          env.DB.prepare('DELETE FROM jobs WHERE dev = ?').bind(dev)];
        for (const j of jobs) st.push(env.DB.prepare('INSERT OR REPLACE INTO jobs (id, dev, at, title, body, tag) VALUES (?, ?, ?, ?, ?, ?)').bind(dev + ':' + String(j.id || j.at).slice(0, 80), dev, Math.round(j.at), String(j.title || 'StudyLine').slice(0, 80), String(j.body || '').slice(0, 200), String(j.tag || 'ttable-phase').slice(0, 40)));
        await env.DB.batch(st);
        return json({ ok: true, jobs: jobs.length });
      }
      return json({ error: 'type がちがいます' }, 400);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },
  // 毎分動く。55秒のあいだ、時刻が来た通知を数秒ごとに見て送る(次の分の見回りと重ならないように)
  async scheduled(ev, env, ctx) {
    ctx.waitUntil(tick(env));
  },
};

async function tick(env) {
  if (!env.DB) return;
  await setup(env);
  const start = Date.now();
  await putKv(env, 'lastCron', String(start));
  await env.DB.prepare('DELETE FROM jobs WHERE at < ?').bind(start - LATE_MS).run();
  await env.DB.prepare('DELETE FROM devices WHERE seen < ?').bind(start - 60 * 86400000).run(); // 60日つながっていない端末は消す
  while (Date.now() - start < 55000) {
    const now = Date.now();
    const due = (await env.DB.prepare('SELECT j.id, j.dev, j.title, j.body, j.tag, d.sub FROM jobs j JOIN devices d ON d.id = j.dev WHERE j.at <= ? ORDER BY j.at LIMIT 20').bind(now + 500).all()).results || [];
    for (const j of due) {
      // 消せたら自分が送る係(同じ通知を2回送らないように)
      const del = await env.DB.prepare('DELETE FROM jobs WHERE id = ?').bind(j.id).run();
      if (!del.meta || del.meta.changes !== 1) continue;
      const r = await sendPush(env, JSON.parse(j.sub), { title: j.title, body: j.body, tag: j.tag });
      if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(j.dev).run(); // 登録が切れた端末
    }
    const next = await env.DB.prepare('SELECT MIN(at) AS at FROM jobs').first();
    const wait = next && next.at ? Math.max(200, Math.min(5000, next.at - Date.now())) : 5000;
    if (Date.now() - start + wait >= 55000) break;
    await sleep(wait);
  }
}

async function setup(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, sub TEXT, seen INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, dev TEXT, at INTEGER, title TEXT, body TEXT, tag TEXT)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS jobs_at ON jobs (at)'),
  ]);
}
async function getKv(env, k) { const r = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind(k).first(); return r ? r.v : null; }
async function putKv(env, k, v) { await env.DB.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v).run(); }

/* ---------- 文字とバイト ---------- */
const enc = new TextEncoder();
function b64u(buf) { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const t = atob(s); const a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); return a; }
function concat() { let n = 0; for (const a of arguments) n += a.length; const out = new Uint8Array(n); let o = 0; for (const a of arguments) { out.set(a, o); o += a.length; } return out; }
async function devId(endpoint) { const h = await crypto.subtle.digest('SHA-256', enc.encode(endpoint)); return b64u(h).slice(0, 22); }
async function hmac(key, data) { const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', k, data)); }

/* ---------- VAPID(送り主の鍵) ---------- */
let vapidCache = null;
async function vapid(env) {
  if (vapidCache) return vapidCache;
  let jwk = await getKv(env, 'vapid');
  if (!jwk) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    jwk = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));
    await env.DB.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (?, ?)').bind('vapid', jwk).run();
    jwk = await getKv(env, 'vapid'); // 同時に作られたときは先に入ったほうを使う
  }
  const j = JSON.parse(jwk);
  const priv = await crypto.subtle.importKey('jwk', j, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const pub = b64u(concat(new Uint8Array([4]), unb64u(j.x), unb64u(j.y)));
  vapidCache = { priv, pub, jwt: {} };
  return vapidCache;
}
async function vapidAuth(env, endpoint) {
  const v = await vapid(env);
  const aud = new URL(endpoint).origin;
  const c = v.jwt[aud];
  if (c && c.exp - Date.now() / 1000 > 3600) return c.h;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const unsigned = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))) + '.' + b64u(enc.encode(JSON.stringify({ aud, exp, sub: 'https://teri-jr.github.io/Tr/' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.priv, enc.encode(unsigned));
  const h = 'vapid t=' + unsigned + '.' + b64u(sig) + ', k=' + v.pub;
  v.jwt[aud] = { h, exp };
  return h;
}

/* ---------- 中身の暗号化(aes128gcm) ---------- */
async function encrypt(sub, text) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(text), new Uint8Array([2]))));
  const head = new Uint8Array(21); head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = asPub.length;
  return concat(head, asPub, ct);
}
async function sendPush(env, sub, msg) {
  try {
    const body = await encrypt(sub, JSON.stringify(msg));
    return await fetch(sub.endpoint, {
      method: 'POST',
      headers: { Authorization: await vapidAuth(env, sub.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '300', Urgency: 'high' },
      body,
    });
  } catch (e) { return { status: 0 }; }
}
