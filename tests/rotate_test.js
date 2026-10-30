/* 旋转交互验证：
 * 1) R 键旋转（含 Shift+R 反向）
 * 2) 鼠标右键（contextmenu）旋转且不误触落子
 * 3) 悬浮按钮：选中手牌时显示、落子后隐藏、点击旋转
 * 4) rotBtn 工具栏按钮旋转
 */
const { chromium } = require("playwright-core");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "web");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const PORT = 8097;

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

const launchOptsList = [{ channel: "msedge" }, {}]; // 优先 Edge，缺失时回退 chromium

(async () => {
  await new Promise(r => server.listen(PORT, r));
  let browser, err;
  for (const opts of launchOptsList) {
    try { browser = await chromium.launch(opts); break; }
    catch (e) { err = e; log("  (launch 回退) " + (opts.channel || "chromium") + ": " + e.message.split("\n")[0]); }
  }
  if (!browser) { console.error("无法启动浏览器", err); process.exit(2); }

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(200);

  // 全设为人类，保证确定性（无 AI 干扰）
  await page.evaluate(() => { playerCfgs.forEach(c => { c.type = "human"; }); });
  await page.evaluate(() => startFromMenu());
  await page.waitForTimeout(300);

  log("\n[1] 选中手牌：悬浮旋转按钮应出现");
  const sel = await page.evaluate(() => {
    const before = G.selRot;
    selectTile(0);
    const fr = document.getElementById("floatRot");
    return { before, selRot: G.selRot, placing: !!placingTile, frShown: fr.classList.contains("show"), rb: document.getElementById("rotBtn").textContent };
  });
  assert(sel.placing, `已选中手牌(placingTile 存在)`);
  assert(sel.frShown, `悬浮旋转按钮显示(.show)`);
  assert(sel.rb.includes("0°"), `工具栏旋转按钮文案基准(${sel.rb})`);

  log("\n[2] R 键旋转 +1，Shift+R 反向 -1");
  const k1 = await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" })); return G.selRot; });
  assert(k1 === 1, `按 R → selRot=${k1}`);
  const k2 = await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" })); return G.selRot; });
  assert(k2 === 2, `再按 R → selRot=${k2}`);
  const k3 = await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", shiftKey: true })); return G.selRot; });
  assert(k3 === 1, `Shift+R 反向 → selRot=${k3}`);

  log("\n[3] 右键（contextmenu）旋转 +1，且不误触落子");
  const board = await page.evaluate(() => ({ boardSize: G.board.size }));
  const rc = await page.evaluate(() => {
    document.getElementById("board").dispatchEvent(new MouseEvent("contextmenu", { button: 2, bubbles: true }));
    return { selRot: G.selRot, boardSize: G.board.size, placing: !!placingTile };
  });
  assert(rc.selRot === 2, `右键旋转后 selRot=${rc.selRot}`);
  assert(rc.boardSize === board.boardSize, `右键未误触发落子(board 不变=${rc.boardSize})`);

  log("\n[4] 悬浮按钮点击旋转 +1");
  const fb = await page.evaluate(() => { document.getElementById("floatRot").click(); return G.selRot; });
  assert(fb === 3, `点击悬浮按钮 → selRot=${fb}`);

  log("\n[5] 工具栏 rotBtn 旋转 +1");
  const tb = await page.evaluate(() => { document.getElementById("rotBtn").click(); return G.selRot; });
  assert(tb === 0, `rotBtn 点击（模 4 回绕）→ selRot=${tb}`);

  log("\n[6] 落子后悬浮按钮隐藏");
  const placed = await page.evaluate(() => {
    // 找一个合法落子点
    let best = null;
    for (let hi = 0; hi < G.players[G.cur].hand.length; hi++) for (const [key] of G.board) {
      const [x, y] = key.split(",").map(Number);
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!canPlaceAt(nx, ny)) continue;
        for (let r = 0; r < 4; r++) {
          const sc = matchingEdges(G.players[G.cur].hand[hi], r, nx, ny).same * 100 + G.players[G.cur].hand[hi].n;
          if (!best || sc > best.sc) best = { hi, x: nx, y: ny, r };
        }
      }
    }
    if (!best) return { ok: false };
    const before = G.board.size;
    selectTile(best.hi);
    tryPlace(best.x, best.y);
    let guard = 0; while (G.phase === "habitatResolve" && guard++ < 10) doResolvePlace();
    const fr = document.getElementById("floatRot");
    return { ok: G.board.size > before, frShown: fr.classList.contains("show"), placing: !!placingTile };
  });
  assert(placed.ok, `成功落子(board 增加)`);
  assert(!placed.frShown, `落子后悬浮按钮隐藏`);
  assert(!placed.placing, `落子后 placingTile 清空`);

  log("\n[7] JS 报错检查");
  if (errors.length) { fail++; log("  ✗ 发现报错:\n   " + errors.join("\n   ")); }
  else log("  ✓ 无 JS 报错/控制台错误");

  log(`\n结果：${fail === 0 ? "ALL PASS ✅" : fail + " 项失败 ❌"}`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(2); });
