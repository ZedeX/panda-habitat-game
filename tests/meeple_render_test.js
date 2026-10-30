const { chromium } = require("playwright-core");
const path = require("path");

(async () => {
  const browser = await chromium.launch({
    channel: "msedge",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-gl=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERR: " + e.message));
  const fileUrl = "file://" + path.resolve("web/index.html");
  await page.goto(fileUrl, { waitUntil: "load" });

  const r = await page.evaluate(() => {
    try {
      startFromMenu();           // real start: sets up players, canvas, HUD
      const setup = [
        ["1,0", "bamboo", "forest", "bamboo", 0],
        ["2,0", "forest", "alpine", "forest", 1],
        ["3,0", "alpine", "river", "alpine", 2],
        ["4,0", "river", "bamboo", "river", 3],
      ];
      for (const [k, own, other, terr, idx] of setup) {
        const [x, y] = k.split(",").map(Number);
        G.board.set(k, { tile: { own, other, n: 1 }, rot: 0, x, y, edges: [], markedBy: undefined, cover: {} });
        G.board.get(k).cover[terr] = idx;
      }
      G.phase = "play";
      render();
      return "ok players=" + G.players.length + " board=" + G.board.size;
    } catch (e) {
      return "ERR: " + e.message + "\n" + e.stack;
    }
  });
  console.log("EVAL:", r);
  console.log("PAGE ERRORS:", errs.length ? errs : "none");

  await page.waitForTimeout(1500); // let meeple+tile PNGs load, then re-render
  await page.evaluate(() => render());
  await page.waitForTimeout(300);

  const dims = await page.evaluate(() => {
    const c = document.getElementById("board");
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, rectW: r.width, rectH: r.height, top: r.top, left: r.left };
  });
  console.log("CANVAS DIMS:", JSON.stringify(dims));

  await page.screenshot({ path: "tests/_meeple_board.png" });
  console.log("screenshot saved");
  await browser.close();
})();
