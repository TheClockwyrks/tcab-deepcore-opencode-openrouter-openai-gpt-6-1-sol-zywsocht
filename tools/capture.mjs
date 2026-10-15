/* global document, KeyboardEvent */
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { log } from "node:console";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (error) => {
  throw error;
});
await page.route("**/capture.html", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<html><body style="margin:0;background:#0b1721"><canvas style="width:100vw;height:100vh;display:block"></canvas></body></html>',
  }),
);
await page.goto("http://localhost:5173/capture.html");
const handle = await page.evaluateHandle(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const engine = createEngine({
    canvas: document.querySelector("canvas"),
    width: 1280,
    height: 720,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 30),
  });
  await engine.initialize();
  return engine;
});
await handle.evaluate(async (e) => {
  await e.advance(1);
});
await page.screenshot({ path: "showcase/title.png" });
await handle.evaluate(async (e) => {
  e.apply((s) => e.debug.setWorldSize(s, "quick"));
  e.apply((s) => e.debug.generateMine(s));
  e.apply((s) => e.debug.setScreen(s, "in-mine"));
  await e.advance(1);
});
await page.screenshot({ path: "showcase/surface.png" });
await handle.evaluate(async (e) => {
  e.apply((s) => e.debug.setTier(s, "fuel", 5));
  e.apply((s) => e.debug.setFuel(s, 550));
  e.apply((s) => e.debug.setTier(s, "hull", 5));
  e.apply((s) => e.debug.setHull(s, 450));
  e.apply((s) => e.debug.setTier(s, "drill", 3));
  for (let row = 59; row < 66; row++)
    e.apply((s) => e.debug.setTile(s, 15, row, "tunnel"));
  for (let row = 66; row < 76; row++)
    e.apply((s) =>
      e.debug.setOreTile(s, 15, row, row % 2 ? "argenite" : "cuprite"),
    );
  e.apply((s) => e.debug.setMinerPosition(s, 15 * 80 + 12, 66 * 80 - 72));
  await e.advance(1);
  e.startRecording();
});
await page.keyboard.down("s");
await handle.evaluate(async (e) => {
  await e.advance(120);
});
await page.keyboard.up("s");
await page.keyboard.down("Space");
await handle.evaluate(async (e) => {
  await e.advance(60);
});
await page.keyboard.up("Space");
const recording = await handle.evaluate((e) => e.stopRecording());
await writeFile(
  "showcase/descent.json.gz",
  gzipSync(JSON.stringify(recording), { level: 9 }),
);
await handle.evaluate(async (e) => {
  e.apply((s) => e.debug.setTier(s, "scanner", 3));
  e.apply((s) => e.debug.setTier(s, "radiator", 4));
  for (let row = 156; row < 164; row++)
    for (let col = 12; col < 18; col++)
      e.apply((s) => e.debug.setTile(s, col, row, "tunnel"));
  for (let row = 163; row < 166; row++)
    for (let col = 12; col < 21; col++)
      e.apply((s) => e.debug.setTile(s, col, row, "lava"));
  for (let row = 156; row < 164; row++)
    e.apply((s) =>
      e.debug.setOreTile(s, 18, row, row % 3 ? "voltite" : "cobaltine"),
    );
  e.apply((s) => e.debug.setMaterialTile(s, 20, 160, "cryenite"));
  e.apply((s) => e.debug.setTile(s, 10, 158, "gas"));
  e.apply((s) => e.debug.clearCargo(s));
  e.apply((s) => e.debug.setCargo(s, "cobaltine", 4));
  e.apply((s) => e.debug.setCargo(s, "voltite", 3));
  e.apply((s) => e.debug.setCredits(s, 2180));
  e.apply((s) => e.debug.setRocketInstalled(s, 2));
  e.apply((s) => e.debug.setMinerPosition(s, 16 * 80 + 12, 160 * 80));
  e.apply((s) => e.debug.setMinerVelocity(s, 0, 0));
  e.apply((s) => e.debug.setCameraLead(s, 0));
  e.apply((s) => e.debug.setMinerTravel(s, false));
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
  await e.advance(45);
});
await page.screenshot({ path: "showcase/deepstone.png" });
await handle.evaluate((e) => e.destroy());
await browser.close();
log(`Captured ${recording.frames.length} live frames and three screenshots.`);
