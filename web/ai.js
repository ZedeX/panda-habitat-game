/* 大熊猫国家公园 - 电脑玩家策略模块
 * 三档难度（困难 / 中等 / 简单），困难按最佳策略行棋；
 * 同一难度通过 variant 切换"风格变体"，使不同电脑玩家行棋方式不同，但各自保持一致。
 * 依赖引擎全局函数：G, DIRS, OPP, cellKey, tileEdges, matchingEdges, canPlaceAt,
 *   regionsOf, habitatTriggers, placeTile, placeMeeple, finishTurnAfterBuild,
 *   render, updateHUD（均来自 game.js / ui.js）。
 */
"use strict";

/* 由难度 + 风格变体生成该电脑玩家的固定策略（游戏中不再变化，保证一致性）
 * 难度分层（关键：保证 困难 > 中等 > 简单 在期望上成立）：
 *   - hard：最佳策略。落子最大化「自己物种地形连通区」的成长（保持开口以便后续继续触发、
 *           多摸牌、多拿压盖机会），压盖永远选当前候选中数字最大者（栖息地=被压数字之和，
 *           限 7 枚米宝，故「每张换最大值」最划算）。style 切换两种强风格：栖息地流 / 廊道流。
 *   - medium：良好但缺乏前瞻。落子看同色边+自己地形计数（无连通区成长前瞻），压盖选最大数，
 *           仍偶有随机（10%+偶发扰动）。
 *   - easy：弱。落子只看同色边、高概率随机走子；压盖随机选候选，明显弱于上述两者。
 */
function makeAIPolicy(level, variant, idx) {
  const v = (variant || 0) % 2;
  if (level === "hard") {
    // 最佳策略：出牌扩区 + 压盖取最大数字；variant 切换两种强风格（栖息地流 / 廊道流）
    return {
      level, variant: v, place: "smart",
      cover: v === 0 ? "big" : "corridor",
      randomness: 0.0,
      label: v === 0 ? "困难·栖息地流" : "困难·廊道流",
    };
  }
  if (level === "medium") {
    // 良好但不前瞻：出牌=同色边+自己地形计数（无成长的连通区前瞻）；压盖=最大数；10% 随机扰动
    return {
      level, variant: v, place: "expert",
      cover: "big",
      randomness: 0.10,
      label: v === 0 ? "中等·均衡" : "中等·冒进",
    };
  }
  // 简单：只看同色边、高概率随机走子；压盖随机选候选，便于人类击败
  return {
    level: "easy", variant: v, place: "naive", cover: "rand",
    randomness: 0.40,
    label: v === 0 ? "简单" : "简单·随机",
  };
}

/* 所有可落子位置（与已有板块相邻的空格） */
function aiLegalPlacements() {
  const ms = [];
  for (const [key] of G.board) {
    const [x, y] = key.split(",").map(Number);
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (canPlaceAt(nx, ny)) ms.push([nx, ny]);
    }
  }
  return ms;
}

