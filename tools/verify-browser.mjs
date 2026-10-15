import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { log } from "node:console";
import assert from "node:assert/strict";
import { URL } from "node:url";

const prefix = "/games/deepcore/";
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".json": "application/json",
  ".wav": "audio/wav",
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith(prefix)) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const name = url.pathname.slice(prefix.length) || "index.html";
    const data = await readFile(resolve("dist", name));
    res.writeHead(200, {
      "Content-Type": mime[extname(name)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(4178, "127.0.0.1", r));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const size of [
    { width: 1280, height: 720, dpr: 1 },
    { width: 720, height: 980, dpr: 2 },
  ]) {
    const page = await browser.newPage({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: size.dpr,
    });
    const errors = [];
    const loaded = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(`${r.status()}: ${r.url()}`);
      if (r.url().endsWith(".png")) loaded.push(r.url());
    });
    await page.goto(`http://127.0.0.1:4178${prefix}`);
    await page.waitForTimeout(1100);
    assert.deepEqual(errors, [], "Production assets must load without errors");
    assert(
      loaded.length > 70,
      `All original sprites must be loaded (${loaded.length} arrived)`,
    );
    assert(
      loaded.every((url) => url.includes(prefix)),
      "Assets must stay under the nested base path",
    );
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(120);
    }
    await page.keyboard.down("s");
    await page.waitForTimeout(1500);
    await page.keyboard.up("s");
    await page.keyboard.press("i");
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    await page.keyboard.down("Space");
    await page.waitForTimeout(1100);
    await page.keyboard.up("Space");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    assert.deepEqual(
      errors,
      [],
      `No browser errors at ${size.width} × ${size.height}`,
    );
    await page.close();
    log(
      `Production browser check passed: nested base, ${size.width}×${size.height}, DPR ${size.dpr}, ${loaded.length} sprite loads.`,
    );
  }
} finally {
  await browser.close();
  server.close();
}
