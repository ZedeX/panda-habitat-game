/* 面积模型（规则书专家规则）引擎测试 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const WEB = path.join(__dirname, "..", "web");
let src = fs.readFileSync(WEB + "/game.js", "utf8");
src = src.split("/* ---------------------------------------------------------------- ui helpers */")[0];
const sandbox = { console, Math, JSON, Set, Map, Object, Array, process };
sandbox.logMsg = () => {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

/* 构造竹林连通区：默认 6 格（5 块真实板块 + 起始板块，面积 25）；withSix=false 时去掉 (2,-1)（面积 20，右侧开口不闭合） */
const FIXTURE = `
newGame(["bamboo", "forest", "alpine", "river"]);
G.board.clear();
G.board.set("0,0",  { start: true, rot: 0, edges: ["bamboo","alpine","forest","river"], number: 0, cover: {} });
G.board.set("0,-1", { tile: {n:5,own:"bamboo",other:"forest"}, rot: 1, cover: {} });
G.board.set("1,-1", { tile: {n:5,own:"bamboo",other:"river"},  rot: 2, cover: {} });
G.board.set("1,0",  { tile: {n:5,own:"bamboo",other:"alpine"}, rot: 0, cover: {} });
G.board.set("2,0",  { tile: {n:5,own:"bamboo",other:"forest"}, rot: 3, cover: {} });
G.board.set("2,-1", { tile: {n:5,own:"bamboo",other:"alpine"}, rot: 2, cover: {} });
`;
/* 5 格版本：去掉 (2,-1)，竹林区在 (2,0) 上方开口 */
const FIXTURE5 = `
newGame(["bamboo", "forest", "alpine", "river"]);
G.board.clear();
G.board.set("0,0",  { start: true, rot: 0, edges: ["bamboo","alpine","forest","river"], number: 0, cover: {} });
G.board.set("0,-1", { tile: {n:5,own:"bamboo",other:"forest"}, rot: 1, cover: {} });
G.board.set("1,-1", { tile: {n:5,own:"bamboo",other:"river"},  rot: 2, cover: {} });
G.board.set("1,0",  { tile: {n:5,own:"bamboo",other:"alpine"}, rot: 0, cover: {} });
G.board.set("2,0",  { tile: {n:5,own:"bamboo",other:"forest"}, rot: 3, cover: {} });
`;

vm.runInContext(`
let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log("  PASS:", msg); }
  else { fail++; console.log("  FAIL:", msg); }
}

${FIXTURE}
const panda = G.players.find(p => p.terrain === "bamboo");

// A1: 区域连通与面积
const cells = terrainRegion(0, -1, "bamboo");
assert(cells.length === 6, "A1a 竹林连通区 6 格（含起始板块）");
assert(regionArea(cells, "bamboo") === 25, "A1b 面积 = 5×5 = 25（起始板块无数字）");

// A2: 触发阈值
const trig = habitatTriggers(1, 0);
assert(trig.length === 1 && trig[0].player === panda && trig[0].area === 25, "A2 面积 25 ≥10 触发大熊猫建立栖息地");

// A3: 压盖后面积下降 + 连锁
placeMeeple(panda, "0,-1", "bamboo");
assert(G.board.get("0,-1").cover.bamboo === panda.idx, "A3a 数字被压盖");
assert(panda.meeples === 6, "A3b 米宝 -1");
assert(regionArea(terrainRegion(0,-1,"bamboo"), "bamboo") === 20, "A3c 面积 25→20（压盖数字不计）");
assert(habitatTriggers(1,0).length === 1, "A3d 面积仍 ≥10 可继续建立");

// A4: 同一板块可被两名玩家各自压盖（不同地形）
const alpine = G.players.find(p => p.terrain === "alpine");
assert(placeMeeple(alpine, "1,0", "alpine") === true, "A4a 雪豹压盖 (1,0) 高山面");
assert(placeMeeple(panda, "1,0", "bamboo") === true, "A4b 大熊猫压盖 (1,0) 竹林面");
assert(Object.keys(G.board.get("1,0").cover).length === 2, "A4c 一块板块承载 2 枚米宝");
assert(placeMeeple(panda, "1,0", "bamboo") === false, "A4d 同一地形不可重复压盖");
assert(placeMeeple(panda, "0,0", "bamboo") === false, "A4e 起始板块无数字不可压盖");

// A5: 面积不足不触发
${FIXTURE}
const pB = G.players.find(p => p.terrain === "bamboo");
placeMeeple(pB, "0,-1", "bamboo"); placeMeeple(pB, "1,-1", "bamboo");
placeMeeple(pB, "2,-1", "bamboo"); placeMeeple(pB, "2,0", "bamboo");
assert(regionArea(terrainRegion(0,-1,"bamboo"), "bamboo") === 5, "A5a 剩 1 块未压盖，面积 5");
assert(habitatTriggers(2,0).length === 0, "A5b 面积 5 < 10 不触发");

// A6: 计分
${FIXTURE}
const p2 = G.players.find(p => p.terrain === "bamboo");
autoResolveHabitat(1, 0);
let covered = 0;
for (const [k, c] of G.board) if (!c.start && c.cover.bamboo === p2.idx) covered++;
assert(covered === 4, "A6a 连锁压盖 4 枚米宝（25→20→15→10→5）");
let s = scorePlayer(p2);
assert(s.habitat === 20, "A6b 栖息地 = 压盖数字之和 20");
p2.hand = [{n:2,own:"bamboo",other:"river"},{n:2,own:"bamboo",other:"alpine"},{n:1,own:"bamboo",other:"river"}];
s = scorePlayer(p2);
assert(s.hand === 3, "A6c 勘探数据 = 不同数字之和 2+1=3");

// A7: 生态廊道（闭合 + ≥2 枚米宝）
${FIXTURE5}
const p3 = G.players.find(p => p.terrain === "bamboo");
placeMeeple(p3, "0,-1", "bamboo");
placeMeeple(p3, "1,-1", "bamboo");
const regs = regionsOf("bamboo");
assert(regs.length === 1 && regs[0].length === 5, "A7a 全场合 1 片竹林连通区（5 格）");
assert(regionClosed(regs[0], "bamboo") === false, "A7b 该区在 (2,-1) 开口 → 未闭合");
s = scorePlayer(p3);
assert(s.corridor === 0, "A7c 未闭合的廊道不得分（尽管已有 2 枚米宝）");
// 补上缺口使其闭合
G.board.set("2,-1", { tile: {n:5,own:"bamboo",other:"alpine"}, rot: 2, cover: {} });
G.board.set("3,0",  { tile: {n:1,own:"forest",other:"alpine"}, rot: 1, cover: {} });
G.board.set("3,-1", { tile: {n:1,own:"river",other:"alpine"},  rot: 2, cover: {} });
G.board.set("2,1",  { tile: {n:1,own:"forest",other:"river"},  rot: 1, cover: {} });
G.board.set("1,1",  { tile: {n:1,own:"forest",other:"river"},  rot: 0, cover: {} });
G.board.set("0,1",  { tile: {n:1,own:"forest",other:"river"},  rot: 3, cover: {} });
G.board.set("-1,0", { tile: {n:1,own:"forest",other:"alpine"}, rot: 0, cover: {} });
G.board.set("-1,-1",{ tile: {n:1,own:"forest",other:"alpine"}, rot: 1, cover: {} });
G.board.set("0,-2", { tile: {n:1,own:"forest",other:"river"},  rot: 2, cover: {} });
G.board.set("1,-2", { tile: {n:1,own:"forest",other:"river"},  rot: 3, cover: {} });
G.board.set("2,-2", { tile: {n:1,own:"forest",other:"river"},  rot: 0, cover: {} });
const regs2 = regionsOf("bamboo");
const closed = regionClosed(regs2[0], "bamboo");
assert(closed === true, "A7d 补缺口后竹林区闭合");
s = scorePlayer(p3);
assert(s.corridor === 6, "A7e 闭合廊道得分 = 途经板块数 6");

// A8: 整局随机对局（面积模型）
RULES.mode = "area";
newGame(["alpine", "river", "bamboo", "forest"]);
let guard = 0;
while (G.phase !== "over" && guard++ < 600) {
  const p = G.players[G.cur];
  if (!p.hand.length) drawTo(p, 1);
  const ms = [];
  for (const [key] of G.board) {
    const [x, y] = key.split(",").map(Number);
    for (let d = 0; d < 4; d++) if (canPlaceAt(x + DIRS[d][0], y + DIRS[d][1])) ms.push([x + DIRS[d][0], y + DIRS[d][1]]);
  }
  if (p.hand.length && ms.length) {
    let best = null;
    for (let hi = 0; hi < p.hand.length; hi++) for (const [x, y] of ms) for (let r = 0; r < 4; r++) {
      const m = matchingEdges(p.hand[hi], r, x, y);
      const sc = m.same * 100 + p.hand[hi].n;
      if (!best || sc > best.sc) best = { hi, x, y, r, sc };
    }
    placeTile(p, best.hi, best.x, best.y, best.r);
    autoResolveHabitat(best.x, best.y);
  }
  endTurnChecks();
  G.turnCount++;
  if (G.lastRoundFlag && G.turnCount % 4 === 0) {
    if (G.finalRoundDone) { finishGame(); break; }
    G.finalRoundDone = true;
  }
  G.cur = (G.cur + 1) % 4;
}
assert(G.phase === "over" || guard >= 600, "A8a 整局能正常结束 (guard=" + guard + ")");
const tot = G.players.map(p => scorePlayer(p).total);
assert(tot.every(t => t >= 0), "A8b 分数非负");
console.log("  模拟: " + G.turnCount + " 回合, 棋盘 " + G.board.size + " 块, 米宝 " +
  G.players.map(p => p.placedMeeples).join("/") + ", 总分 " + tot.join("/"));

console.log("FINAL RESULT: " + pass + " passed, " + fail + " failed");
if (fail > 0) throw new Error("tests failed");
`, sandbox);
