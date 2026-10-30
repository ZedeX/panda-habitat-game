/* 面积模型（专家规则）4 人局批量模拟：策略对照 + 计分量级校验
   用法: cd web && node ../tests/greedy_sim.js [局数] */
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

const N = Number(process.argv[2] || 300);
sandbox.N = N;

vm.runInContext(`
const N = globalThis.N;
RULES.mode = "area";

/* ---------- 出牌策略 ---------- */
function chooseMove(p, policy) {
  const ms = [];
  for (const [key] of G.board) {
    const [x, y] = key.split(",").map(Number);
    for (let d = 0; d < 4; d++) if (canPlaceAt(x + DIRS[d][0], y + DIRS[d][1])) ms.push([x + DIRS[d][0], y + DIRS[d][1]]);
  }
  if (!p.hand.length || !ms.length) return null;
  let best = null;
  for (let hi = 0; hi < p.hand.length; hi++) {
    const t = p.hand[hi];
    for (const [x, y] of ms) for (let r = 0; r < 4; r++) {
      const m = matchingEdges(t, r, x, y);
      let sc;
      if (policy === "naive") sc = m.same * 100 + t.n;
      else {
        const e = tileEdges(t, r);
        const own = e.reduce((a, v) => a + (v === p.terrain ? 1 : 0), 0);
        sc = m.same * 100 + own * 25 + t.n * 6;
      }
      if (!best || sc > best.sc) best = { hi, x, y, r, sc };
    }
  }
  return best;
}

/* ---------- 区域诊断 ---------- */
function regionStats(terrain, p) {
  const out = [];
  for (const cells of regionsOf(terrain)) {
    let marks = 0, open = 0;
    for (const r of cells) {
      if (!r.cell.start && r.cell.cover[terrain] === p.idx) marks++;
      const e = r.cell.start ? r.cell.edges : tileEdges(r.cell.tile, r.cell.rot);
      for (let d = 0; d < 4; d++) {
        if (e[d] !== terrain) continue;
        const nb = G.board.get(cellKey(r.x + DIRS[d][0], r.y + DIRS[d][1]));
        if (!nb) { open++; continue; }
        const ne = nb.start ? nb.edges[OPP[d]] : tileEdges(nb.tile, nb.rot)[OPP[d]];
        if (ne !== terrain) continue;
      }
    }
    out.push({ cells, marks, open, size: cells.length,
               score: marks * 40 + (open === 0 ? 30 : 0) - open * 3 + cells.length * 2 });
  }
  return out;
}

/* 廊道意识出牌：优先缩小自己「主战区」的开口数 */
function chooseMoveCorridor(p) {
  const ms = [];
  for (const [key] of G.board) {
    const [x, y] = key.split(",").map(Number);
    for (let d = 0; d < 4; d++) if (canPlaceAt(x + DIRS[d][0], y + DIRS[d][1])) ms.push([x + DIRS[d][0], y + DIRS[d][1]]);
  }
  if (!p.hand.length || !ms.length) return null;
  const before = regionStats(p.terrain, p);
  const openBefore = before.reduce((a, r) => a + r.open, 0);
  let best = null;
  for (let hi = 0; hi < p.hand.length; hi++) {
    const t = p.hand[hi];
    for (const [x, y] of ms) for (let r = 0; r < 4; r++) {
      const m = matchingEdges(t, r, x, y);
      G.board.set(cellKey(x, y), { tile: t, rot: r, x, y, edges: tileEdges(t, r), cover: {} });
      const after = regionStats(p.terrain, p).reduce((a, q) => a + q.open, 0);
      G.board.delete(cellKey(x, y));
      const sc = m.same * 100 + (openBefore - after) * 45 + t.n * 6;
      if (!best || sc > best.sc) best = { hi, x, y, r, sc };
    }
  }
  return best;
}

/* ---------- 压盖策略 ----------
   drainSmall: 候选板块数 ≤ 剩余米宝 → 从小到大压盖（把整片区域榨干）
   greedyBig : 永远压盖最大数字（每枚米宝换最大即时分） */
function resolveWith(x, y, policy) {
  let placed = 0, guard = 0;
  while (guard++ < 20) {
    const trigs = habitatTriggers(x, y);
    if (!trigs.length) break;
    let did = false;
    for (const t of trigs) {
      const p = t.player;
      const cand = t.candidates.slice();
      if (policy === "corridor") {
        /* 先选出「主战区」：自己米宝最多 / 开口最少的那片 */
        const stats = regionStats(t.terrain, p).sort((a, b) => b.score - a.score);
        const main = stats[0];
        const inMain = cand.filter(r => main && main.cells.some(q => q.x === r.x && q.y === r.y));
        const pool = inMain.length ? inMain : cand.slice();
        pool.sort((a, b) => pool.length <= p.meeples ? a.cell.tile.n - b.cell.tile.n : b.cell.tile.n - a.cell.tile.n);
        cand.length = 0; cand.push(...pool);
      } else if (policy === "greedyBig") cand.sort((a, b) => b.cell.tile.n - a.cell.tile.n);
      else cand.sort((a, b) => cand.length <= p.meeples ? a.cell.tile.n - b.cell.tile.n : b.cell.tile.n - a.cell.tile.n);
      /* 廊道意识：若区内已有自己米宝，优先在同区继续压（凑够 2 枚更容易成立廊道） */
      if (policy === "drainSmallCorridor") {
        const has = cand.filter(r => r.cell.cover[t.terrain] === p.idx);
        if (has.length && cand.length > p.meeples) cand.sort((a, b) => b.cell.tile.n - a.cell.tile.n);
      }
      if (placeMeeple(p, cellKey(cand[0].x, cand[0].y), t.terrain)) { placed++; did = true; }
    }
    if (!did) break;
  }
  return placed;
}

function playGame(policies) {
  newGame(["alpine", "river", "bamboo", "forest"]);
  let guard = 0;
  while (G.phase !== "over" && guard++ < 600) {
    const p = G.players[G.cur];
    if (!p.hand.length) drawTo(p, 1);
    const pol = policies[p.idx];
    const mv = pol.place === "corridor" ? chooseMoveCorridor(p) : chooseMove(p, pol.place);
    if (mv) { placeTile(p, mv.hi, mv.x, mv.y, mv.r); resolveWith(mv.x, mv.y, pol.cover); }
    endTurnChecks();
    G.turnCount++;
    if (G.lastRoundFlag && G.turnCount % 4 === 0) {
      if (G.finalRoundDone) { finishGame(); break; }
      G.finalRoundDone = true;
    }
    G.cur = (G.cur + 1) % 4;
  }
  return G.players.map(p => scorePlayer(p));
}

function run(label, policies, n) {
  const agg = [0, 0, 0, 0].map(() => ({ total: 0, hab: 0, cor: 0, bio: 0, hand: 0, win: 0, mk: 0, top: 0 }));
  for (let i = 0; i < n; i++) {
    const rs = playGame(policies);
    let bi = 0, best = -1;
    rs.forEach((r, i) => { if (r.total > best) { best = r.total; bi = i; } });
    rs.forEach((r, i) => {
      agg[i].total += r.total; agg[i].hab += r.habitat; agg[i].cor += r.corridor;
      agg[i].bio += r.bio; agg[i].hand += r.hand; agg[i].mk += G.players[i].placedMeeples;
      if (i === bi) agg[i].win++;
      agg[i].top = Math.max(agg[i].top, r.total);
    });
  }
  console.log("\\n=== " + label + " (" + n + " 局) ===");
  agg.forEach((a, i) => {
    console.log("  P" + i + " [" + (policies[i].place + "+" + policies[i].cover).padEnd(16) + "] 均分 " + (a.total / n).toFixed(1) +
      " | 栖息地 " + (a.hab / n).toFixed(1) + " 廊道 " + (a.cor / n).toFixed(1) +
      " 共生 " + (a.bio / n).toFixed(1) + " 勘探 " + (a.hand / n).toFixed(1) +
      " | 米宝 " + (a.mk / n).toFixed(1) + " 最高 " + a.top + " | 胜率 " + (100 * a.win / n).toFixed(0) + "%");
  });
}

const P = (place, cover) => ({ place, cover });
const ALL = f => [f, f, f, f];
run("全员 naive出牌 + 只压大数字", ALL(P("naive", "big")), N);
run("全员 naive出牌 + 榨干法(小→大)", ALL(P("naive", "drain")), N);
run("全员 expert出牌 + 榨干法", ALL(P("expert", "drain")), N);
run("P0 榨干法 vs 其余 压大数字", [P("naive","drain"), P("naive","big"), P("naive","big"), P("naive","big")], N);
run("P0 expert+榨干 vs 其余 naive+压大", [P("expert","drain"), P("naive","big"), P("naive","big"), P("naive","big")], N);
run("全员 廊道意识(出牌+压盖)", ALL(P("corridor", "corridor")), N);
run("P0 廊道意识 vs 其余 naive+压大", [P("corridor","corridor"), P("naive","big"), P("naive","big"), P("naive","big")], N);
`, sandbox);