/* 某玩家某地形连通区诊断：marks=自己米宝数, open=对外开口数, score=综合权重 */
function aiRegionStats(terrain, p) {
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

/* 某地形连通区的总览：最大连通区规模 + 总开口数（用于困难策略的成长评估） */
function aiTerrainTotals(terrain) {
  let maxSize = 0, open = 0;
  for (const cells of regionsOf(terrain)) {
    maxSize = Math.max(maxSize, cells.length);
    for (const r of cells) {
      const e = r.cell.start ? r.cell.edges : tileEdges(r.cell.tile, r.cell.rot);
      for (let d = 0; d < 4; d++) {
        if (e[d] !== terrain) continue;
        const nb = G.board.get(cellKey(r.x + DIRS[d][0], r.y + DIRS[d][1]));
        if (!nb) { open++; continue; }
        const ne = nb.start ? nb.edges[OPP[d]] : tileEdges(nb.tile, nb.rot)[OPP[d]];
        if (ne !== terrain) continue;
      }
    }
  }
  return { maxSize, open };
}

/* 选子：返回 {hi(手牌下标), x, y, r} 或 null */
function aiChooseMove(p, pol) {
  const ms = aiLegalPlacements();
  if (!p.hand.length || !ms.length) return null;
  // 简单难度按概率随机走子
  if (pol.randomness > 0 && Math.random() < pol.randomness) {
    const hi = Math.floor(Math.random() * p.hand.length);
    const [x, y] = ms[Math.floor(Math.random() * ms.length)];
    return { hi, x, y, r: Math.floor(Math.random() * 4) };
  }
  const before = (pol.place === "smart") ? aiTerrainTotals(p.terrain) : null;
  let best = null;
  for (let hi = 0; hi < p.hand.length; hi++) {
    const t = p.hand[hi];
    for (const [x, y] of ms) for (let r = 0; r < 4; r++) {
      const m = matchingEdges(t, r, x, y);
      let sc;
      if (pol.place === "naive") {
        sc = m.same * 100 + t.n;
      } else if (pol.place === "expert") {
        const e = tileEdges(t, r);
        const own = e.reduce((a, v) => a + (v === p.terrain ? 1 : 0), 0);
        sc = m.same * 100 + own * 25 + t.n * 6;
      } else { // smart：模拟落子，优先"扩张自己物种地形连通区、保持开口（继续成长）、多摸牌、落大数"
        G.board.set(cellKey(x, y), { tile: t, rot: r, x, y, edges: tileEdges(t, r), cover: {} });
        const after = aiTerrainTotals(p.terrain);
        G.board.delete(cellKey(x, y));
        const growth = after.maxSize - before.maxSize;
        sc = growth * 100 + m.same * 35 + (t.own === p.terrain ? t.n * 8 : 0) + after.open * 3;
      }
      if (!best || sc > best.sc) best = { hi, x, y, r, sc };
    }
  }
  return best;
}

/* 自动压盖：依据策略把可触发的栖息地尽量压满 */
function aiResolve(x, y, p, pol) {
  let placed = 0, guard = 0;
  while (guard++ < 20) {
    const trigs = habitatTriggers(x, y);
    if (!trigs.length) break;
    let did = false;
    for (const t of trigs) {
      const pp = t.player;
      const cand = t.candidates.slice();
      if (pol.cover === "rand") {
        // 简单：随机选候选（不追求最优）
        cand.sort(() => Math.random() - 0.5);
      } else if (pol.cover === "corridor") {
        // 廊道流：优先在已含自己米宝的主战区里凑出 ≥2 枚 → 成生态廊道（仍取大数）
        const stats = aiRegionStats(t.terrain, pp).sort((a, b) => b.score - a.score);
        const main = stats[0];
        const inMain = cand.filter(r => main && main.cells.some(q => q.x === r.x && q.y === r.y));
        const pool = inMain.length ? inMain : cand.slice();
        pool.sort((a, b) => b.cell.tile.n - a.cell.tile.n);
        cand.length = 0; cand.push(...pool);
      } else { // big：栖息地=被压数字之和，限 7 枚米宝 → 永远压当前候选的最大数字
        cand.sort((a, b) => b.cell.tile.n - a.cell.tile.n);
      }
      if (placeMeeple(pp, cellKey(cand[0].x, cand[0].y), t.terrain)) { placed++; did = true; }
    }
    if (!did) break;
  }
  return placed;
}

let _aiBusy = false;

/* 执行一个电脑玩家的完整回合 */
function aiTurn() {
  if (G.phase === "over") { _aiBusy = false; return; }
  const p = G.players[G.cur];
  if (!p || p.type !== "ai") { _aiBusy = false; return; }
  _aiBusy = true;
  // 用 makeAIPolicy 补全策略字段（place/cover/randomness/label），p.ai 仅存 level/style
  const pol = makeAIPolicy(p.ai.level, p.ai.style, p.idx);
  const mv = aiChooseMove(p, pol);
  if (mv && p.hand[mv.hi]) {
    placeTile(p, mv.hi, mv.x, mv.y, mv.r);
    render(); updateHUD();
    // 留出观察时间，再自动压盖并结束回合
    setTimeout(() => {
      aiResolve(mv.x, mv.y, p, pol);
      render(); updateHUD();
      setTimeout(() => { finishTurnAfterBuild(); _aiBusy = false; }, 320);
    }, 380);
  } else {
    finishTurnAfterBuild();
    _aiBusy = false;
  }
}

/* advanceTurn 末尾钩子：轮到电脑则延迟自动行棋；轮到人类则等待输入 */
function onAdvanceTurn() {
  if (G.phase !== "play") return;
  const p = G.players[G.cur];
  if (!p) return;
  if (p.type === "ai") setTimeout(aiTurn, 550);
}

/* 供 UI 调用：人类结束时若下一位恰好是电脑，主动触发（advanceTurn 已含钩子，此为显式兜底） */
function ensureAITurn() {
  if (G.phase === "play") onAdvanceTurn();
}
