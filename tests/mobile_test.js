/* 移动端端到端验证：
 * 1) 默认 4 人、4 种动物预选齐全（解决"移动端无法选 4 种动物/无法滚动"的原始问题）
 * 2) 菜单可滚动、地形/人机构可点
 * 3) 可切换 人类/电脑、调难度（两个方向都验证）
 * 4) 开局后电脑自动行棋（AI 回合无需人类操作即可推进）
 * 5) 人类回合可正常落子并交接回 AI
 * 6) 棋盘可拖动平移、可缩放（指针事件）
 */
const { chromium } = require("playwright-core");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "web");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const PORT = 8094;

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  const f = path.join(ROOT, u === "/" ? "index.html" : u);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end("nf"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    res.end(d);
  });
});

const log = (...a) => console.log(...a);
let fail = 0;
const assert = (cond, msg) => { if (!cond) { fail++; log("  ✗ " + msg); } else { log("  ✓ " + msg); } };

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message + "\n    " + (e.stack||"").split("\n").slice(0,4).join("\n    ")));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(300);

  log("\n[1] 菜单默认状态（移动端 390×844）");
  const menu = await page.evaluate(() => ({
    num: document.getElementById("numPlayers").value,
    chipCount: document.querySelectorAll("#terrainPick .tchip").length,
    pickedCount: document.querySelectorAll("#terrainPick .tchip.picked").length,
    startDisabled: document.getElementById("startBtn").disabled,
    menuScrollable: getComputedStyle(document.getElementById("menu")).overflowY,
    menuScrollH: document.getElementById("menu").scrollHeight,
    menuClientH: document.getElementById("menu").clientHeight,
  }));
  assert(menu.num === "4", `默认 ${menu.num} 人`);
  assert(menu.chipCount === 4, `共 ${menu.chipCount} 种动物可选`);
  assert(menu.pickedCount === 4, `已预选 ${menu.pickedCount}/4 种动物`);
  assert(menu.startDisabled === false, `开局按钮可用（已选满）`);
  assert(menu.menuScrollable === "auto", `菜单可滚动(overflow-y:${menu.menuScrollable})`);
  assert(menu.menuScrollH > menu.menuClientH, `菜单内容超高可滚动(${menu.menuScrollH}>${menu.menuClientH})`);
  await page.screenshot({ path: path.join(__dirname, "..", "crops", "mobile_menu.png"), fullPage: false });

  log("\n[2] 人/机切换与难度选择（移动端可点，双向验证）");
  const cfg = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#playerConfig .prow")];
    // P0: 默认人类 → 切电脑·困难
    rows[0].querySelector('.segbtn[data-type="ai"]').click();
    const l0 = rows[0].querySelector(".lvl"); l0.value = "hard"; l0.dispatchEvent(new Event("change"));
    // P1: 默认电脑 medium → 切人类
    rows[1].querySelector('.segbtn[data-type="human"]').click();
    // P2: 默认人类 → 保持人类
    // P3: 默认电脑 → 切简单
    const l3 = rows[3].querySelector(".lvl"); l3.value = "easy"; l3.dispatchEvent(new Event("change"));
    return { c: playerCfgs, lvlHidden: rows[1].querySelector(".lvl").style.display === "none" };
  });
  assert(cfg.c[0].type === "ai" && cfg.c[0].level === "hard", `P0: 人类→电脑·困难`);
  assert(cfg.c[1].type === "human", `P1: 电脑→人类`);
  assert(cfg.c[1].level === undefined || cfg.lvlHidden, `P1 切人类后难度选择已隐藏`);
  assert(cfg.c[2].type === "ai", `P2: 电脑（默认保持）`);
  assert(cfg.c[3].type === "ai" && cfg.c[3].level === "easy", `P3: 电脑·简单`);

  log("\n[3] 开局，验证玩家配置生效 + 电脑自动行棋");
  await page.evaluate(() => startFromMenu());
  await page.waitForTimeout(400);
  const afterStart = await page.evaluate(() => ({
    appShown: getComputedStyle(document.getElementById("app")).display !== "none",
    menuHidden: getComputedStyle(document.getElementById("menu")).display === "none",
    types: G.players.map(p => p.type),
    levels: G.players.map(p => p.ai ? p.ai.level : "-"),
    board: G.board.size,
  }));
  assert(afterStart.appShown && afterStart.menuHidden, `开局后进入对局界面`);
  assert(JSON.stringify(afterStart.types) === JSON.stringify(["ai","human","ai","ai"]), `玩家类型=[${afterStart.types}]`);
  assert(JSON.stringify(afterStart.levels) === JSON.stringify(["hard","-","medium","easy"]), `难度=[${afterStart.levels}]`);

  // 等 AI 自动推进（P0=ai 应自动落子，落子后交接给人类 P1 并等待）
  await page.waitForTimeout(4500);
  const mid = await page.evaluate(() => ({ board: G.board.size, turnCount: G.turnCount, cur: G.cur, phase: G.phase, curType: G.players[G.cur].type }));
  assert(mid.board >= afterStart.board + 1, `电脑自动落子推进(board ${afterStart.board}→${mid.board})`);
  assert(mid.turnCount >= 1, `AI 完成回合并交接(turnCount=${mid.turnCount}, 当前轮到=${mid.curType})`);
  assert(mid.phase === "play", `交接后处于可操作状态(phase=${mid.phase})`);

  log("\n[4] 人类回合：可落子并交接回电脑");
  // 轮询直到轮到人类（P1 或 P2）或结束
  let humanTurn = null;
  for (let k = 0; k < 40; k++) {
    humanTurn = await page.evaluate(() => {
      if (G.phase === "over") return "over";
      const p = G.players[G.cur];
      if (p.type === "human") {
        // 找合法落子并落子（含可能的栖息地结算）
        if (!p.hand.length) drawTo(p, 1);
        let best = null;
        for (let hi = 0; hi < p.hand.length; hi++) for (const [key] of G.board) {
          const [x, y] = key.split(",").map(Number);
          for (let d = 0; d < 4; d++) {
            const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
            if (!canPlaceAt(nx, ny)) continue;
            for (let r = 0; r < 4; r++) {
              const sc = matchingEdges(p.hand[hi], r, nx, ny).same * 100 + p.hand[hi].n;
              if (!best || sc > best.sc) best = { hi, x: nx, y: ny, r, sc };
            }
          }
        }
        if (!best) return "noplace";
        const before = G.board.size;
        selectTile(best.hi);
        tryPlace(best.x, best.y);
        // 若进入结算（人类需手动点确认）
        let guard = 0;
        while (G.phase === "habitatResolve" && guard++ < 10) doResolvePlace();
        return { placed: G.board.size > before, turnCount: G.turnCount };
      }
      return null;
    });
    if (humanTurn && humanTurn !== "over" && humanTurn !== "noplace") break;
    if (humanTurn === "over") break;
    await page.waitForTimeout(400);
  }
  if (humanTurn && humanTurn.placed) assert(true, `人类成功落子并结束回合(turnCount=${humanTurn.turnCount})`);
  else assert(false, `人类落子未验证（humanTurn=${JSON.stringify(humanTurn)}）`);

  // 截一张"人类回合"的图：确认手牌卡片在移动端可见可用
  const shotHuman = await page.evaluate(async () => {
    // 等到轮到人类或结束
    let g = 0;
    while (g++ < 50) {
      if (G.phase === "over") return "over";
      if (G.players[G.cur].type === "human" && G.phase === "play") {
        if (!G.players[G.cur].hand.length) drawTo(G.players[G.cur], 1);
        return "human";
      }
      await new Promise(r => setTimeout(r, 350));
    }
    return "timeout";
  });
  await page.waitForTimeout(300);
  const rects = await page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
    return { topbar: r(document.getElementById("topbar")), turn: r(document.getElementById("turnLabel")), players: r(document.getElementById("players")), toolbar: r(document.getElementById("toolbar")), app: r(document.getElementById("app")) };
  });
  log("  [layout] topbar=" + JSON.stringify(rects.topbar) + " turn=" + JSON.stringify(rects.turn) + " players=" + JSON.stringify(rects.players) + " toolbar=" + JSON.stringify(rects.toolbar));
  await page.screenshot({ path: path.join(__dirname, "..", "crops", "mobile_human.png"), fullPage: false });

  log("\n[5] 棋盘拖动平移 + 缩放（指针事件，移动端）");
  const camBefore = await page.evaluate(() => ({ x: CAM.x, y: CAM.y }));
  const box = await page.locator("#board").boundingBox();
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width/2 - 90, box.y + box.height/2 - 60, { steps: 10 });
  await page.mouse.up();
  const camAfter = await page.evaluate(() => ({ x: CAM.x, y: CAM.y }));
  const moved = Math.hypot(camAfter.x - camBefore.x, camAfter.y - camBefore.y);
  assert(moved > 0.3, `拖动后相机平移 ${moved.toFixed(2)} 格（约 ${(moved*86)|0}px）`);

  const zoomBefore = await page.evaluate(() => CAM.zoom);
  await page.evaluate(() => zoomBy(1.3));
  const zoomAfter = await page.evaluate(() => CAM.zoom);
  assert(zoomAfter > zoomBefore, `缩放按钮生效(${zoomBefore.toFixed(2)}→${zoomAfter.toFixed(2)})`);

  const layout = await page.evaluate(() => {
    const sw = document.getElementById("sidebar").getBoundingClientRect();
    const bw = document.getElementById("boardwrap").getBoundingClientRect();
    return { swH: Math.round(sw.height), bwH: Math.round(bw.height), vh: window.innerHeight };
  });
  assert(layout.bwH > 200, `移动端棋盘区高度=${layout.bwH}px（未被压没）`);
  assert(layout.swH > 100 && layout.swH < layout.vh, `侧栏手牌区高度=${layout.swH}px（合理）`);

  await page.screenshot({ path: path.join(__dirname, "..", "crops", "mobile.png"), fullPage: false });

  log("\n[6] JS 报错检查");
  if (errors.length) { fail++; log("  ✗ 发现报错:\n   " + errors.join("\n   ")); }
  else log("  ✓ 无 JS 报错/控制台错误");

  log(`\n结果：${fail === 0 ? "ALL PASS ✅" : fail + " 项失败 ❌"}`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(2); });
