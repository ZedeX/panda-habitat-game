/* 电脑 AI 头less 验证：4 种难度组合各跑若干局，确认能跑完、计分合理、强策略占优
   用法: cd web && node ../tests/ai_test.js [局数] */
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const WEB = path.join(__dirname, "..", "web");
let src = fs.readFileSync(WEB + "/game.js", "utf8");
src = src.split("/* ---------------------------------------------------------------- ui helpers */")[0];
const aiSrc = fs.readFileSync(WEB + "/ai.js", "utf8");
const sandbox = { console, Math, JSON, Set, Map, Object, Array, process };
sandbox.render = () => {};
sandbox.updateHUD = () => {};
sandbox.logMsg = () => {};
sandbox.setTimeout = () => {}; // headless：onAdvanceTurn 钩子里的延迟自动行棋在测试里不需要
// 不定义 onAdvanceTurn → advanceTurn 内的钩子 typeof 为 undefined，不会递归
vm.createContext(sandbox);
sandbox.N = Number(process.argv[2] || 120); // 让 vm 内的 globalThis.N 读到命令行局数
vm.runInContext(src, sandbox);
vm.runInContext(aiSrc, sandbox);

vm.runInContext(`
/* headless 版 finishTurnAfterBuild：ui.js 未载入，这里用引擎原语补齐回合推进 */
function finishTurnAfterBuild() { endTurnChecks(); advanceTurn(); }
const N = globalThis.N || 120;
RULES.mode = "area";

function playAI(configs) {
  newGame(configs);
  let guard = 0;
  while (G.phase !== "over" && guard++ < 3000) {
    const p = G.players[G.cur];
    if (p.hand.length === 0) drawTo(p, 1);
    const pol = makeAIPolicy(p.ai.level, p.ai.style, p.idx);
    const mv = aiChooseMove(p, pol);
    if (mv && p.hand[mv.hi]) { placeTile(p, mv.hi, mv.x, mv.y, mv.r); aiResolve(mv.x, mv.y, p, pol); }
    finishTurnAfterBuild();
  }
  return G.players.map(p => ({ name: p.name, level: p.ai.level, s: scorePlayer(p) }));
}

function runRound(label, configs, n) {
  const agg = configs.map(() => ({ total: 0, hab: 0, cor: 0, win: 0 }));
  for (let i = 0; i < n; i++) {
    const rs = playAI(configs);
    let bi = 0, best = -1;
    rs.forEach((r, j) => { if (r.s.total > best) { best = r.s.total; bi = j; } });
    rs.forEach((r, j) => {
      agg[j].total += r.s.total; agg[j].hab += r.s.habitat; agg[j].cor += r.s.corridor;
      if (j === bi) agg[j].win++;
    });
  }
  console.log("\\n=== " + label + " (" + n + " 局) ===");
  configs.forEach((c, j) => {
    console.log("  P" + j + " [" + c.type + ":" + c.level + "] 均分 " + (agg[j].total / n).toFixed(1) +
      " | 栖息地 " + (agg[j].hab / n).toFixed(1) + " 廊道 " + (agg[j].cor / n).toFixed(1) + " | 胜率 " + (100 * agg[j].win / n).toFixed(0) + "%");
  });
}

const four = (a,b,c,d) => [
  {terrain:"bamboo", type:"ai", level:a, style:0},
  {terrain:"forest", type:"ai", level:b, style:1},
  {terrain:"alpine", type:"ai", level:c, style:0},
  {terrain:"river",  type:"ai", level:d, style:1},
];

runRound("全员困难", four("hard","hard","hard","hard"), N);
runRound("全员中等", four("medium","medium","medium","medium"), N);
runRound("全员简单", four("easy","easy","easy","easy"), N);
runRound("困难 vs 简单×3", four("hard","easy","easy","easy"), N);
runRound("困难 vs 中等×3", four("hard","medium","medium","medium"), N);
runRound("中等 vs 简单×3", four("medium","easy","easy","easy"), N);
`, sandbox);

const N = Number(process.argv[2] || 120);
sandbox.N = N;
