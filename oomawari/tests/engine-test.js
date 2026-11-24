/* engine.js をブラウザなしで試す。  node oomawari/tests/engine-test.js  (速く回すときは QUICK=1)
   「必ず乗る路線」「通らない駅」「折り返しの特例」を組みあわせて、条件を破るルートが出ないかを確かめる */
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '..', 'data.js'));
const E = require(path.join(__dirname, '..', 'engine.js')).create(D);
const QUICK = !!process.env.QUICK;
const BASE = { start: '07:00', end: '20:00', want: [], avoid: [], len: 1, xfer: 8, xmin: 15, meal: false, rare: true, mustLine: [], noLine: [], mustSt: [], noSt: [], ic: true, prev: 0 };
const run = (o, budget) => E.find(Object.assign({}, BASE, o), [], budget || 300000);
let fail = 0, pass = 0; const log = [];
const ok = (cond, msg) => { if (cond) pass++; else { fail++; log.push('NG ' + msg); } };

// 横浜まわりの発着(折り返しの特例が効く駅のそば)
const PAIRS = [['横浜', '東神奈川'], ['川崎', '鶴見'], ['新川崎', '武蔵小杉'], ['鶴見', '新子安'], ['品川', '大井町'], ['新宿', '代々木'], ['上野', '御徒町'], ['東京', '有楽町'], ['大崎', '五反田'], ['西大井', '品川']]
  .filter((p) => E.has(p[0]) && E.has(p[1]) && E.ticket(p[0], p[1], true));
const pairs = QUICK ? PAIRS.slice(0, 4) : PAIRS;

// 1) 通らない駅: 折り返しの特例で通る駅(via)を「通らない駅」にしても、その駅を通るルートが出ないこと
const vias = Array.from(new Set(D.turns.flatMap((t) => t.via)));
for (const [from, to] of pairs) for (const v of vias) { if (v === from || v === to) continue;
  for (const len of [0, 1]) { const rs = run({ from, to, len, noSt: [v] }).routes;
    rs.forEach((r) => ok(!r.passed.includes(v), `通らない駅 ${v} を通った: ${from}→${to} len${len} ${r.lines.join('/')} ${r.km}km`)); } }

// 2) 必ず乗る路線: 出たルートには必ずその路線があること。また、その路線を通る候補が間引きで消えていないこと
const names = E.lineOpts.map((l) => l.n);
for (const [from, to] of pairs) for (const len of [0, 1]) { const all = run({ from, to, len, keep: 40 }, 600000).routes;
  for (const n of names) { const rs = run({ from, to, len, mustLine: [n] }, 600000).routes;
    rs.forEach((r) => ok(r.lines.includes(n), `必ず乗る ${n} がない: ${from}→${to}`));
    const any = all.some((r) => r.lines.includes(n));
    ok(!(any && !rs.length), `必ず乗る ${n} で0件になった(条件なしでは ${all.filter((r) => r.lines.includes(n)).length} 件ある): ${from}→${to} len${len}`); } }

// 3) 必ず乗る路線 + 通らない駅 の組みあわせ
for (const [from, to] of pairs) for (const n of ['横須賀線', '湘南新宿ライン', '南武線', '鶴見線', '相鉄直通']) { if (!names.includes(n)) continue;
  for (const v of vias) { if (v === from || v === to) continue; const rs = run({ from, to, mustLine: [n], noSt: [v] }).routes;
    rs.forEach((r) => { ok(r.lines.includes(n), `組みあわせ: ${n} がない ${from}→${to} 除外${v}`); ok(!r.passed.includes(v), `組みあわせ: ${v} を通った ${from}→${to} 必須${n}`); }); } }

// 4) 打ち切りの知らせ: とても少ない上限で探すと partial になること
ok(run({ from: '横浜', to: '東神奈川', len: 2 }, 2000).partial === true, '探索上限に達しても partial にならない');

const kinds = {}; log.forEach((l) => { const k = l.split(" ")[1]; kinds[k] = (kinds[k] || 0) + 1; }); console.log(kinds);
console.log(log.filter((l) => !l.includes("通らない駅")).slice(0, 30).join('\n'));
console.log(`\n${pass} ok, ${fail} NG`);
process.exit(fail ? 1 : 0);
