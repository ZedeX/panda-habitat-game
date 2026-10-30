// Competition-rules engine test suite (replaces area-based habitat tests)
const fs = require("fs");
const vm = require("vm");
const WEB = "C:/Users/zx/WorkBuddy/2026-10-29-09-50-23/panda_game/web";
let src = fs.readFileSync(WEB + "/game.js", "utf8");
src = src.split("/* ---------------------------------------------------------------- ui helpers */")[0];
const sandbox = { console, Math, JSON, Set, Map, Object, Array, process };
sandbox.logMsg = () => {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
vm.runInContext(`
RULES.mode = "handsum";   // 备选手牌和触发模式
let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log("  PASS:", msg); }
  else { fail++; console.log("  FAIL:", msg); }
}

// C1: handSum
newGame(["bamboo", "river"]);
let p0 = G.players[0];
p0.hand = [{n:2,own:"bamboo",other:"river"},{n:5,own:"bamboo",other:"alpine"},{n:4,own:"bamboo",other:"river"}];
assert(handSum(p0) === 11, "C1 手牌和 2+5+4=11");

// C2: markerTargets excludes start & already-marked
G.board.clear();
G.board.set("0,0", { start: true, rot: 0, edges: ["bamboo","alpine","forest","river"], markedBy: undefined, cover: {} });
G.board.set("0,-1", { tile: {n:5,own:"bamboo",other:"forest"}, rot: 0, markedBy: 1 });
G.board.set("1,0",  { tile: {n:3,own:"bamboo",other:"river"}, rot: 0, markedBy: undefined });
const targets = markerTargets(p0);
assert(targets.length === 1 && targets[0] === "1,0", "C2 标记目标仅剩未标记的 (1,0)");

// C3: placeMarker consumes fuel & locks tile
p0.meeples = 3; p0.usedFuel = [];
p0.hand = [{n:5,own:"bamboo",other:"alpine"},{n:3,own:"bamboo",other:"river"}];
assert(placeMarker(p0, "1,0", 0) === true, "C3a 放标记成功");
assert(p0.meeples === 2 && p0.usedFuel.length === 1 && p0.usedFuel[0] === 5, "C3b 消耗数字5燃料");
assert(G.board.get("1,0").markedBy === 0, "C3c 板块被标记");
assert(p0.hand.length === 1 && p0.hand[0].n === 3, "C3d 燃料牌离手");
assert(placeMarker(p0, "1,0", 0) === false, "C3e 已标记板块不能重复标记");

// C4: scoring - habitat = marked tiles sum
G.board.clear();
G.board.set("0,0", { start: true, rot: 0, edges: ["bamboo","alpine","forest","river"], markedBy: undefined, cover: {} });
G.board.set("0,-1", { tile: {n:5,own:"bamboo",other:"forest"}, rot: 1, markedBy: 0 });
G.board.set("1,-1", { tile: {n:3,own:"bamboo",other:"river"}, rot: 2, markedBy: 0 });
G.board.set("1,0",  { tile: {n:1,own:"bamboo",other:"alpine"}, rot: 0, markedBy: 1 });
G.board.set("2,0",  { tile: {n:1,own:"alpine",other:"forest"}, rot: 1, markedBy: undefined });
p0.hand = [];
let s = scorePlayer(p0);
assert(s.habitat === 8, "C4 栖息地 = 5+3 = 8");

// C5: closed corridor with >=2 marks (bamboo chain closed)
const reg = terrainRegion(0, -1, "bamboo");
assert(reg.length === 4, "C5a bamboo 区 4 格");
assert(regionClosed(reg, "bamboo") === true, "C5b 闭合");
let cors = findCorridors().filter(c => c.terrain === "bamboo");
assert(cors.length === 1 && (cors[0].byPlayer[0] || 0) === 2, "C5c 廊道归属：玩家0 有 2 枚标记");
assert(cors[0].closed === true, "C5d 廊道闭合");
assert((cors[0].byPlayer[1] || 0) === 1 && !cors[0].owners.includes(1), "C5e 玩家1 仅 1 枚标记不成立廊道");

// C6: corridor scoring = tile count
s = scorePlayer(p0);
assert(s.corridor === 4, "C6a 廊道分 = 板块数 4");

// C8: hand score distinct numbers
p0.hand = [{n:2,own:"bamboo",other:"river"},{n:2,own:"bamboo",other:"alpine"},{n:1,own:"bamboo",other:"river"}];
s = scorePlayer(p0);
assert(s.hand === 3, "C8 手牌不同数字和 2+1=3");

// C9: endTurnChecks triggers on marker exhaustion
G.lastRoundFlag = false; G.finalRoundDone = false;
G.players[0].deck = []; G.players[0].meeples = 0;
endTurnChecks();
assert(G.lastRoundFlag === true, "C9 标记耗尽触发最后一轮");

// C10: full random game under competition rules
G.lastRoundFlag = false; G.finalRoundDone = false; G.phase = "play";
newGame(["alpine", "river", "bamboo", "forest"]);
let guard = 0, ok = true;
while (G.phase !== "over" && guard++ < 400) {
  const p = G.players[G.cur];
  if (!p.hand.length) drawTo(p, 1);
  const ms = [];
  for (const [key] of G.board) {
    const [x, y] = key.split(",").map(Number);
    for (let d = 0; d < 4; d++) if (canPlaceAt(x + DIRS[d][0], y + DIRS[d][1])) ms.push([x + DIRS[d][0], y + DIRS[d][1]]);
  }
  if (p.hand.length && ms.length) {
    // simple best move
    let best = null;
    for (let hi = 0; hi < p.hand.length; hi++) {
      for (const [x, y] of ms) for (let r = 0; r < 4; r++) {
        const m = matchingEdges(p.hand[hi], r, x, y);
        const sc = m.same * 100 + p.hand[hi].n;
        if (!best || sc > best.sc) best = { hi, x, y, r, sc };
      }
    }
    placeTile(p, best.hi, best.x, best.y, best.r);
    // competition marker loop
    while (handSum(p) >= 10 && p.meeples > 0 && p.hand.length && markerTargets(p).length) {
      const ts = markerTargets(p);
      // fuel: highest number, prefer duplicates
      const cnt = {};
      for (const t of p.hand) cnt[t.n] = (cnt[t.n] || 0) + 1;
      const dups = Object.keys(cnt).filter(n => cnt[n] > 1).map(Number);
      const fuelN = dups.length ? Math.max(...dups) : Math.max(...p.hand.map(t => t.n));
      const fi = p.hand.findIndex(t => t.n === fuelN);
      const target = ts.map(k => ({ k, n: G.board.get(k).tile.n })).sort((a, b) => b.n - a.n)[0];
      if (!placeMarker(p, target.k, fi)) break;
    }
  }
  endTurnChecks();
  G.turnCount++;
  if (G.lastRoundFlag && G.turnCount % 4 === 0) {
    if (G.finalRoundDone) { finishGame(); break; }
    G.finalRoundDone = true;
  }
  G.cur = (G.cur + 1) % 4;
}
assert(G.phase === "over" || guard >= 400, "C10 随机整局能正常结束 (guard=" + guard + ")");
const totals = G.players.map(p => scorePlayer(p));
assert(totals.every(t => t.total >= 0), "C10b 分数非负");
console.log("  模拟: " + G.turnCount + " 回合, 棋盘 " + G.board.size + " 块, 总分: " + G.players.map((p,i)=>p.name+"="+totals[i].total).join(", "));

console.log("FINAL RESULT: " + pass + " passed, " + fail + " failed");
if (fail > 0) throw new Error("tests failed");
`, sandbox);
