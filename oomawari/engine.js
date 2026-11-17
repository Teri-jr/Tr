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
  const turns = D.turns.map((t) => ({ at: t.at, to: t.to, via: t.via, law: t.law, toward: segNo[t.toward[0]], need: t.need.map((x) => segNo[x]) }));

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
  const distCache = {};
  function dists(from) { // いちばん短い道のり。{駅: [km, 幹線だけで行けるか]}
    if (distCache[from]) return distCache[from];
    const dist = {}, done = new Set(); dist[from] = [0, 1];
    for (;;) { let u = null, best = Infinity; for (const k in dist) if (!done.has(k) && dist[k][0] < best) { best = dist[k][0]; u = k; }
      if (u === null) break; done.add(u);
      for (const e of nbr[u]) { const nd = best + e[1]; if (!dist[e[0]] || nd < dist[e[0]][0] - 1e-9) dist[e[0]] = [nd, dist[u][1] && e[2] ? 1 : 0]; } }
    return (distCache[from] = dist);
  }
  const fareBy = (km, ic) => { const t = ic ? D.fares.ic : D.fares.paper, k = Math.ceil(km - 1e-9); for (const r of t) if (k <= r[0]) return r[1]; return null; };
  const isLoopStation = (n) => !!D.loop && D.loop.stations.includes(n);
  // きっぷの情報。一周(from===to)は神田・秋葉原・御茶ノ水だけ
  function ticket(from, to, ic) {
    if (!ST[from] || !ST[to]) return null;
    if (from === to) return isLoopStation(from) ? { km: D.loop.km, fare: fareBy(D.loop.km, ic), loop: true } : null;
    const d = dists(from)[to]; if (!d) return null;
    return { km: f1(d[0]), fare: d[1] ? fareBy(d[0], ic) : null, loop: false };
  }
  // 到着駅の候補(運賃のわかる駅を近い順に)
  function dests(from, ic) {
    const d = dists(from), out = [];
    for (const k in d) { if (k === from || !d[k][1]) continue; const f = fareBy(d[k][0], ic); if (f != null) out.push({ n: k, y: ST[k][0], km: f1(d[k][0]), fare: f }); }
    return out.sort((a, b) => a.km - b.km);
  }

  /* ===== 乗ったことのある区間 ===== */
  const hopKey = (s, h) => s * 1000 + h;
  function piecesOf(id) { // ルートの id → [[辺, どこから, どこまで]]
    const m = /^([^:]+):([^:]+):([\w.\-]+)$/.exec(id || ''); if (!m) return null;
    const from = m[1], to = m[2], parts = m[3].split('.'), pcs = [];
    if (!ST[from] || !ST[to]) return null;
    for (let k = 0; k < parts.length; k++) { const rev = parts[k].endsWith('-'), s = segNo[rev ? parts[k].slice(0, -1) : parts[k]]; if (s === undefined) return null;
      const g = G[s]; let i0 = rev ? g.n : 0, i1 = rev ? 0 : g.n;
      if (k === 0 && !isNode(from)) { i0 = g.names.indexOf(from); if (i0 < 0) return null; }
      if (k === parts.length - 1 && !isNode(to)) { i1 = g.names.indexOf(to); if (i1 < 0) return null; }
      if (i0 === i1 || (i1 > i0) === rev) return null;
      pcs.push([s, i0, i1]); }
    return { from, to, pcs };
  }
  const idOf = (from, to, pcs) => from + ':' + to + ':' + pcs.map((p) => G[p[0]].id + (p[2] > p[1] ? '' : '-')).join('.');
  function riddenSet(ids) { const set = new Set(); (ids || []).forEach((id) => { const r = piecesOf(id); if (r) r.pcs.forEach((p) => { for (let h = Math.min(p[1], p[2]); h < Math.max(p[1], p[2]); h++) set.add(hopKey(p[0], h)); }); }); return set; }

  /* ===== 1本のルートを組み立てる(駅の重なり・折り返し・列車の割りあてを確かめる) ===== */
  function buildRoute(from, to, pcs, o) {
    o = o || {}; const banned = o.banned, loop = from === to;
    const seq = [{ n: from, km: 0 }], hops = [], seen = new Set([from]), joint = {}; let km = 0, regM = 0; const regKm = {};
    for (let k = 0; k < pcs.length; k++) { const s = pcs[k][0], i0 = pcs[k][1], i1 = pcs[k][2], g = G[s], d = i1 > i0 ? 1 : -1;
      if (!g || g.names[i0] !== seq[seq.length - 1].n) return null;
      if (k) joint[seq.length - 1] = [pcs[k - 1][0], s];
      regM |= g.reg;
      for (let i = i0; i !== i1; i += d) { const nm = g.names[i + d], dk = Math.abs(g.kms[i + d] - g.kms[i]); km += dk;
        const last = k === pcs.length - 1 && i + d === i1;
        if (seen.has(nm) && !(loop && last)) return null; // 同じ駅を2回通る
        seen.add(nm); hops.push({ s, h: Math.min(i, i + d), km: dk }); seq.push({ n: nm, km });
        g.regNames.forEach((r) => { regKm[r] = (regKm[r] || 0) + dk; }); }
      for (const dn of g.deemed) { if (seen.has(dn)) return null; seen.add(dn); } } // みなし通過駅
    const H = hops.length; if (!H || seq[H].n !== to) return null;
    // 折り返しの特例
    joint[0] = [null, pcs[0][0]]; joint[H] = [pcs[pcs.length - 1][0], null];
    const turnAt = {};
    for (const j in joint) { const X = seq[j].n, pv = joint[j][0], nx = joint[j][1];
      for (const t of turns) { if (t.at !== X || pv === t.toward || nx === t.toward) continue;
        const req = t.need.length > 0; if (req ? !(t.need.includes(pv) || t.need.includes(nx)) : (pv == null || nx == null)) continue;
        const clash = t.via.some((v) => seen.has(v));
        if (req) { if (clash) return null; turnAt[j] = { t, req: true }; } else if (!clash) turnAt[j] = { t, req: false }; } }
    // 列車の割りあて: 乗換がいちばん少なく、同じなら早い組みあわせ
    const opt = hops.map((hp) => G[hp.s].hops[hp.h].filter((e) => !(banned && banned[e[0]]) && !(o.noRare && e[1] <= 1)));
    const INF = 1e12, cost = [], back = [];
    for (let h = 0; h < H; h++) { if (!opt[h].length) return null; cost.push(new Array(opt[h].length).fill(INF)); back.push(new Array(opt[h].length).fill(-1));
      const stn = seq[h].n, free = turnAt[h] && turnAt[h].req;
      opt[h].forEach((e, x) => { const tm = hops[h].km / SV[svcIds[e[0]]].v * 60;
        if (h === 0) { if (free || !skip[e[0]].has(stn)) cost[0][x] = tm; return; }
        opt[h - 1].forEach((p, y) => { const c0 = cost[h - 1][y]; if (c0 >= INF) return; let c;
          if (p[0] === e[0]) c = c0 + tm; else if (free || (!skip[p[0]].has(stn) && !skip[e[0]].has(stn))) c = c0 + 10000 + tm; else return;
          if (c < cost[h][x]) { cost[h][x] = c; back[h][x] = y; } }); }); }
    let bx = -1, bc = INF; const endFree = turnAt[H] && turnAt[H].req;
    opt[H - 1].forEach((e, x) => { if ((endFree || !skip[e[0]].has(to)) && cost[H - 1][x] < bc) { bc = cost[H - 1][x]; bx = x; } });
    if (bx < 0) return null; // 乗り継げる列車がない
    const pick = new Array(H); for (let h = H - 1; h >= 0; h--) { pick[h] = opt[h][bx]; bx = back[h][bx]; }
    // 列車ごとにまとめる
    const legs = [], stops = [[from, 0]], legSvc = []; let h0 = 0;
    const noteOf = (j) => { const u = turnAt[j]; if (!u) return ''; const t = u.t;
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
      if (seq[h0].n === '浜川崎' && h0 > 0) o2.warn = (o2.warn ? o2.warn + '。' : '') + '浜川崎は改札の外で乗り換え。ICカードは簡易改札機にタッチしない';
      legs.push([S.n, name + '方面', mins, S.c, pathD(seq.slice(h0, h + 1).map((x) => x.n)), o2]); legSvc.push(sv);
      const st = [name, f1(seq[h].km)]; if (h === H && noteOf(H)) st.push(noteOf(H)); else if (h < H && noteOf(h)) st.push(noteOf(h)); stops.push(st); h0 = h; }
    if (noteOf(0)) stops[0].push(noteOf(0));
    const regs = D.regions.filter((r) => regM & regBit[r]), top = regs.slice().sort((a, b) => regKm[b] - regKm[a]);
    const title = regs.length >= 5 ? '関東をひとまわり。' : regs.length === 0 ? '都心をぐるり。' : regs.length === 1 ? regs[0] + 'をぐるり。' : top[0] + 'と' + top[1] + 'をぐるり。';
    const mid = stops.slice(1, -1).map((s) => s[0]);
    const passed = seq.map((x) => x.n); Object.keys(turnAt).forEach((j) => { if (turnAt[j].req) turnAt[j].t.via.forEach((v) => passed.push(v)); });
    return { id: idOf(from, to, pcs), from, to, loop, km: f1(km), title, via: (mid.length > 6 ? mid.slice(0, 6).concat('ほか') : mid).join('・') || '乗換なし', regions: regs, stops, legs,
      rare, passed, hopKeys: hops.map((hp) => hopKey(hp.s, hp.h)), hopKm: hops.map((hp) => hp.km), hopSt: seq.map((x) => x.n), pcs, lines: legs.map((l) => l[0]) };
  }
  function routeById(id) { const r = piecesOf(id); return r ? buildRoute(r.from, r.to, r.pcs) : null; }

  /* ===== さがす =====
     c: { ic, win(使える分), len(0:〜100km 1:〜300km 2:300km〜 3:最長), xfer, xmin, meal, rare, want, avoid, mustLine, noLine, mustSt, noSt, prev }
     分岐駅を1回ずつしか通らない道をしらみつぶしにたどる。数百万通りあるので、条件に合わなくなった枝(長すぎる・乗換が多すぎる・時間に収まらない)は
     その場で切り、長い辺(8km以上)の組みあわせが同じものは点数のいちばん高い1本だけ残す。 */
  const STEP_LIMIT = 8000000, KEEP = 8;
  function search(from, to, c, riddenIds) {
    const tk = ticket(from, to, c.ic); if (!tk || !(c.win > 0)) return { routes: [], partial: false };
    const loop = from === to; if (loop && c.ic) return { routes: [], partial: false }; // 一周は紙のきっぷだけ
    // 使えない系統・辺
    const banned = svcIds.map((k) => (c.noLine || []).includes(SV[k].n)), noSt = new Set(c.noSt || []), avoidM = (c.avoid || []).reduce((m, r) => m | regBit[r], 0);
    const ridden = c.prev ? riddenSet(riddenIds) : new Set(), pen = c.prev === 2 ? 2 : c.prev === 1 ? 0.5 : 0;
    // 辺の一部(i0→i1)を使えるか、使えるなら その長さ・最短の分・系統の集まり・点数
    function part(s, i0, i1) { const g = G[s], lo = Math.min(i0, i1), hi = Math.max(i0, i1); let mins = 0, m0 = 0, m1 = 0, km = 0, rk = 0;
      if (g.reg & avoidM) return null;
      for (let i = lo; i <= hi; i++) if (noSt.has(g.names[i]) && g.names[i] !== from && g.names[i] !== to) return null;
      for (let h = lo; h < hi; h++) { let v = 0; for (const e of g.hops[h]) { if (banned[e[0]] || (!c.rare && e[1] <= 1)) continue; v = Math.max(v, SV[svcIds[e[0]]].v); if (e[0] < 32) m0 |= 1 << e[0]; else m1 |= 1 << (e[0] - 32); }
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
    const endAt = nodeNames.map(() => null); // その分岐駅から到着駅へ入る最後のひと区間
    if (tSeg) { const g = G[tSeg[0]]; [[g.a, 0], [g.b, g.n]].forEach((x) => { const p = part(tSeg[0], x[1], tSeg[1]); if (p) endAt[x[0]] = { pc: [tSeg[0], x[1], tSeg[1]], p }; }); }
    function record(km, mins, legs, sc, reg, k0, k1, endPc) {
      if (km < minKm || km > maxKm || (reg & wantM) !== wantM || mins + (legs - 1) * c.xmin + base > c.win) return;
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
        const fin = y === T; if (vis[y] && !(fin && loop && stack.length >= 2)) continue;
        const nk = km + p.km; if (nk > maxKm) continue;
        let l = legs, a0 = m0 & p.m0, a1 = m1 & p.m1; if (!a0 && !a1) { l++; a0 = p.m0; a1 = p.m1; } if (l > maxLegs) continue;
        const nm = mins + p.mins; if (nm + (l - 1) * c.xmin + base > c.win) continue;
        const ci = cls[s], c0 = ci >= 0 && ci < 26 ? k0 | (1 << ci) : k0, c1 = ci >= 26 ? k1 | (1 << (ci - 26)) : k1;
        stack.push([s, e[1] > 0 ? 0 : G[s].n, e[1] > 0 ? G[s].n : 0]);
        if (fin) record(nk, nm, l, sc + p.sc, reg | p.reg, c0, c1, null);
        else { vis[y] = 1; dfs(y, nk, nm, l, a0, a1, sc + p.sc, reg | p.reg, c0, c1); vis[y] = 0; }
        stack.pop(); }
    }
    (c.noSt || []).forEach((n) => { if (isNode(n) && n !== from && n !== to) vis[nodeNo[n]] = 1; });
    if (sSeg) { const g = G[sSeg[0]]; [[g.a, 0], [g.b, g.n]].forEach((x) => { const p = part(sSeg[0], sSeg[1], x[1]); if (!p || vis[x[0]]) return;
        if (tSeg && tSeg[0] === sSeg[0] && (x[1] === 0) === (tSeg[1] < sSeg[1])) return; // 到着駅を通りすぎる向き
        vis[x[0]] = 1; stack.push([sSeg[0], sSeg[1], x[1]]); dfs(x[0], p.km, p.mins, 1, p.m0, p.m1, p.sc, p.reg, 0, 0); stack.pop(); vis[x[0]] = 0; }); }
    else { vis[nodeNo[from]] = 1; dfs(nodeNo[from], 0, 0, 0, 0, 0, 0, 0, 0, 0); }
    // 点数の高い順に、列車を割りあてて確かめ、似ていないものを選ぶ
    const cand = Array.from(best.values()).sort((a, b) => b.sc - a.sc), out = [], want = c.len === 3 ? 1 : KEEP;
    let tried = 0;
    for (const cd of cand) { if (out.length >= want || tried++ > 600) break;
      const r = buildRoute(from, to, cd.pcs, { banned, noRare: !c.rare }); if (!r) continue;
      if (r.legs.length - 1 > c.xfer) continue;
      if (r.legs.reduce((a, l) => a + l[2], 0) + (r.legs.length - 1) * c.xmin + base > c.win) continue;
      if ((c.mustLine || []).some((n) => !r.lines.includes(n)) || (c.mustSt || []).some((n) => !r.passed.includes(n))) continue;
      const ks = new Set(r.hopKeys); let dup = false;
      for (const q of out) { let sh = 0; q.hopKeys.forEach((k, i) => { if (ks.has(k)) sh += q.hopKm[i]; }); if (sh / Math.min(q.km, r.km) > 0.72) { dup = true; break; } }
      if (!dup) out.push(r); }
    out.sort((a, b) => b.km - a.km);
    return { routes: out, partial };
  }

  // 前に乗ったルートと重なる区間
  function overlap(r, riddenIds) {
    const set = riddenSet((riddenIds || []).filter((id) => id !== r.id)), out = []; let a = -1, km = 0;
    r.hopKeys.forEach((k, i) => { const hit = set.has(k); if (hit) km += r.hopKm[i]; if (hit && a < 0) a = i; if (!hit && a >= 0) { out.push(r.hopSt[a] + '〜' + r.hopSt[i]); a = -1; } });
    if (a >= 0) out.push(r.hopSt[a] + '〜' + r.hopSt[r.hopSt.length - 1]);
    return { list: out, km };
  }
  function nearest(lat, lng, k) { return Object.keys(ST).map((n) => [n, Math.hypot((ST[n][1] - lat) * KY, (ST[n][2] - lng) * KX)]).sort((a, b) => a[1] - b[1]).slice(0, k).map((x) => ({ n: x[0], km: f1(x[1]) })); }
  const seenLine = new Set(), lineOpts = []; svcIds.forEach((k) => { if (!seenLine.has(SV[k].n)) { seenLine.add(SV[k].n); lineOpts.push({ n: SV[k].n, c: SV[k].c }); } });
  const stations = Object.keys(ST).map((n) => ({ n, y: ST[n][0] }));
  return { data: D, stations, nodes: nodeNames.slice(), lineOpts, netPath, xy, ll: (n) => (ST[n] ? [ST[n][1], ST[n][2]] : null), has: (n) => !!ST[n], isNode, isLoopStation,
    ticket, dests, search, routeById, buildRoute, overlap, nearest };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { create };
else root.OOMAWARI = create(root.OOMAWARI_DATA);
})(typeof self !== 'undefined' ? self : this);
