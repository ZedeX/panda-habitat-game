const { chromium } = require("playwright-core");
const path = require("path");

(async () => {
  const browser = await chromium.launch({
    channel: "msedge",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-gl=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERR: " + e.message));

  const target = process.env.TARGET_URL || ("file://" + path.resolve("web/index.html"));
  await page.goto(target, { waitUntil: "load" });

  // Directly test whether each meeple PNG loads as an Image in the browser.
  const result = await page.evaluate(async () => {
    const names = ["meeple_panda.png", "meeple_musk.png", "meeple_snow.png", "meeple_otter.png"];
    const out = {};
    for (const n of names) {
      const im = new Image();
      const p = new Promise((res) => {
        im.onload = () => res({ ok: true, w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = (e) => res({ ok: false, err: String(e) });
      });
      im.src = "assets/" + n;
      const r = await Promise.race([p, new Promise((res) => setTimeout(() => res({ ok: false, err: "timeout" }), 5000))]);
      out[n] = r;
    }
    return out;
  });

  console.log("MEEPLE LOAD RESULT:", JSON.stringify(result, null, 2));
  console.log("PAGE ERRORS:", errors.length ? errors : "none");
  await browser.close();
})();
