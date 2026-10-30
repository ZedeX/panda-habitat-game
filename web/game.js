/* 大熊猫国家公园 - 网页版游戏引擎
 * 规则版本：竞赛版（2024 挑战活动实测，经 ASR 终局计分 58/39/38/37 精确验证）
 * 核心差异 vs 规则书版：
 *   - 栖息地触发 = 打出手牌后「个人手牌数字总和 ≥ 10」（非地形面积 ≥10）
 *   - 放标记 = 在场上自己的未标记板块上放 1 枚动物标记，同时必须消耗 1 块手牌（其数字本局失效）
 *   - 手牌和仍 ≥10 可连锁放置；首枚标记默认放刚打出的板块
 *   - 栖息地得分 = 被标记板块数字之和；廊道仍需闭合 + ≥2 枚标记
 * 详见 专家规则完整梳理.md 的 ASR 证据链。
 */
"use strict";

/* ---------------------------------------------------------------- data */
const TERRAIN_META = {
  bamboo : { name: "竹林", animal: "panda",  fill: "#8CBE6B", dark: "#5B8E47", light: "#B4D894", num: "#37631F" },
  forest : { name: "森林", animal: "musk",  fill: "#D9A85C", dark: "#A5743A", light: "#F0CE95", num: "#7E5118" },
  alpine : { name: "高山", animal: "snow",  fill: "#9A8FC6", dark: "#685C9A", light: "#C8C0E1", num: "#453C7A" },
  river  : { name: "水域", animal: "otter",  fill: "#5E9BD0", dark: "#33709F", light: "#A5CCE9", num: "#1B4E73" },
};
const ANIMAL_NAMES = { panda: "大熊猫", musk: "林麝", snow: "雪豹", otter: "欧亚水獭" };
const ANIMAL_OF = { bamboo: "panda", forest: "musk", alpine: "snow", river: "otter" };
const TKEYS = ["bamboo", "forest", "alpine", "river"];

/* player decks from manifest (embedded compact) */
const PLAYER_DECKS = {
  bamboo: [
    {n:1,own:"bamboo",other:"river",},
    {n:1,own:"bamboo",other:"alpine",},
    {n:1,own:"bamboo",other:"forest",},
    {n:2,own:"bamboo",other:"river",comp: "takin", },
    {n:2,own:"bamboo",other:"alpine",comp: "pika", },
    {n:2,own:"bamboo",other:"forest",comp: "panda_cub", },
    {n:3,own:"bamboo",other:"forest",comp: "takin", },
    {n:3,own:"bamboo",other:"alpine",comp: "pika", },
    {n:3,own:"bamboo",other:"river",comp: "wildcat", },
    {n:4,own:"bamboo",other:"alpine",},
    {n:4,own:"bamboo",other:"river",},
    {n:4,own:"bamboo",other:"forest",},
    {n:5,own:"bamboo",other:"alpine",},
    {n:5,own:"bamboo",other:"forest",},
    {n:5,own:"bamboo",other:"river",},
  ],
  forest: [
    {n:1,own:"forest",other:"river",},
    {n:1,own:"forest",other:"alpine",},
    {n:1,own:"forest",other:"bamboo",},
    {n:2,own:"forest",other:"bamboo",comp: "panda_cub", },
    {n:2,own:"forest",other:"alpine",comp: "wildcat", },
    {n:2,own:"forest",other:"river",comp: "pika", },
    {n:3,own:"forest",other:"bamboo",comp: "pika", },
    {n:3,own:"forest",other:"river",comp: "monkey", },
    {n:3,own:"forest",other:"alpine",comp: "deer", },
    {n:4,own:"forest",other:"bamboo",},
    {n:4,own:"forest",other:"river",},
    {n:4,own:"forest",other:"alpine",},
    {n:5,own:"forest",other:"river",},
    {n:5,own:"forest",other:"bamboo",},
    {n:5,own:"forest",other:"alpine",},
  ],
  alpine: [
    {n:1,own:"alpine",other:"bamboo",},
    {n:1,own:"alpine",other:"forest",},
    {n:1,own:"alpine",other:"river",},
    {n:2,own:"alpine",other:"bamboo",comp: "panda_cub", },
    {n:2,own:"alpine",other:"river",comp: "takin", },
    {n:2,own:"alpine",other:"forest",comp: "monkey", },
    {n:3,own:"alpine",other:"river",comp: "deer", },
    {n:3,own:"alpine",other:"forest",comp: "takin", },
    {n:3,own:"alpine",other:"bamboo",comp: "monkey", },
    {n:4,own:"alpine",other:"bamboo",},
    {n:4,own:"alpine",other:"river",},
    {n:4,own:"alpine",other:"forest",},
    {n:5,own:"alpine",other:"river",},
    {n:5,own:"alpine",other:"bamboo",},
    {n:5,own:"alpine",other:"forest",},
  ],
  river: [
    {n:1,own:"river",other:"bamboo",},
    {n:1,own:"river",other:"alpine",},
    {n:1,own:"river",other:"forest",},
    {n:2,own:"river",other:"bamboo",comp: "panda_cub", },
    {n:2,own:"river",other:"alpine",comp: "wildcat", },
    {n:2,own:"river",other:"forest",comp: "takin", },
    {n:3,own:"river",other:"forest",comp: "wildcat", },
    {n:3,own:"river",other:"bamboo",comp: "takin", },
    {n:3,own:"river",other:"alpine",comp: "pika", },
    {n:4,own:"river",other:"forest",},
    {n:4,own:"river",other:"bamboo",},
    {n:4,own:"river",other:"alpine",},
    {n:5,own:"river",other:"forest",},
    {n:5,own:"river",other:"alpine",},
    {n:5,own:"river",other:"bamboo",},
  ],
};

