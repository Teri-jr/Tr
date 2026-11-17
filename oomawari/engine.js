/* 大回りジェネレータのルート探索。data.js の路線データ(OOMAWARI_DATA)だけを見て動く。
   きまり(omawari-rules.md 2章):
   - 同じ駅を2回通らない(分岐駅を1回ずつしか通らない道だけをたどり、最後に全部の駅を数えなおす)
   - 到着駅は最後に1回だけ通る(途中で通りすぎる「6の字」は作らない)
   - 列車が分岐駅に停まらないところは、折り返しの特例(turns)で先の駅まで行って戻る。そのとき通る駅も「通った駅」に入れる
   - 発駅に戻るのは一周(from と to が同じ)のときだけ
   画面からは create(DATA) の戻り値の search() / routeById() などを使う。 */
(function (root) {
'use strict';
function create(D) {
  const ST = D.st, SV = D.svc;
  const svcIds = Object.keys(SV), svcNo = {}; svcIds.forEach((k, i) => { svcNo[k] = i; });
  const skip = svcIds.map((k) => new Set(SV[k].skip || []));
  const regBit = {}; D.regions.forEach((r, i) => { regBit[r] = 1 << i; });
  const nodeNo = {}, nodeNames = [];
  const nodeOf = (n) => { if (nodeNo[n] === undefined) { nodeNo[n] = nodeNames.length; nodeNames.push(n); } return nodeNo[n]; };
  const stSeg = {}; // 駅 → [[辺の番号, 辺の中の位置]]
  const segNo = {};

  /* ===== 辺の下ごしらえ ===== */
  const G = D.segs.map((s, i) => {
    const names = s.st.map((x) => x[0]), kms = s.st.map((x) => x[1]), n = names.length - 1;
    names.forEach((nm, j) => { (stSeg[nm] = stSeg[nm] || []).push([i, j]); });
    segNo[s.id] = i;
    const hops = []; // 駅と駅のあいだごとに、使える運転系統 [系統の番号, 1時間の本数]
    for (let h = 0; h < n; h++) hops.push(s.svc.filter((e) => e[2] <= h && h < e[3]).map((e) => [svcNo[e[0]], e[1]]));
    return { i, id: s.id, line: s.line, trunk: s.trunk, names, kms, n, len: kms[n], a: nodeOf(names[0]), b: nodeOf(names[n]), hops,
      reg: s.reg.reduce((m, r) => m | regBit[r], 0), regNames: s.reg, deemed: s.deemed || [] };
  });
  const NN = nodeNames.length, adj = nodeNames.map(() => []);
  G.forEach((g) => { adj[g.a].push([g.i, 1, g.b]); adj[g.b].push([g.i, -1, g.a]); });
  adj.forEach((a) => a.sort((x, y) => G[y[0]].len - G[x[0]].len)); // 長い辺から先にためす
  const isNode = (n) => nodeNo[n] !== undefined;
  // 末期モード: 辺ごとの線路の組(同じ線路を走る系統のまとまり)。書いていない辺は1組
  const TR = G.map((g) => { const all = []; g.hops.forEach((h) => h.forEach((e) => { if (!all.includes(e[0])) all.push(e[0]); }));
    const t = (D.tracks || {})[g.id]; if (!t) return [all];
    const out = t.map((l) => l.map((k) => svcNo[k])); all.forEach((x) => { if (!out.some((l) => l.includes(x))) out[0].push(x); }); return out; });
  const inTr = (s, g, sv) => TR[s][g].includes(sv);
  // 旅規69条: この辺をぜんぶ通ったら、もう一方の経路の駅も通ったとみなす
  const sames = (D.same || []).map((x) => ({ segs: x.segs.map((id) => segNo[id]), as: x.as, law: x.law }));
  const turns = D.turns.map((t) => ({ at: t.at, to: t.to, via: t.via, law: t.law, toward: segNo[t.toward[0]], need: t.need.map((x) => segNo[x]), except: (t.except || []).map((x) => segNo[x]), only: t.only ? t.only.map((x) => segNo[x]) : null }));
  // 分岐駅を通過する列車の特例(160条の4)の駅。停まらずに通りすぎただけなら、あとでその駅に着いてもよい(例: 横浜から東海道線で東神奈川を通過 → 最後に横浜線で東神奈川)
  const PASSOK = new Set(turns.filter((t) => t.need.length === 0 && /160条の4/.test(t.law)).map((t) => t.at));

  /* ===== 略図(342×300)への写しかた ===== */
  const B = { w: 138.93, e: 140.88, s: 34.87, n: 36.46 }, KX = 111.3 * Math.cos(35.7 * Math.PI / 180), KY = 111.3;
  const SC = Math.min(336 / ((B.e - B.w) * KX), 292 / ((B.n - B.s) * KY)), OX = (342 - (B.e - B.w) * KX * SC) / 2, OY = (300 - (B.n - B.s) * KY * SC) / 2;
  const proj = (lat, lng) => [OX + (lng - B.w) * KX * SC, OY + (B.n - lat) * KY * SC];
  const xy = (name) => { const s = ST[name]; return proj(s[1], s[2]); };
  function simplify(p, tol) { // 折れ線を間引く
    if (p.length < 3) return p;
    const a = p[0], b = p[p.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9; let mi = 0, md = 0;
    for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((p[i][0] - a[0]) * dy - (p[i][1] - a[1]) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md <= tol) return [a, b];
    return simplify(p.slice(0, mi + 1), tol).slice(0, -1).concat(simplify(p.slice(mi), tol));
  }
  const f1 = (v) => Math.round(v * 10) / 10, f2 = (v) => Math.round(v * 100) / 100;
  const pathD = (names) => simplify(names.map(xy), 0.15).map((p, i) => (i ? 'L' : 'M') + f2(p[0]) + ' ' + f2(p[1])).join('');
  const netPath = G.map((g) => pathD(g.names)).join('');

  /* ===== きっぷの距離と運賃 ===== */
  const nbr = {}; // 駅 → [[となりの駅, km, 幹線か]]
  G.forEach((g) => { for (let h = 0; h < g.n; h++) { const a = g.names[h], b = g.names[h + 1], d = g.kms[h + 1] - g.kms[h]; (nbr[a] = nbr[a] || []).push([b, d, g.trunk]); (nbr[b] = nbr[b] || []).push([a, d, g.trunk]); } });
  const distCache = {}, KZ = D.kanzan || 1.1;
  /* いちばん安くなる道のり(運賃計算キロ＝幹線の営業キロ＋地方交通線の換算キロ が最小の道)。
     {駅: [営業キロ, 幹線だけか(1/0), 運賃計算キロ, 地方交通線だけか(1/0)]} */
  function dists(from) {
    if (distCache[from]) return distCache[from];
    const dist = {}, done = new Set(); dist[from] = [0, 1, 0, 1];
    for (;;) { let u = null, best = Infinity; for (const k in dist) if (!done.has(k) && dist[k][2] < best) { best = dist[k][2]; u = k; }
      if (u === null) break; done.add(u); const du = dist[u];
      for (const e of nbr[u]) { const nd = best + (e[2] ? e[1] : e[1] * KZ);
        if (!dist[e[0]] || nd < dist[e[0]][2] - 1e-9) dist[e[0]] = [du[0] + e[1], du[1] && e[2] ? 1 : 0, nd, du[0] === 0 ? (e[2] ? 0 : 1) : (du[3] && !e[2] ? 1 : 0)]; } }
    return (distCache[from] = dist);
  }
  const lookup = (t, km) => { const k = Math.ceil(km - 1e-9); for (const r of t) if (k <= r[0]) return r[1]; return null; };
  const fareBy = (km, ic) => lookup(ic ? D.fares.ic : D.fares.paper, km); // 幹線だけ
  // 運賃(2026年3月改定後)。幹線だけ→A表(営業キロ)。地方交通線だけ→B表(営業キロ)。
  // 両方をまたぐ→10km以下はB表(営業キロ)、11km以上はA表(運賃計算キロ)。換算キロは目安(営業キロ×1.1)
  const fareOf = (d, ic) => { const F = D.fares, A = ic ? F.ic : F.paper, B = (ic ? F.localIc : F.localPaper) || A;
    if (d[1]) return lookup(A, d[0]);
    if (d[3] || Math.ceil(d[0] - 1e-9) <= 10) return lookup(B, d[0]);
    return lookup(A, d[2]); };
  // 運賃の区分(営業キロの帯)。幹線だけの道のりのときだけ [下限, 上限] を返す。それ以外は null
  const bandOf = (km, t) => { if (!t) return null; const k = Math.ceil(km - 1e-9); let lo = 1; for (const r of t) { if (k <= r[0]) return [lo, r[0]]; lo = r[0] + 1; } return null; };
  const isLoopStation = (n) => !!D.loop && D.loop.stations.includes(n);
  // きっぷの情報。一周(from===to)は神田・秋葉原・御茶ノ水だけ
  function ticket(from, to, ic) {
    if (!ST[from] || !ST[to]) return null;
    if (from === to) return isLoopStation(from) ? { km: D.loop.km, fare: fareBy(D.loop.km, ic), loop: true } : null;
    const d = dists(from)[to]; if (!d) return null;
    return { km: f1(d[0]), fare: fareOf(d, ic), est: !d[1] && !d[3] && Math.ceil(d[0] - 1e-9) > 10, loop: false, band: bandOf(d[0], d[1] ? (ic ? D.fares.ic : D.fares.paper) : null) };
  }
  // 到着駅の候補(運賃のわかる駅を近い順に)
  function dests(from, ic) {
    const d = dists(from), out = [];
    for (const k in d) { if (k === from) continue; const f = fareOf(d[k], ic); if (f != null) out.push({ n: k, y: ST[k][0], km: f1(d[k][0]), fare: f }); }
    return out.sort((a, b) => a.km - b.km);
  }

  /* ===== 乗ったことのある区間 ===== */
  const hopKey = (s, h) => s * 1000 + h;
  function piecesOf(id) { // ルートの id → [[辺, どこから, どこまで]]
    const m = /^([^:]+):([^:]+):([\w.\-~]+)$/.exec(id || ''); if (!m) return null;
    const from = m[1], to = m[2], parts = m[3].split('.'), pcs = [];
    if (!ST[from] || !ST[to]) return null;
    for (let k = 0; k < parts.length; k++) { const tq = parts[k].split('~'), pk = tq[0], tg = tq.length > 1 ? +tq[1] : null;
      const rev = pk.endsWith('-'), s = segNo[rev ? pk.slice(0, -1) : pk]; if (s === undefined) return null;
      if (tg != null && !(tg >= 0 && tg < TR[s].length)) return null;
      const g = G[s]; let i0 = rev ? g.n : 0, i1 = rev ? 0 : g.n;
      if (k === 0 && !isNode(from)) { i0 = g.names.indexOf(from); if (i0 < 0) return null; }
      if (k === parts.length - 1 && !isNode(to)) { i1 = g.names.indexOf(to); if (i1 < 0) return null; }
      if (i0 === i1 || (i1 > i0) === rev) return null;
      pcs.push(tg == null ? [s, i0, i1] : [s, i0, i1, tg]); }
    return { from, to, pcs };
  }
  const idOf = (from, to, pcs) => from + ':' + to + ':' + pcs.map((p) => G[p[0]].id + (p[2] > p[1] ? '' : '-') + (p.length > 3 ? '~' + p[3] : '')).join('.');
  function riddenSet(ids) { const set = new Set(); (ids || []).forEach((id) => { const r = piecesOf(id); if (r) r.pcs.forEach((p) => { for (let h = Math.min(p[1], p[2]); h < Math.max(p[1], p[2]); h++) set.add(hopKey(p[0], h)); }); }); return set; }

  /* ===== 1本のルートを組み立てる(駅の重なり・折り返し・列車の割りあてを確かめる) ===== */
  function buildRoute(from, to, pcs, o) {
    o = o || {}; const banned = o.banned, loop = from === to;
    const mk = pcs.length > 0 && pcs.every((p) => p.length > 3), used = new Set(); // 末期モード: 駅は数えず、同じ線路を2回通らないことだけを見る
    const seq = [{ n: from, km: 0 }], hops = [], seen = new Set([from]), joint = {}; let km = 0, regM = 0, revisit = null; const regKm = {};
    for (let k = 0; k < pcs.length; k++) { const s = pcs[k][0], i0 = pcs[k][1], i1 = pcs[k][2], g = G[s], d = i1 > i0 ? 1 : -1;
      if (!g || g.names[i0] !== seq[seq.length - 1].n) return null;
      if (k) joint[seq.length - 1] = [pcs[k - 1][0], s];
      regM |= g.reg;
      for (let i = i0; i !== i1; i += d) { const nm = g.names[i + d], dk = Math.abs(g.kms[i + d] - g.kms[i]); km += dk;
        const last = k === pcs.length - 1 && i + d === i1;
        if (mk) { const tk = (s * 16 + pcs[k][3]) * 1000 + Math.min(i, i + d); if (used.has(tk)) return null; used.add(tk); } // 同じ線路を2回通る
        else if (seen.has(nm) && !(loop && last)) { if (last && PASSOK.has(nm)) revisit = nm; else return null; } // 同じ駅を2回通る(通過しただけの特例駅に最後に着くのは、列車を決めたあとで確かめる)
        seen.add(nm); hops.push({ s, h: Math.min(i, i + d), km: dk, g: mk ? pcs[k][3] : -1 }); seq.push({ n: nm, km });
        g.regNames.forEach((r) => { regKm[r] = (regKm[r] || 0) + dk; }); }
      if (!mk) for (const dn of g.deemed) { if (seen.has(dn)) return null; seen.add(dn); } } // みなし通過駅
    const H = hops.length; if (!H || seq[H].n !== to) return null;
    const deemedBy = [];
    for (const sm of mk ? [] : sames) { if (!sm.segs.every((s) => pcs.some((p) => p[0] === s && Math.abs(p[2] - p[1]) === G[s].n))) continue;
      for (const dn of sm.as) { if (seen.has(dn)) return null; seen.add(dn); } deemedBy.push(sm); } // 69条で同じ経路とみなす
    // 折り返しの特例
    joint[0] = [null, pcs[0][0]]; joint[H] = [pcs[pcs.length - 1][0], null];
    const turnAt = {};
    for (const j in mk ? {} : joint) { const X = seq[j].n, pv = joint[j][0], nx = joint[j][1];
      for (const t of turns) { if (t.at !== X || pv === t.toward || nx === t.toward || t.except.includes(pv) || t.except.includes(nx) || (t.only && !((pv == null || t.only.includes(pv)) && (nx == null || t.only.includes(nx))))) continue;
        const req = t.need.length > 0; if (req ? !(t.need.includes(pv) || t.need.includes(nx)) : (pv == null || nx == null)) continue;
        const clash = t.via.some((v) => seen.has(v));
        if (req) { if (clash) return null; turnAt[j] = { t, req: true }; } else if (!clash) turnAt[j] = { t, req: false }; } }
    // 列車の割りあて: 乗換がいちばん少なく、同じなら早い組みあわせ
    const opt = hops.map((hp) => G[hp.s].hops[hp.h].filter((e) => !(banned && banned[e[0]]) && !(o.noRare && e[1] <= 1) && (hp.g < 0 || inTr(hp.s, hp.g, e[0]))));
    if (revisit) { let first = -1; for (let j = 0; j < H; j++) if (seq[j].n === revisit) { first = j; break; }
      if (first < 1) return null; // 最初の1回は、停まらずに通りすぎていなければならない
      for (const h of [first - 1, first]) opt[h] = opt[h].filter((e) => skip[e[0]].has(revisit)); }
    const INF = 1e12, cost = [], back = [], XP = o.fast ? 5 : 10000; // 乗換1回の重み。速い列車を優先するときは5分ぶん
    for (let h = 0; h < H; h++) { if (!opt[h].length) return null; cost.push(new Array(opt[h].length).fill(INF)); back.push(new Array(opt[h].length).fill(-1));
      const stn = seq[h].n, free = !!turnAt[h]; // 折り返しの特例がある駅は、通過する列車でも先の駅で乗り換えられる
      opt[h].forEach((e, x) => { const tm = hops[h].km / SV[svcIds[e[0]]].v * 60;
        if (h === 0) { if (free || !skip[e[0]].has(stn)) cost[0][x] = tm; return; }
        opt[h - 1].forEach((p, y) => { const c0 = cost[h - 1][y]; if (c0 >= INF) return; let c;
          if (p[0] === e[0]) c = c0 + tm; else if (free || (!skip[p[0]].has(stn) && !skip[e[0]].has(stn))) c = c0 + XP + tm; else return;
          if (c < cost[h][x]) { cost[h][x] = c; back[h][x] = y; } }); }); }
    let bx = -1, bc = INF; const endFree = !!turnAt[H];
    opt[H - 1].forEach((e, x) => { if ((endFree || !skip[e[0]].has(to)) && cost[H - 1][x] < bc) { bc = cost[H - 1][x]; bx = x; } });
    if (bx < 0) return null; // 乗り継げる列車がない
    const pick = new Array(H); for (let h = H - 1; h >= 0; h--) { pick[h] = opt[h][bx]; bx = back[h][bx]; }
    if (mk) { const stopAt = new Set(); // 末期モード: 列車が停まる駅は1回だけ(停まらずに通りすぎる駅は数えない)
      for (let h = 0; h <= H; h++) { const n = seq[h].n, st = h === 0 || h === H || (h > 0 && !skip[pick[h - 1][0]].has(n)) || (h < H && !skip[pick[h][0]].has(n));
        if (!st) continue; if (stopAt.has(n) && !(loop && h === H)) return null; stopAt.add(n); } }
    // 列車ごとにまとめる
    const legs = [], stops = [[from, 0]], legSvc = []; let h0 = 0;
    const noteOf = (j) => { const u = turnAt[j]; if (!u) return ''; const t = u.t;
      const X = seq[j].n, skips = (j > 0 && skip[pick[j - 1][0]].has(X)) || (j < H && skip[pick[j][0]].has(X)); // 乗る列車がこの駅を通過する
      if (!u.req && skips && j > 0 && j < H) return '列車が' + t.at + 'に停まらないので、' + t.to + 'で乗り換えて折り返す（折り返し可・' + t.law + '）';
      if (!u.req && skips) return t.at + 'には停まらない列車。' + (j === 0 ? '先に' + t.to + 'へ出て乗る' : t.to + 'まで行って戻る') + '（折り返し可・' + t.law + '）';
      if (!u.req) return t.at + 'で乗り換え。' + t.to + 'まで乗って折り返してもよい（折り返し可・' + t.law + '）';
      if (+j === 0) return t.at + 'には停まらない列車。先に' + t.to + 'へ出て乗る（折り返し可・' + t.law + '）';
      if (+j === H) return t.at + 'には停まらない列車。' + t.to + 'まで行って戻る（折り返し可・' + t.law + '）';
      return '列車が' + t.at + 'に停まらないので、' + t.to + 'で乗り換えて折り返す（折り返し可・' + t.law + '）'; };
    const extraOf = (j) => { const u = turnAt[j]; if (!u || !u.req) return 0; const a = ST[u.t.at], b = ST[u.t.to]; return Math.round(Math.hypot((a[1] - b[1]) * KY, (a[2] - b[2]) * KX) * 1.15 * 2 / 45 * 60); };
    let rare = false;
    for (let h = 1; h <= H; h++) { if (h < H && pick[h][0] === pick[h0][0]) continue;
      const sv = pick[h0][0], S = SV[svcIds[sv]]; let mins = 0, tph = 99; for (let x = h0; x < h; x++) { mins += hops[x].km / S.v * 60; tph = Math.min(tph, pick[x][1]); }
      mins = Math.max(2, Math.round(mins)) + extraOf(h0) + (h === H ? extraOf(H) : 0);
      const u = turnAt[h], name = h < H && u && u.req ? u.t.to : seq[h].n, o2 = { tph };
      if (tph <= 1) { o2.rare = true; o2.warn = '1時間に1本ほど。発車時刻を先に調べておく'; rare = true; }
      if (S.warn) o2.warn = (o2.warn ? o2.warn + '。' : '') + S.warn;
      if (seq[h0].n === '浜川崎' && h0 > 0) o2.warn = (o2.warn ? o2.warn + '。' : '') + '浜川崎は改札の外で乗り換え。ICカードは簡易改札機にタッチしない';
      legs.push([S.n, name + '方面', mins, S.c, pathD(seq.slice(h0, h + 1).map((x) => x.n)), o2]); legSvc.push(sv);
      const st = [name, f1(seq[h].km)]; if (h === H && noteOf(H)) st.push(noteOf(H)); else if (h < H && noteOf(h)) st.push(noteOf(h)); stops.push(st); h0 = h; }
    if (noteOf(0)) stops[0].push(noteOf(0));
    const regs = D.regions.filter((r) => regM & regBit[r]), top = regs.slice().sort((a, b) => regKm[b] - regKm[a]);
    const title = regs.length >= 5 ? '関東をひとまわり。' : regs.length === 0 ? '都心をぐるり。' : regs.length === 1 ? regs[0] + 'をぐるり。' : top[0] + 'と' + top[1] + 'をぐるり。';
    const mid = stops.slice(1, -1).map((s) => s[0]);
    const passed = seq.map((x) => x.n); deemedBy.forEach((sm) => sm.as.forEach((v) => passed.push(v))); Object.keys(turnAt).forEach((j) => { if (turnAt[j].req) turnAt[j].t.via.forEach((v) => passed.push(v)); });
    return { id: idOf(from, to, pcs), mk, from, to, loop, km: f1(km), title, via: (mid.length > 6 ? mid.slice(0, 6).concat('ほか') : mid).join('・') || '乗換なし', regions: regs, stops, legs,
      rare, passed, hopKeys: hops.map((hp) => hopKey(hp.s, hp.h)), hopKm: hops.map((hp) => hp.km), hopSt: seq.map((x) => x.n), pcs, lines: legs.map((l) => l[0]) };
  }
  function routeById(id, o) { const r = piecesOf(id); return r ? buildRoute(r.from, r.to, r.pcs, o) : null; }

  /* ===== さがす =====
     c: { ic, win(使える分), len(0:〜100km 1:〜300km 2:300km〜 3:最長), xfer, xmin, meal, rare, want, avoid, mustLine, noLine, mustSt, noSt, prev }
     分岐駅を1回ずつしか通らない道をしらみつぶしにたどる。数百万通りあるので、条件に合わなくなった枝(長すぎる・乗換が多すぎる・時間に収まらない)は
     その場で切り、長い辺(8km以上)の組みあわせが同じものは点数のいちばん高い1本だけ残す。 */
  const STEP_LIMIT = 8000000, KEEP = 8;
  // 2つの辺を同じ列車で通りぬけ、その列車が駅Xに停まらないか(160条の4の特例駅を「通過しただけ」にできるか)
  const thruCache = new Map();
  function thruSkip(s1, s2, X) { const key = s1 * 100000 + s2 * 100 + (nodeNo[X] || 0); let v = thruCache.get(key); if (v !== undefined) return v;
    const all = (s) => { let set = null; for (const hs of G[s].hops) { const ids = new Set(hs.map((e) => e[0])); set = set ? new Set([...set].filter((x) => ids.has(x))) : ids; } return set || new Set(); };
    const a = all(s1), b = all(s2); v = false; for (const id of a) if (b.has(id) && skip[id].has(X)) { v = true; break; } thruCache.set(key, v); return v; }
  function search(from, to, c, riddenIds) {
    const tk = ticket(from, to, c.ic); if (!tk || !(c.win > 0)) return { routes: [], partial: false };
    const loop = from === to; if (loop && c.ic) return { routes: [], partial: false }; // 一周は紙のきっぷだけ
    // 使えない系統・辺
    const banned = svcIds.map((k) => (c.noLine || []).includes(SV[k].n)), noSt = new Set(c.noSt || []), avoidM = (c.avoid || []).reduce((m, r) => m | regBit[r], 0);
    const ridden = c.prev ? riddenSet(riddenIds) : new Set(), pen = c.prev === 2 ? 2 : c.prev === 1 ? 0.5 : 0;
    // 辺の一部(i0→i1)を使えるか、使えるなら その長さ・最短の分・系統の集まり・点数
    function part(s, i0, i1, tg) { const g = G[s], lo = Math.min(i0, i1), hi = Math.max(i0, i1); let mins = 0, m0 = 0, m1 = 0, km = 0, rk = 0;
      if (g.reg & avoidM) return null;
      for (let i = lo; i <= hi; i++) if (noSt.has(g.names[i]) && g.names[i] !== from && g.names[i] !== to) return null;
      for (let h = lo; h < hi; h++) { let v = 0; for (const e of g.hops[h]) { if (banned[e[0]] || (!c.rare && e[1] <= 1) || (tg != null && !inTr(s, tg, e[0]))) continue; v = Math.max(v, SV[svcIds[e[0]]].v); if (e[0] < 32) m0 |= 1 << e[0]; else m1 |= 1 << (e[0] - 32); }
        if (!v) return null; const dk = g.kms[h + 1] - g.kms[h]; km += dk; mins += dk / v * 60; if (ridden.has(hopKey(s, h))) rk += dk; }
      return { km, mins, m0, m1, sc: km - pen * rk, reg: g.reg }; }
    const full = G.map((g) => part(g.i, 0, g.n));
    // 長い辺の組みあわせで仲間分けする
    const thr = c.len === 0 ? 3 : 8, cls = new Array(G.length).fill(-1);
    G.map((g) => g).filter((g) => g.len >= thr).sort((a, b) => b.len - a.len).slice(0, 52).forEach((g, i) => { cls[g.i] = i; });
    const maxKm = c.len === 0 ? 100 : c.len === 1 ? 300 : Infinity, minKm = Math.max(tk.km + 0.05, c.len === 2 ? 300 : 0);
    const maxLegs = c.xfer + 1, base = c.meal ? 30 : 0, wantM = (c.want || []).reduce((m, r) => m | regBit[r], 0);
    const T = isNode(to) ? nodeNo[to] : -1, tSeg = T < 0 ? stSeg[to][0] : null, sSeg = isNode(from) ? null : stSeg[from][0];
    const vis = new Uint8Array(NN), stack = [], best = new Map(), limit = c.budget || STEP_LIMIT; let steps = 0, partial = false;
    let tPass = false; // 到着駅を、すでに停まらずに通りぬけた(最後にもう一度着いてもよい)
    const passMode = isNode(to) && PASSOK.has(to) && !loop;
    const endAt = nodeNames.map(() => null); // その分岐駅から到着駅へ入る最後のひと区間
    if (tSeg) { const g = G[tSeg[0]]; [[g.a, 0], [g.b, g.n]].forEach((x) => { const p = part(tSeg[0], x[1], tSeg[1]); if (p) endAt[x[0]] = { pc: [tSeg[0], x[1], tSeg[1]], p }; }); }
    // かならず通る駅があるときは、その駅を通る道だけを残す(あとでしぼると、同じ仲間の別の道に負けて消えてしまうため)
    const mustN = c.mustSt || [], passAll = (pcs) => { const seen = new Set(); pcs.forEach((p) => { const g = G[p[0]]; for (let i = Math.min(p[1], p[2]); i <= Math.max(p[1], p[2]); i++) seen.add(g.names[i]); }); return mustN.every((n) => seen.has(n)); };
    function record(km, mins, legs, sc, reg, k0, k1, endPc) {
      if (km < minKm || km > maxKm || (reg & wantM) !== wantM || mins + (legs - 1) * c.xmin + base > c.win) return;
      if (mustN.length && !passAll(endPc ? stack.concat([endPc]) : stack)) return; // かならず通る駅を通らない
      const key = k1 * 67108864 + k0, b = best.get(key);
      if (!b || sc > b.sc) best.set(key, { sc, km, pcs: endPc ? stack.concat([endPc]) : stack.slice() });
    }
    // x:いまいる分岐駅 km:ここまでの距離 mins:最短の分 legs:列車の本数の下限 m0,m1:いまの列車でありうる系統 sc:点数 reg:方面 k0,k1:仲間分けのしるし
    function dfs(x, km, mins, legs, m0, m1, sc, reg, k0, k1) {
      if (steps > limit) { partial = true; return; }
      const en = endAt[x];
      if (en && !(sSeg && sSeg[0] === tSeg[0] && stack.length === 1)) { const p = en.p; let l = legs; if (!(m0 & p.m0) && !(m1 & p.m1)) l++; if (l <= maxLegs) record(km + p.km, mins + p.mins, l, sc + p.sc, reg | p.reg, k0, k1, en.pc); }
      for (const e of adj[x]) { steps++; const s = e[0], y = e[2], p = full[s];
        if (!p || (sSeg && s === sSeg[0]) || (tSeg && s === tSeg[0])) continue;
        const fin = y === T; if (vis[y] && !(fin && loop && stack.length >= 2) && !(fin && tPass)) continue;
        if (x === T && passMode && !thruSkip(stack[stack.length - 1][0], s, to)) continue; // 到着駅を通りぬけるときは、停まらない列車で
        const nk = km + p.km; if (nk > maxKm) continue;
        let l = legs, a0 = m0 & p.m0, a1 = m1 & p.m1; if (!a0 && !a1) { l++; a0 = p.m0; a1 = p.m1; } if (l > maxLegs) continue;
        const nm = mins + p.mins; if (nm + (l - 1) * c.xmin + base > c.win) continue;
        const ci = cls[s], c0 = ci >= 0 && ci < 26 ? k0 | (1 << ci) : k0, c1 = ci >= 26 ? k1 | (1 << (ci - 26)) : k1;
        stack.push([s, e[1] > 0 ? 0 : G[s].n, e[1] > 0 ? G[s].n : 0]);
        if (fin) { record(nk, nm, l, sc + p.sc, reg | p.reg, c0, c1, null);
          if (passMode && !vis[y] && !tPass) { vis[y] = 1; tPass = true; dfs(y, nk, nm, l, a0, a1, sc + p.sc, reg | p.reg, c0, c1); tPass = false; vis[y] = 0; } } // 到着駅を停まらずに通りぬけて、先へ進む道
        else { vis[y] = 1; dfs(y, nk, nm, l, a0, a1, sc + p.sc, reg | p.reg, c0, c1); vis[y] = 0; }
        stack.pop(); }
    }
    (c.noSt || []).forEach((n) => { if (isNode(n) && n !== from && n !== to) vis[nodeNo[n]] = 1; });
    if (sSeg) { const g = G[sSeg[0]]; [[g.a, 0], [g.b, g.n]].forEach((x) => { const p = part(sSeg[0], sSeg[1], x[1]); if (!p || vis[x[0]]) return;
        if (tSeg && tSeg[0] === sSeg[0] && (x[1] === 0) === (tSeg[1] < sSeg[1])) return; // 到着駅を通りすぎる向き
        vis[x[0]] = 1; stack.push([sSeg[0], sSeg[1], x[1]]); dfs(x[0], p.km, p.mins, 1, p.m0, p.m1, p.sc, p.reg, 0, 0); stack.pop(); vis[x[0]] = 0; }); }
    else { vis[nodeNo[from]] = 1; dfs(nodeNo[from], 0, 0, 0, 0, 0, 0, 0, 0, 0); }
    if (c.mk) return searchMk(); // 末期モード: ふつうの大回りに、線路だけを見たルートを足す
    return pickRoutes();
    /* 末期モード: 駅は何回通ってもよく、同じ線路(辺×線路の組)を2回通らない道をたどる。到着駅も途中で通ってよい */
    function searchMk() {
      const fullT = G.map((g) => TR[g.i].map((_, k) => part(g.i, 0, g.n, k))), used = new Uint8Array(G.length * 16);
      const endT = nodeNames.map(() => []);
      if (tSeg) { const g = G[tSeg[0]]; [[g.a, 0], [g.b, g.n]].forEach((x) => TR[tSeg[0]].forEach((_, k) => { const p = part(tSeg[0], x[1], tSeg[1], k); if (p) endT[x[0]].push({ pc: [tSeg[0], x[1], tSeg[1], k], p }); })); }
      // 到着駅までの最短の距離(これを足して長さの上限をこえる枝は切る)
      const dT = new Float64Array(NN).fill(Infinity), dn = new Uint8Array(NN);
      if (T >= 0) dT[T] = 0; else endT.forEach((l, x) => l.forEach((en) => { dT[x] = Math.min(dT[x], en.p.km); }));
      for (;;) { let u = -1; for (let i = 0; i < NN; i++) if (!dn[i] && dT[i] < Infinity && (u < 0 || dT[i] < dT[u])) u = i; if (u < 0) break; dn[u] = 1;
        for (const e of adj[u]) if (!(tSeg && e[0] === tSeg[0]) && dT[u] + G[e[0]].len < dT[e[2]]) dT[e[2]] = dT[u] + G[e[0]].len; }
      // 分岐駅ごとに、そこを通過する系統(乗り換えられない)
      const sk0 = new Int32Array(NN), sk1 = new Int32Array(NN);
      nodeNames.forEach((n, x) => svcIds.forEach((_, v) => { if (skip[v].has(n)) { if (v < 32) sk0[x] |= 1 << v; else sk1[x] |= 1 << (v - 32); } }));
      const limMk = c.budget || 1500000; let lim2 = limMk, AD = adj; steps = 0; const stopV = new Uint8Array(NN); if (!sSeg) stopV[nodeNo[from]] = 1; // 何回かに分けて、分岐駅で試す順番を変えてたどる(1回だと最初の方面ばかりになるため)
      // まだ到着駅まで行けるか(停まった駅・使った線路を除いてたどる)。行けない枝は切る
      const isEnd = new Uint8Array(NN); if (T >= 0) isEnd[T] = 1; endT.forEach((l, x) => { if (l.length) isEnd[x] = 1; });
      const rv = new Int32Array(NN); let rvGen = 0; const q = new Int32Array(NN);
      function reach(x) { if (isEnd[x]) return true; rvGen++; let h = 0, t = 0; q[t++] = x; rv[x] = rvGen;
        while (h < t) { const u = q[h++];
          for (const e of adj[u]) { const s = e[0], y = e[2]; if (rv[y] === rvGen || (sSeg && s === sSeg[0]) || (tSeg && s === tSeg[0])) continue;
            let ok = false; for (let k = 0; k < TR[s].length && !ok; k++) { const p = fullT[s][k]; if (p && !used[s * 16 + k] && (!stopV[y] || (p.m0 & sk0[y]) || (p.m1 & sk1[y]))) ok = true; }
            if (!ok) continue; if (isEnd[y] && !stopV[y]) return true; rv[y] = rvGen; q[t++] = y; } }
        return false; }
      function dfsT(x, km, mins, legs, m0, m1, sc, reg, k0, k1) {
        if (steps > lim2) { partial = true; return; }
        if (!reach(x)) return;
        for (const en of endT[x]) { if (sSeg && sSeg[0] === tSeg[0] && stack.length === 1) break; const p = en.p; let l = legs; if (!(m0 & p.m0) && !(m1 & p.m1)) l++; if (l <= maxLegs) record(km + p.km, mins + p.mins, l, sc + p.sc, reg | p.reg, k0, k1, en.pc); }
        for (const e of AD[x]) { const s = e[0], y = e[2];
          if ((sSeg && s === sSeg[0]) || (tSeg && s === tSeg[0])) continue;
          if (stack.length && stack[stack.length - 1][0] === s) continue; // となりの線路ですぐ引き返すのはなし
          if (km + G[s].len + dT[y] > maxKm) continue;
          for (let k = 0; k < TR[s].length; k++) { steps++; const p = fullT[s][k]; if (!p || used[s * 16 + k]) continue;
            const nk = km + p.km; if (nk > maxKm) continue;
            let l = legs, a0 = m0 & p.m0, a1 = m1 & p.m1;
            if (!a0 && !a1) { if (legs && !((m0 & ~sk0[x]) | (m1 & ~sk1[x]) && (p.m0 & ~sk0[x]) | (p.m1 & ~sk1[x]))) continue; // ここに停まらないので乗り換えられない
              l++; a0 = p.m0; a1 = p.m1; } if (l > maxLegs) continue;
            const nm = mins + p.mins; if (nm + (l - 1) * c.xmin + base > c.win) continue;
            const ci = cls[s], c0 = ci >= 0 && ci < 26 ? k0 | (1 << ci) : k0, c1 = ci >= 26 ? k1 | (1 << (ci - 26)) : k1;
            const allStop = !(p.m0 & sk0[y]) && !(p.m1 & sk1[y]); // この線路の列車はみな y に停まる
            if (allStop && stopV[y] && !(y === T && loop)) continue; // 停まる駅は1回だけ
            stack.push([s, e[1] > 0 ? 0 : G[s].n, e[1] > 0 ? G[s].n : 0, k]); used[s * 16 + k] = 1;
            if (y === T) record(nk, nm, l, sc + p.sc, reg | p.reg, c0, c1, null);
            if (!(y === T && allStop)) { if (allStop) stopV[y]++; dfsT(y, nk, nm, l, a0, a1, sc + p.sc, reg | p.reg, c0, c1); if (allStop) stopV[y]--; } // 到着駅は停まらずに通るときだけ先へ
            used[s * 16 + k] = 0; stack.pop(); } }
      }
      const PASS = 6; let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
      for (let ps = 0; ps < PASS; ps++) { lim2 = Math.round(limMk * (ps + 1) / PASS);
        if (ps) AD = adj.map((a) => a.map((e) => [e, G[e[0]].len * (0.3 + rnd())]).sort((p, q) => q[1] - p[1]).map((x) => x[0]));
        if (sSeg) { const g = G[sSeg[0]]; [[g.a, 0], [g.b, g.n]].forEach((x) => TR[sSeg[0]].forEach((_, k) => { const p = part(sSeg[0], sSeg[1], x[1], k); if (!p) return;
            if (tSeg && tSeg[0] === sSeg[0] && (x[1] === 0) === (tSeg[1] < sSeg[1])) return;
            stack.push([sSeg[0], sSeg[1], x[1], k]); dfsT(x[0], p.km, p.mins, 1, p.m0, p.m1, p.sc, p.reg, 0, 0); stack.pop(); })); }
        else dfsT(nodeNo[from], 0, 0, 0, 0, 0, 0, 0, 0, 0); }
      return pickRoutes();
    }
    function pickRoutes() {
    // 点数の高い順に、列車を割りあてて確かめ、似ていないものを選ぶ
    const cand = Array.from(best.values()).sort((a, b) => b.sc - a.sc), out = [], want = c.len === 3 ? 1 : KEEP;
    let tried = 0;
    for (const cd of cand) { if (out.length >= want || tried++ > 600) break;
      let r = buildRoute(from, to, cd.pcs, { banned, noRare: !c.rare, fast: c.fast }); if (!r) continue;
      if (!c.fast && r.legs.length - 1 > c.xfer) continue; // 速い列車を優先するときは、速くするための乗換は回数に数えない(乗換の少ない組みかたで判定)
      if (c.fast) { const r0 = buildRoute(from, to, cd.pcs, { banned, noRare: !c.rare }); if (!r0 || r0.legs.length - 1 > c.xfer) continue; }
      if (r.legs.reduce((a, l) => a + l[2], 0) + (r.legs.length - 1) * c.xmin + base > c.win) continue;
      if ((c.mustLine || []).some((n) => !r.lines.includes(n)) || (c.mustSt || []).some((n) => !r.passed.includes(n))) continue;
      const ks = new Set(r.hopKeys); let dup = false;
      for (const q of out) { let sh = 0; q.hopKeys.forEach((k, i) => { if (ks.has(k)) sh += q.hopKm[i]; }); if (sh / Math.min(q.km, r.km) > 0.72) { dup = true; break; } }
      if (!dup) out.push(r); }
    out.sort((a, b) => b.km - a.km);
    return { routes: out, partial };
    }
  }

  /* ===== ふつうの乗りかた(いちばん短い道のり) =====
     券売機モードの「経路の組み合わせ」用。駅ごとの短い道を順にためし(k番目までの最短路)、
     辺ごとに区切って buildRoute(乗れる列車があるか・同じ駅を2回通らないか)が通った最初の道を返す */
  function sp(from, to, banE, banN) { // 駅をたどる最短路(二分ヒープ)
    const dist = { [from]: 0 }, prev = {}, done = new Set(), hp = [[0, from]];
    const push = (x) => { hp.push(x); let i = hp.length - 1; while (i) { const q = (i - 1) >> 1; if (hp[q][0] <= hp[i][0]) break; [hp[q], hp[i]] = [hp[i], hp[q]]; i = q; } };
    const pop = () => { const top = hp[0], last = hp.pop(); if (hp.length) { hp[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hp.length && hp[l][0] < hp[m][0]) m = l; if (r < hp.length && hp[r][0] < hp[m][0]) m = r; if (m === i) break; [hp[m], hp[i]] = [hp[i], hp[m]]; i = m; } } return top; };
    while (hp.length) { const [d, u] = pop(); if (done.has(u)) continue; if (u === to) break; done.add(u);
      for (const e of nbr[u] || []) { const v = e[0]; if (banN && banN.has(v)) continue; if (banE && banE.has(u + '|' + v)) continue;
        const nd = d + e[1]; if (dist[v] === undefined || nd < dist[v] - 1e-9) { dist[v] = nd; prev[v] = u; push([nd, v]); } } }
    if (dist[to] === undefined) return null;
    const path = [to]; while (path[0] !== from) path.unshift(prev[path[0]]);
    return { path, d: dist[to] };
  }
  const edgeKm = (a, b) => { let m = Infinity; for (const e of nbr[a]) if (e[0] === b && e[1] < m) m = e[1]; return m; };
  function toPcs(path) { // 駅の並び → 辺の区間
    const pcs = [];
    for (let i = 0; i + 1 < path.length; i++) { const a = path[i], b = path[i + 1]; let hit = null;
      const last = pcs[pcs.length - 1];
      if (last) { const g = G[last[0]], j = last[2], d = last[2] > last[1] ? 1 : -1; if (g.names[j] === a && g.names[j + d] === b) { last[2] = j + d; continue; } }
      for (const sj of stSeg[a]) { const g = G[sj[0]]; if (g.names[sj[1] + 1] === b) { hit = [sj[0], sj[1], sj[1] + 1]; break; } if (g.names[sj[1] - 1] === b) { hit = [sj[0], sj[1], sj[1] - 1]; break; } }
      if (!hit) return null; pcs.push(hit); }
    return pcs;
  }
  const plainMemo = {};
  // 候補の道(短い順)のうち、距離がいちばん短い道の1.15倍(+2km)までで、乗換がいちばん少なく、同じなら早いもの
  function plain(from, to) {
    if (!ST[from] || !ST[to] || from === to) return null;
    const key = from + '>' + to; if (key in plainMemo) return plainMemo[key];
    const tryPath = (path) => { const pcs = toPcs(path); return pcs ? buildRoute(from, to, pcs) : null; };
    const first = sp(from, to); if (!first) return (plainMemo[key] = null);
    let best = null, lim = Infinity;
    const consider = (p) => { const r = tryPath(p.path); if (!r) return;
      if (lim === Infinity) lim = p.d * 1.15 + 2;
      if (!best || r.legs.length < best.legs.length || (r.legs.length === best.legs.length && rideMins(r) < rideMins(best))) best = r; };
    consider(first);
    // Yen の方法で、次に短い道を順に出してためす
    const A = [first], B = [], seenP = new Set([first.path.join('|')]);
    for (let k = 1; k < 40; k++) { const prevP = A[k - 1].path;
      for (let i = 0; i + 1 < prevP.length; i++) { const spur = prevP[i], root = prevP.slice(0, i + 1);
        const banE = new Set(), banN = new Set(root.slice(0, -1));
        for (const p of A) if (p.path.length > i && p.path.slice(0, i + 1).join('|') === root.join('|')) { banE.add(p.path[i] + '|' + p.path[i + 1]); banE.add(p.path[i + 1] + '|' + p.path[i]); }
        const s2 = sp(spur, to, banE, banN); if (!s2) continue;
        const path = root.slice(0, -1).concat(s2.path), id = path.join('|'); if (seenP.has(id)) continue; seenP.add(id);
        let d = 0; for (let j = 0; j + 1 < path.length; j++) d += edgeKm(path[j], path[j + 1]);
        B.push({ path, d }); }
      if (!B.length) break;
      B.sort((x, y) => x.d - y.d); const nx = B.shift();
      if (nx.d > lim || (best && best.legs.length === 1)) break;
      A.push(nx); consider(nx); }
    return (plainMemo[key] = best);
  }

  /* ===== 自分でルートを作る =====
     from から pcs(これまでにつないだ区間)の続きとして、次に行ける分岐駅(cands)と、降りられる駅(ends)を返す。
     cands は ok=false のとき why に理由。ルールの判定は buildRoute(同じ駅・69条・折り返し・乗れる列車)にまかせる */
  const svcNamesOf = (s) => { const out = []; G[s].hops.forEach((h) => h.forEach((e) => { const n = SV[svcIds[e[0]]].n; if (!out.includes(n)) out.push(n); })); return out; };
  const pcPath = (pc) => { const g = G[pc[0]], lo = Math.min(pc[1], pc[2]), hi = Math.max(pc[1], pc[2]); return pathD(g.names.slice(lo, hi + 1)); }; // 区間の線
  function steps(from, pcs, ic) {
    if (!ST[from]) return null;
    pcs = pcs || [];
    const last = pcs[pcs.length - 1], at = last ? G[last[0]].names[last[2]] : from;
    const cur = pcs.length ? buildRoute(from, at, pcs) : null;
    if (pcs.length && !cur) return null;
    const seen = new Set(cur ? cur.passed : [from]);
    let opts;
    if (!pcs.length && !isNode(from)) { const sj = stSeg[from][0]; opts = [[sj[0], sj[1], 0], [sj[0], sj[1], G[sj[0]].n]].filter((o) => o[1] !== o[2]); }
    else opts = adj[nodeNo[at]].map((e) => [e[0], e[1] > 0 ? 0 : G[e[0]].n, e[1] > 0 ? G[e[0]].n : 0]).filter((o) => !last || o[0] !== last[0]);
    const cands = [], ends = [];
    const tk = (n) => { const t = ticket(from, n, !!ic); return t && t.fare != null ? t : null; };
    const push = (e, t) => { if (e.km > t.km + 0.05) ends.push(e); }; // いちばん短い道のりと同じなら大回りではないので出さない
    if (cur && at !== from) { const t = tk(at); if (t) push({ pcs: pcs.slice(), n: at, fare: t.fare, km: cur.km, here: true }, t); }
    for (const o of opts) {
      const g = G[o[0]], d = o[2] > o[1] ? 1 : -1, to = g.names[o[2]];
      let dup = null;
      for (let i = o[1] + d; ; i += d) { const nm = g.names[i];
        if (seen.has(nm) && !(nm === to && PASSOK.has(nm))) { dup = nm; break; }
        if (nm !== to) { const t = tk(nm); if (t) { const p2 = pcs.concat([[o[0], o[1], i]]), r2 = buildRoute(from, nm, p2); if (r2) push({ pcs: p2, n: nm, fare: t.fare, km: r2.km }, t); } }
        if (i === o[2]) break; }
      const pc = [o[0], o[1], o[2]], km = f1(Math.abs(g.kms[o[2]] - g.kms[o[1]])), lines = svcNamesOf(o[0]);
      if (dup) { cands.push({ pc, to, km, lines, line: g.line, ok: false, why: dup + 'をもう通っている' }); continue; }
      const r2 = buildRoute(from, to, pcs.concat([pc]));
      if (!r2) { cands.push({ pc, to, km, lines, line: g.line, ok: false, why: '乗り継げる列車がないか、決まりに合わない(69条・折り返しなど)' }); continue; }
      cands.push({ pc, to, km, lines, line: g.line, ok: true });
      const t = tk(to); if (t) push({ pcs: pcs.concat([pc]), n: to, fare: t.fare, km: r2.km }, t);
    }
    cands.sort((a, b) => b.ok - a.ok || b.km - a.km);
    return { at, route: cur, cands, ends };
  }

  /* ===== 画面からの入り口 =====
     アプリ(index.html)も券売機モード(kiosk.html)も、条件をこの形で渡してここからさがす。表示のしかたが違うだけで、探しかたは同じ。
     c: { from, to, ic, start:'HH:MM', end:'HH:MM', len, xfer, xmin, meal, rare, want, avoid, mustLine, noLine, mustSt, noSt, prev } */
  const hm = (t) => { const m = /^(\d\d):(\d\d)$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : NaN; };
  function find(c, riddenIds, budget) { return search(c.from, c.to, Object.assign({}, c, { win: hm(c.end) - hm(c.start), budget }), riddenIds); }
  // 所要時間のめやす(分)。乗っている時間+乗換の時間(+食事30分)
  const rideMins = (r) => r.legs.reduce((a, l) => a + l[2], 0);
  const spanMins = (r, c) => { const b = rideMins(r) + (r.legs.length - 1) * c.xmin; return [b, b + (c.meal ? 30 : 0)]; };

  // 前に乗ったルートと重なる区間
  function overlap(r, riddenIds) {
    const set = riddenSet((riddenIds || []).filter((id) => id !== r.id)), out = []; let a = -1, km = 0;
    r.hopKeys.forEach((k, i) => { const hit = set.has(k); if (hit) km += r.hopKm[i]; if (hit && a < 0) a = i; if (!hit && a >= 0) { out.push(r.hopSt[a] + '〜' + r.hopSt[i]); a = -1; } });
    if (a >= 0) out.push(r.hopSt[a] + '〜' + r.hopSt[r.hopSt.length - 1]);
    return { list: out, km };
  }
  const greenFee = (km, suica) => { const b = D.green.fee.find((x) => Math.ceil(km - 1e-9) <= x[0]) || D.green.fee[D.green.fee.length - 1]; return suica ? b[2] : b[1]; };
  const hasGreen = (svcName) => D.green.svc.includes(svcName);
  /* ===== 乗りつぶし: 「このルートに乗った」の区間を合わせて、路線ごとに何km乗ったか ===== */
  function coverage(riddenIds) {
    const set = riddenSet(riddenIds), lines = {}, ds = []; let km = 0, all = 0;
    G.forEach((g) => { const L = (lines[g.line] = lines[g.line] || { line: g.line, km: 0, all: 0 }); let a = -1;
      for (let h = 0; h <= g.n; h++) { const hit = h < g.n && set.has(hopKey(g.i, h));
        if (h < g.n) { const d = g.kms[h + 1] - g.kms[h]; L.all += d; all += d; if (hit) { L.km += d; km += d; } }
        if (hit && a < 0) a = h; if (!hit && a >= 0) { ds.push(pathD(g.names.slice(a, h + 1))); a = -1; } } });
    const list = Object.values(lines).map((l) => ({ line: l.line, km: f1(l.km), all: f1(l.all) })).sort((x, y) => y.km / y.all - x.km / x.all || y.all - x.all);
    return { km: f1(km), all: f1(all), d: ds.join(''), lines: list };
  }
  function nearest(lat, lng, k) { return Object.keys(ST).map((n) => [n, Math.hypot((ST[n][1] - lat) * KY, (ST[n][2] - lng) * KX)]).sort((a, b) => a[1] - b[1]).slice(0, k).map((x) => ({ n: x[0], km: f1(x[1]) })); }
  const seenLine = new Set(), lineOpts = []; svcIds.forEach((k) => { if (!seenLine.has(SV[k].n)) { seenLine.add(SV[k].n); lineOpts.push({ n: SV[k].n, c: SV[k].c }); } });
  const stations = Object.keys(ST).map((n) => ({ n, y: ST[n][0] }));
  return { data: D, stations, nodes: nodeNames.slice(), lineOpts, netPath, xy, ll: (n) => (ST[n] ? [ST[n][1], ST[n][2]] : null), has: (n) => !!ST[n], isNode, isLoopStation,
    ticket, dests, search, find, plain, steps, pcPath, rideMins, spanMins, routeById, buildRoute, overlap, nearest, coverage, greenFee, hasGreen, piecesOf };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { create };
else root.OOMAWARI = create(root.OOMAWARI_DATA);
})(typeof self !== 'undefined' ? self : this);
