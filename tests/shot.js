/* 中局截图：开局 -> 走 N 步 -> 存 crops/board_mid.png（含完整棋盘与手牌） */
const { chromium } = require("playwright-core");
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = "C:/Users/zx/WorkBuddy/2026-10-29-09-50-23/panda_game/web";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
               ".png": "image/png", ".json": "application/json" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  const f = path.join(ROOT, u === "/" ? "index.html" : u);
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); r.end("nf"); return; }
    r.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    r.end(d);
  });
});

(async () => {
  await new Promise(r => server.listen(8096, r));
  const b = await chromium.launch({ channel: "msedge" });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
  p.on("response", r => { if (r.status() >= 400) console.log("HTTP" + r.status() + " " + r.url()); });
  p.on("pageerror", e => console.log("PAGEERR", e.message));
  p.on("console", m => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
  await p.goto("http://127.0.0.1:8096/index.html", { waitUntil: "load" });
  await p.evaluate(() => {
    document.getElementById("numPlayers").value = "4";
    picked = ["bamboo", "forest", "alpine", "river"];
    startFromMenu();
  });
  await p.waitForTimeout(600);

  const STEPS = Number(process.argv[2] || 26);
  for (let i = 0; i < STEPS; i++) {
    const acted = await p.evaluate(() => {
      if (G.phase === "over") return "over";
      if (G.phase === "habitatResolve") { doResolvePlace(); return "resolve"; }
      const pl = G.players[G.cur];
      if (!pl.hand.length) drawTo(pl, 1);
      let best = null;
      for (let hi = 0; hi < pl.hand.length; hi++) for (const [key] of G.board) {
        const [x, y] = key.split(",").map(Number);
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (!canPlaceAt(nx, ny)) continue;
          for (let r = 0; r < 4; r++) {
            const m = matchingEdges(pl.hand[hi], r, nx, ny);
            const sc = m.same * 100 + pl.hand[hi].n;
            if (!best || sc > best.sc) best = { hi, x: nx, y: ny, r, sc };
          }
        }
      }
      if (best) { tryPlace(best.x, best.y, best.r, best.hi); return "place"; }
      return "none";
    });
    if (acted === "over") break;
    await p.waitForTimeout(50);
  }
  // 收尾：确保停在出牌阶段，手牌可见
  await p.evaluate(() => {
    if (G.phase === "habitatResolve") { G.phase = "play"; document.getElementById("resolve").style.display = "none"; }
    render(); updateHUD();
  });
  await p.waitForTimeout(300);
  const out = process.argv[3] || "crops/board_mid.png";
  await p.screenshot({ path: out });
  console.log("saved", out, await p.evaluate(() => JSON.stringify({
    phase: G.phase, board: G.board.size, hand: G.players[G.cur].hand.length,
    meeples: G.players.map(x => x.placedMeeples)
  })));
  await b.close(); server.close();
})();