/* ---------------------------------------------------------------- state */
const G = {
  phase: "menu",        // menu | play | habitatResolve | lastRound | over
  players: [],          // {terrain, name, deck[], hand[], meeples, placed, habitableScore...}
  cur: 0,               // current player index
  board: new Map(),     // "x,y" -> cell {tile, rot, owner, markedBy, cells:[terrain x4]}
  startRot: 0,
  selected: -1,
  selRot: 0,
  lastRoundFlag: false,
  finalRoundDone: false,
  log: [],
  pendingHabitat: null, // {cellKey, terrain, area, candidates:[{key, terrain}]}
  turnCount: 0,
};

const CELL = 86; // px on canvas

/* start tile: 4 quadrants; quadrant layout (rotation applied):
   rot=0: top=bamboo, right=alpine, bottom=forest, left=river  (order [0,2,3,1] in gen)
   We define edge terrains clockwise from top: [bamboo, alpine, forest, river] */
const START_EDGES = ["bamboo", "alpine", "forest", "river"]; // top,right,bottom,left

/* ---------------------------------------------------------------- setup */
function newGame(playerConfigs, startRot = 0) {
  // playerConfigs: 数组，元素可为 地形字符串（默认人类），或 {terrain, type:'human'|'ai', level, style}
  G.players = playerConfigs.map((cfg, i) => {
    const terrain = (typeof cfg === "string") ? cfg : cfg.terrain;
    const type = (typeof cfg === "string") ? "human" : (cfg.type || "human");
    const deck = shuffle(PLAYER_DECKS[terrain].map((d, j) => ({ ...d, uid: `${terrain}_${j}` })));
    return {
      idx: i, terrain, name: ANIMAL_NAMES[ANIMAL_OF[terrain]],
      type,                                   // 'human' | 'ai'
      ai: (type === "ai") ? { level: cfg.level || "medium", style: cfg.style || 0 } : null,
      deck, hand: [], meeples: 7, // 规则书配件表：每人 7 枚动物米宝
      usedFuel: [],              // 竞赛规则：被消耗（标记燃料）的手牌数字，本局失效
      placedMeeples: 0,
    };
  });
  G.board = new Map();
  G.startRot = startRot;
  // create start cell at 0,0
  const rot = ((startRot % 4) + 4) % 4;
  const edges = START_EDGES.map((_, i) => START_EDGES[(i - rot + 4) % 4]);
  // edges[i] = terrain on side i (0=top,1=right,2=bottom,3=left)
  G.board.set("0,0", {
    start: true, rot, edges,
    number: 0, markedBy: undefined, cover: {},
    cells: edges, // for start tile each side is a terrain half
  });
  G.cur = 0;
  G.phase = "play";
  G.lastRoundFlag = false;
  G.finalRoundDone = false;
  G.log = [];
  G.turnCount = 0;
  // initial draws: 2 each
  for (const p of G.players) {
    drawTo(p, 2 - p.hand.length);
  }
  logMsg(`游戏开始！${G.players.map(p => p.name).join("、")} 加入国家公园。`);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawTo(p, n) {
  for (let i = 0; i < n; i++) {
    if (p.deck.length) p.hand.push(p.deck.shift());
  }
}

/* ---------------------------------------------------------------- geometry */
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // top right bottom left
const OPP = [2, 3, 0, 1];

function cellKey(x, y) { return `${x},${y}`; }

/* A tile face: 3 cells horizontally [other | number | own].
   For edge matching we define: tile has cells L(own) and R(other) plus number cell.
   Actually per rules: each tile shows two terrain cells; each cell occupies a half.
   Web rule: left half = other terrain, right half = own terrain (fixed at print).
   Rotation r (0..3) rotates the whole tile.
   Edge terrain for side s (0..3) after rotation r:
     base edges: top=number-cell top (no terrain), but rules need edges match terrain.
   Simpler faithful model: tile = 2x1 domino of two terrain halves + center number.
   Top and bottom edges belong to BOTH halves? No—physical tiles: square with
   2 vertical halves; each half has its own 4 edges → 8 edges total, but the
   inner edge (between halves) is not external. External edges: left half: 
   left, top-left-half, bottom-left-half; right half: right, top-right-half, bottom-right-half.
   
   For simplicity and gameplay parity, web model: tile contributes
   TWO half-cells on the grid: occupying 2 grid units? That changes board shape.
   
   Better faithful-but-simple model (chosen, per PROCESS.md): each tile occupies
   ONE grid cell. Its 4 external edges carry terrains:
     base (rot=0): [own, own, other, other] (top,right,bottom,left)
   number sits in center. Rotation r rotates edges.
   This preserves "each tile has own terrain + other terrain", edge matching,
   and area computation. Visual: draw left-half/right-half art rotated. */
function tileEdges(tile, rot) {
  const base = [tile.own, tile.own, tile.other, tile.other]; // top,right,bottom,left at rot0
  const r = ((rot % 4) + 4) % 4;
  return base.map((_, i) => base[(i - r + 4) % 4]);
}

function canPlaceAt(x, y) {
  if (G.board.has(cellKey(x, y))) return false;
  let adj = 0;
  for (let d = 0; d < 4; d++) {
    const nb = G.board.get(cellKey(x + DIRS[d][0], y + DIRS[d][1]));
    if (nb) adj++;
  }
  return adj > 0;
}

function matchingEdges(tile, rot, x, y) {
  let same = 0, diff = 0;
  const e = tileEdges(tile, rot);
  for (let d = 0; d < 4; d++) {
    const nb = G.board.get(cellKey(x + DIRS[d][0], y + DIRS[d][1]));
    if (!nb) continue;
    const nbEdge = nb.start ? nb.edges[OPP[d]] : tileEdges(nb.tile, nb.rot)[OPP[d]];
    if (nbEdge === e[d]) same++; else diff++;
  }
  return { same, diff };
}

/* ---------------------------------------------------------------- board ops */
function placeTile(p, handIdx, x, y, rot) {
  const tile = p.hand[handIdx];
  const e = tileEdges(tile, rot);
  G.board.set(cellKey(x, y), { tile, rot, x, y, edges: e, markedBy: undefined, cover: {} });
  p.hand.splice(handIdx, 1);
  // reward draws for matching edges
  const { same } = matchingEdges(tile, rot, x, y);
  const drawn = Math.min(same, p.deck.length);
  drawTo(p, same);
  logMsg(`${p.name} 打出「${TERRAIN_META[tile.own].name}·${tile.n}」于 (${x},${y})，${same} 条同色边相连，摸 ${drawn} 块。`);
  return same;
}

/* terrain region: BFS from (x,y) across matching terrain edges.
   竞赛版仅用于廊道闭合判定与可选的连通区展示；面积规则已废弃。
   被标记的板块地形仍连通（标记不阻断地形）。 */
function terrainRegion(x, y, terrain) {
  const seen = new Set();
  const cells = [];
  const stack = [[x, y]];
  seen.add(cellKey(x, y));
  while (stack.length) {
    const [cx, cy] = stack.pop();
    const c = G.board.get(cellKey(cx, cy));
    if (!c) continue;
    cells.push({ x: cx, y: cy, marked: c.markedBy !== undefined, num: c.start ? 0 : c.tile.n, cell: c });
    const e = c.start ? c.edges : tileEdges(c.tile, c.rot);
    for (let d = 0; d < 4; d++) {
      if (e[d] !== terrain) continue;
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      const k = cellKey(nx, ny);
      if (seen.has(k)) continue;
      const nb = G.board.get(k);
      if (!nb) continue;
      const ne = nb.start ? nb.edges[OPP[d]] : tileEdges(nb.tile, nb.rot)[OPP[d]];
      if (ne !== terrain) continue; // seamless both sides
      seen.add(k);
      stack.push([nx, ny]);
    }
  }
  return cells;
}

/* ================= 规则模式 =================
   area(默认, 证据充分) = 规则书 P9「专家规则」+ 官方教学视频实证：
       板块地形向外扩张后，若「栖息地总面积 ≥ 10」→ 压盖 1 枚动物米宝在该地形上，
       栖息地得分 = 被压盖的数字；压盖后该数字不再计入该玩家后续的总面积。
       同一板块可被两名玩家各压盖一次（各自地形），起始板块无数字不可压盖。
   handsum(备选) = 打出手牌后「个人手牌数字总和 ≥ 10」→ 放标记并消耗 1 张手牌。
       注意：此模型与 15 块板块/人、7 枚米宝的配件数在算术上不相容，仅作对照。 */
const RULES = { mode: "area" };

/* ------------------------------------------------- 面积模型：栖息地建立 */
/* 连通区面积 = 区内板块数字之和；该地形已被压盖的数字不计（起始板块无数字） */
function regionArea(cells, terrain) {
  let a = 0;
  for (const r of cells) {
    const c = r.cell;
    if (c.start) continue;
    if (c.cover && c.cover[terrain] !== undefined) continue;
    a += c.tile.n;
  }
  return a;
}

/* 新板块 (x,y) 落下后，检测哪些玩家可以建立栖息地（专家规则不检测闭合） */
function habitatTriggers(x, y) {
  const c = G.board.get(cellKey(x, y));
  if (!c || c.start) return [];
  const out = [];
  for (const t of [...new Set([c.tile.own, c.tile.other])]) {
    const cells = terrainRegion(x, y, t);
    const area = regionArea(cells, t);
    if (area < 10) continue;
    const p = G.players.find(pp => pp.terrain === t);
    if (!p || p.meeples <= 0) continue;
    const candidates = cells.filter(r => !r.cell.start && r.cell.cover[t] === undefined);
    if (!candidates.length) continue;
    out.push({ player: p, terrain: t, area, cells, candidates });
  }
  return out;
}

/* 压盖米宝：terrain 必须属于该玩家保护的物种 */
function placeMeeple(p, key, terrain) {
  const c = G.board.get(key);
  if (!c || c.start) return false;
  if (terrain !== p.terrain) return false;
  if (c.cover[terrain] !== undefined) return false;
  if (p.meeples <= 0) return false;
  c.cover[terrain] = p.idx;
  p.meeples--; p.placedMeeples++;
  logMsg(`${p.name} 在 (${key}) 建立栖息地：压盖数字 ${c.tile.n}，栖息地 +${c.tile.n}（剩余米宝 ${p.meeples}）。`);
  return true;
}

/* 面积模式下的一次性自动结算（AI / 快速模式）：返回放置数
   策略：候选板块数 ≤ 剩余米宝 → 从小到大压盖（可把整片区域榨干，总分最大）
        候选板块数 > 剩余米宝 → 从大到小压盖（每张米宝换取最大分值） */
function autoResolveHabitat(x, y) {
  let placed = 0, guard = 0;
  while (guard++ < 20) {
    const trig = habitatTriggers(x, y);
    if (!trig.length) break;
    let did = false;
    for (const t of trig) {
      const p = t.player;
      const cand = t.candidates.slice();
      cand.sort((a, b) => cand.length <= p.meeples ? a.cell.tile.n - b.cell.tile.n : b.cell.tile.n - a.cell.tile.n);
      if (placeMeeple(p, cellKey(cand[0].x, cand[0].y), t.terrain)) { placed++; did = true; }
    }
    if (!did) break;
  }
  return placed;
}

function handSum(p) {
  return p.hand.reduce((s, t) => s + t.n, 0);
}

/* 可放标记的板块：场上任意未标记板块（专家规则不再限制"自己地形"——
   ASR 中雪豹标记的板块即含非高山地形；标记板块数字计入该玩家栖息地分） */
function markerTargets(p) {
  const res = [];
  for (const [key, c] of G.board) {
    if (c.start) continue;
    if (c.markedBy !== undefined) continue; // already marked
    res.push(key);
  }
  return res;
}

/* 放置标记：fuelIdx = 消耗的手牌下标；targetKey = 标记的场上板块 */
function placeMarker(p, targetKey, fuelIdx) {
  const c = G.board.get(targetKey);
  if (!c || c.start || c.markedBy !== undefined) return false;
  if (p.meeples <= 0) return false;
  if (fuelIdx < 0 || !p.hand[fuelIdx]) return false;
  const fuel = p.hand.splice(fuelIdx, 1)[0];
  p.usedFuel.push(fuel.n);
  p.meeples--; p.placedMeeples++;
  c.markedBy = p.idx;
  logMsg(`${p.name} 放置动物标记于 (${targetKey})「${TERRAIN_META[c.tile.own].name}·${c.tile.n}」，消耗手牌数字 ${fuel.n}（本局失效）。`);
  return true;
}

/* 旧接口保留兼容（面积规则已废弃，返回空供引擎测试引用） */
function expertHabitatCandidates() {
  return [];
}

/* ---------------------------------------------------------------- corridors & scoring */
/* corridor: connected terrain region containing >=2 meeples of matching animal. */
function findCorridors() {
  const out = [];
  const seen = new Set();
  for (const [key, c] of G.board) {
    const terrains = c.start ? c.edges : [c.tile.own, c.tile.other];
    for (const t of terrains) {
      // find region root by BFS from this cell for terrain t
      const [x, y] = key.split(",").map(Number);
      const rk = `r:${x},${y},${t}`;
      if (seen.has(rk)) continue;
      const cells = terrainRegion(x, y, t);
      cells.forEach(r => seen.add(`r:${r.x},${r.y},${t}`));
      /* 竞赛版：廊道判定按「被标记的板块」计（标记=动物在场证据）。
         归属：同一玩家在该连通区内 ≥2 枚标记才算其廊道（多人可各自成立）。 */
      let marked = 0;
      const withMarked = [];
      const byPlayer = {};
      for (const r of cells) {
        const cc = r.cell;
        if (cc.markedBy !== undefined) {
          marked++;
          byPlayer[cc.markedBy] = (byPlayer[cc.markedBy] || 0) + 1;
          withMarked.push({ player: cc.markedBy, key: `${r.x},${r.y}` });
        }
      }
      const owners = Object.keys(byPlayer).filter(k => byPlayer[k] >= 2).map(Number);
      if (owners.length) {
        const closed = regionClosed(cells, t);
        out.push({ terrain: t, cells, meeples: marked, closed, size: cells.length, withMarked, byPlayer, owners });
      }
    }
  }
  return out;
}

/* closed = region has no open edge to empty space (per PROCESS.md adjudication) */
function regionClosed(cells, terrain) {
  for (const r of cells) {
    const c = r.cell;
    const e = c.start ? c.edges : tileEdges(c.tile, c.rot);
    for (let d = 0; d < 4; d++) {
      if (e[d] !== terrain) continue;
      const nb = G.board.get(cellKey(r.x + DIRS[d][0], r.y + DIRS[d][1]));
      if (!nb) return false;               // open edge to void
      const ne = nb.start ? nb.edges[OPP[d]] : tileEdges(nb.tile, nb.rot)[OPP[d]];
      if (ne !== terrain) continue; // bounded by different terrain: fine
    }
  }
  return true;
}

function companionCount(corridor) {
  let n = 0;
  for (const r of corridor.cells) {
    const c = r.cell;
    if (!c.start && c.tile.comp) n++;
  }
  return n;
}

/* 按地形枚举全场上互不重复的连通区 */
function regionsOf(terrain) {
  const out = []; const seen = new Set();
  for (const [key, c] of G.board) {
    const ts = c.start ? c.edges : [c.tile.own, c.tile.other];
    if (!ts.includes(terrain)) continue;
    const [x, y] = key.split(",").map(Number);
    const cells = terrainRegion(x, y, terrain);
    if (cells.some(r => seen.has(cellKey(r.x, r.y)))) continue;
    cells.forEach(r => seen.add(cellKey(r.x, r.y)));
    out.push(cells);
  }
  return out;
}

function scorePlayer(p) {
  let habitat = 0;
  if (RULES.mode === "area") {
    /* 栖息地 = 被自己米宝压盖的板块数字之和 */
    for (const [key, c] of G.board) {
      if (c.start) continue;
      if (c.cover[p.terrain] === p.idx) habitat += c.tile.n;
    }
  } else {
    for (const [key, c] of G.board) {
      if (c.start) continue;
      if (c.markedBy === p.idx) habitat += c.tile.n;
    }
  }
  let corridorScore = 0, bio = 0;
  if (RULES.mode === "area") {
    /* 生态廊道：自己物种地形上，闭合且含 ≥2 枚自己米宝的连通区，得分 = 途经板块数 */
    for (const cells of regionsOf(p.terrain)) {
      let marks = 0;
      for (const r of cells) if (!r.cell.start && r.cell.cover[p.terrain] === p.idx) marks++;
      if (marks < 2 || !regionClosed(cells, p.terrain)) continue;
      corridorScore += cells.length;
      for (const r of cells) if (!r.cell.start && r.cell.tile.comp) bio++;
    }
  } else {
    /* 备选手牌和模式：廊道按标记板块判定，需同一玩家 ≥2 枚标记 */
    const mine = findCorridors().filter(c => c.closed && (c.byPlayer[p.idx] || 0) >= 2);
    for (const c of mine) {
      corridorScore += c.size;
      bio += companionCount(c);
    }
  }
  /* 勘探数据 = 剩余手牌中不同数字之和（同数字只计一次） */
  const uniq = [...new Set(p.hand.map(t => t.n))];
  const handScore = uniq.reduce((s, n) => s + n, 0);
  return { habitat, corridor: corridorScore, bio, hand: handScore, total: habitat + corridorScore + bio + handScore };
}

/* ---------------------------------------------------------------- turn flow */
function endTurnChecks() {
  // 竞赛版：牌堆或动物标记耗尽（ASR：'牌库和动物标记同时使用完毕→最后一轮'，任一耗尽即触发）
  const empty = G.players.some(p => p.deck.length === 0 || p.meeples === 0);
  if (empty && !G.lastRoundFlag) {
    G.lastRoundFlag = true;
    logMsg("有玩家的牌堆或动物标记耗尽——本轮结束后进入最后一轮！");
  }
}

function advanceTurn() {
  G.turnCount++;
  if (G.lastRoundFlag) {
    // last round: everyone plays once more from current pointer, then end
    if (G.turnCount % G.players.length === 0) {
      if (G.finalRoundDone) { finishGame(); return; }
      G.finalRoundDone = true;
      logMsg("—— 最后一轮开始 ——");
    }
  }
  G.cur = (G.cur + 1) % G.players.length;
  const p = G.players[G.cur];
  if (p.hand.length === 0) drawTo(p, 1); // refill before turn
  render();
  // 钩子：交给 UI 层决定「当前玩家是电脑 → 自动行棋」
  if (typeof onAdvanceTurn === "function") onAdvanceTurn();
  // 刷新 HUD（玩家卡片 + 手牌）：人类回合立即显示手牌，电脑回合显示"正在行动"
  if (typeof updateHUD === "function") updateHUD();
}

function finishGame() {
  G.phase = "over";
  const results = G.players.map(p => ({ player: p, score: scorePlayer(p) }));
  results.sort((a, b) => b.score.total - a.score.total);
  logMsg("游戏结束，计分：");
  results.forEach((r, i) => logMsg(`${i + 1}. ${r.player.name} ${r.score.total} 分`));
  if (typeof showResults === "function") showResults(results);
}

/* ---------------------------------------------------------------- ui helpers */
function logMsg(s) {
  G.log.push(s);
  const el = document.getElementById("log");
  if (el) {
    const div = document.createElement("div");
    div.textContent = s;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }
}
