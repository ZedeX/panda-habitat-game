/* 端到端冒烟：启动静态服务 → 开局 → 自动走 12 步 → 检查无 JS 报错、能触发栖息地结算 */
const { chromium } = require(process.env.PW || "playwright-core");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "web");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  const f = path.join(ROOT, u === "/" ? "index.html" : u);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end("nf"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    res.end(d);
  });
});

(async () => {
  await new Promise(r => server.listen(8093, r));
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto("http://127.0.0.1:8093/index.html", { waitUntil: "load" });
  await page.evaluate(() => {
    document.getElementById("numPlayers").value = "4";
    picked = ["alpine", "river", "bamboo", "forest"];
    startFromMenu();
  });
  await page.waitForTimeout(400);

  // 自动走 12 步：选第 0 张手牌 → 找一个合法空位 → 落子 → 若进入结算则点确认
  for (let i = 0; i < 80; i++) {
    const acted = await page.evaluate(() => {
      if (typeof G === "undefined") return "noG";
      if (G.phase === "over") return "over";
      if (G.phase === "habitatResolve") { const t = pendingResolves[0]; doResolvePlace();
        return "resolve pend=" + pendingResolves.length + " " + (t ? t.player.name + "/" + t.terrain + "/" + t.area : "none") + " -> mk" + G.players.map(x => x.placedMeeples).join(","); }
      const p = G.players[G.cur];
      if (!p.hand.length) { drawTo(p, 1); }
      let best = null;
      for (let hi = 0; hi < p.hand.length; hi++) for (const [key] of G.board) {
        const [x, y] = key.split(",").map(Number);
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (!canPlaceAt(nx, ny)) continue;
          for (let r = 0; r < 4; r++) {
            const m = matchingEdges(p.hand[hi], r, nx, ny);
            const sc = m.same * 100 + p.hand[hi].n;
            if (!best || sc > best.sc) best = { hi, x: nx, y: ny, r, sc };
          }
        }
      }
      if (best) { tryPlace(best.x, best.y, best.r, best.hi); return "place"; }
      return "none";
    });
    if (String(acted).startsWith("resolve")) console.log(i, acted);
    if (acted === "over") break;
    await page.waitForTimeout(120);
  }

  const state = await page.evaluate(() => ({
    phase: typeof G !== "undefined" ? G.phase : "?",
    board: typeof G !== "undefined" ? G.board.size : -1,
    meeples: typeof G !== "undefined" ? G.players.map(p => p.placedMeeples) : [],
    scores: typeof G !== "undefined" ? G.players.map(p => scorePlayer(p).total) : [],
    mode: typeof RULES !== "undefined" ? RULES.mode : "?",
  }));
  await page.screenshot({ path: path.join(__dirname, "..", "crops", "smoke.png") });
  console.log("STATE:", JSON.stringify(state));
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "NO JS ERRORS");
  await browser.close();
  server.close();
  process.exit(errors.length ? 1 : 0);
})();
