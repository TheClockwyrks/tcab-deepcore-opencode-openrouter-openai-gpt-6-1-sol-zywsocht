import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  type Engine,
  type Game,
} from "@clockwyrks/simple-2d";
import { game, type DeepcoreState, type DeepcoreDebugApi } from "./game";
import * as C from "./constants";
import { at, copy, initial, maxFuel } from "./model";
import { advance, camera } from "./simulation";
import { generate } from "./world";
import { debug } from "./debug";
import { controls, menu, menuRect } from "./interface";

// The real engine, input event target, counted clock and native canvas. Only the
// browser's image/audio decoding is substituted; simulation and rendering run.
let engine: Engine<DeepcoreState, DeepcoreDebugApi>;
let target: EventTarget;
const store = new Map<string, string>();
beforeEach(async () => {
  store.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    },
  });
  target = new EventTarget();
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const fixture: Game<DeepcoreState, DeepcoreDebugApi> = {
    ...game,
    initialize(api) {
      return game.initialize({
        ...api,
        assets: {
          ...api.assets,
          loadImage: async () => createCanvas(80, 80) as unknown as ImageBitmap,
          load: async () =>
            new Blob([
              JSON.stringify({
                dimensions: 2,
                field: { width: 256, height: 256 },
                durationMs: 1000,
                fps: 30,
                loop: false,
                emitters: [],
                forces: {},
                subEmitters: [],
              }),
            ]),
        },
        audio: {
          ...api.audio,
          load: async (name) =>
            api.audio.define(name, { freq: 100, durationMs: 20 }),
        },
      });
    },
  };
  engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game: fixture,
    background: "#0b1721",
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  await engine.initialize();
});
afterEach(() => engine.destroy());
function key(code: string, down = true): void {
  target.dispatchEvent(
    Object.assign(new Event(down ? "keydown" : "keyup"), {
      code,
      repeat: false,
    }),
  );
}
async function tap(code: string): Promise<void> {
  key(code);
  await engine.advance(1);
  key(code, false);
  await engine.advance(1);
}
function pose(
  fn: (s: Parameters<DeepcoreDebugApi["snapshot"]>[0]) => DeepcoreState,
): void {
  engine.apply(fn);
}
function ready(): void {
  pose((s) => debug.setScreen(s, "in-mine"));
}
function pointer(type: string, x: number, y: number, id = 1): void {
  target.dispatchEvent(
    Object.assign(new Event(type), {
      clientX: x,
      clientY: y,
      pointerId: id,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
    }),
  );
}

describe("engine-driven expedition", () => {
  it("starts through keyboard menus, pauses, and resumes without spending fuel on the surface", async () => {
    expect(engine.debug.snapshot(engine.state).screen).toBe("title");
    await tap("Enter");
    expect(engine.state.screen).toBe("mode-select");
    await tap("Enter");
    expect(engine.state.screen).toBe("size-select");
    await tap("Enter");
    expect(engine.state.worldSize).toBe("quick");
    expect(engine.state.screen).toBe("in-mine");
    await engine.advance(60);
    expect(engine.state.miner.fuel).toBe(100);
    await tap("Escape");
    const elapsed = engine.state.elapsedSeconds;
    await engine.advance(60);
    expect(engine.state.elapsedSeconds).toBe(elapsed);
    await tap("KeyP");
    expect(engine.state.screen).toBe("in-mine");
    expect(engine.diagnostics().every((d) => d.error === undefined)).toBe(true);
  });
  it("requires both pointer edges in the same region and wraps keyboard selection", async () => {
    const r = menuRect(engine.state, 0)!;
    pointer("pointerdown", r.x + 10, r.y + 10);
    pointer("pointerup", 10, 10);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    await tap("ArrowUp");
    expect(engine.state.menuIndex).toBe(1);
    pointer("pointerdown", r.x + 10, r.y + 10);
    pointer("pointerup", r.x + 10, r.y + 10);
    await engine.advance(1);
    expect(engine.state.screen).toBe("mode-select");
  });
  it("mines health at the specified cadence, banks ore, and leaves old state unchanged", async () => {
    ready();
    pose((s) => debug.setTile(s, 4, 1, "rock"));
    pose((s) => debug.setOreTile(s, 4, 2, "ferron"));
    pose((s) => debug.setTile(s, 4, 3, "rock"));
    const old = engine.state;
    key("KeyS");
    await engine.advance(30);
    expect(debug.tileAt(engine.state, 4, 1).kind).toBe("tunnel");
    await engine.advance(30);
    key("KeyS", false);
    expect(engine.state.cargo.ferron).toBe(1);
    expect(debug.tileAt(old, 4, 1).health).toBe(4);
    expect(old.miner.fuel).toBe(100);
    expect(engine.state.miner.fuel).toBeCloseTo(97.6, 1);
  });
  it("holds travel without holding the drill, and holds the drill without spending hit fuel", async () => {
    ready();
    pose((s) => debug.setTile(s, 4, 1, "rock"));
    pose((s) => debug.setMinerTravel(s, false));
    key("KeyS");
    await engine.advance(30);
    expect(engine.state.miner.y).toBe(8);
    expect(at(engine.state, 4, 1).kind).toBe("tunnel");
    pose((s) => debug.setTile(s, 4, 1, "rock"));
    pose((s) => debug.setMinerDrill(s, false));
    const fuel = engine.state.miner.fuel;
    await engine.advance(60);
    expect(at(engine.state, 4, 1).health).toBe(4);
    expect(engine.state.miner.fuel).toBe(fuel);
  });
  it("climbs only below the load limit and lets discarded ore restore lift", async () => {
    ready();
    pose((s) => debug.setMinerPosition(s, 332, 900));
    pose((s) => debug.setMinerTravel(s, true));
    pose((s) => debug.setCargo(s, "ferron", 35));
    key("Space");
    await engine.advance(30);
    expect(engine.state.miner.vy).toBe(0);
    pose((s) => debug.dropOre(s, "ferron"));
    await engine.advance(30);
    expect(engine.state.miner.vy).toBeLessThan(0);
    expect(engine.state.miner.fuel).toBeLessThan(100);
  });
  it("checks death even while an inventory overlay is open", async () => {
    ready();
    pose((s) => debug.setPanel(s, "inventory"));
    pose((s) => debug.setHull(s, 0));
    await engine.advance(1);
    expect(engine.state.screen).toBe("game-over");
    expect(engine.state.summary?.deathCause).toBe("hull-destroyed");
  });
  it("lets a core timer run inside panels but freezes it in pause", async () => {
    ready();
    pose((s) => debug.setCoreCarried(s, true));
    pose((s) => debug.setPanel(s, "inventory"));
    await engine.advance(60);
    expect(engine.state.coreTimer).toBeCloseTo(89);
    pose((s) => debug.setScreen(s, "paused"));
    await engine.advance(120);
    expect(engine.state.coreTimer).toBeCloseTo(89);
    pose((s) => debug.setScreen(s, "in-mine"));
    pose((s) => debug.setCoreTimer(s, 0.1));
    await engine.advance(12);
    expect(engine.state.summary?.deathCause).toBe("core-detonation");
  });
  it("jettisons a sample without resetting it and survives a distant blast", async () => {
    ready();
    pose((s) => debug.setCoreCarried(s, true));
    pose((s) => debug.setCoreTimer(s, 0.2));
    pose((s) => debug.jettison(s));
    pose((s) => debug.setMinerPosition(s, 1100, 8));
    await engine.advance(30);
    expect(engine.state.coreTimer).toBeNull();
    expect(engine.state.coreGround).toBeNull();
    expect(engine.state.screen).toBe("in-mine");
  });
});

describe("economy and persistence", () => {
  it("sells at exact prices, buys only affordable service, and preserves a tank deficit on upgrade", () => {
    pose((s) => debug.setCargo(s, "ferron", 10));
    pose((s) => debug.sell(s));
    expect(engine.state.credits).toBe(280);
    expect(engine.state.creditsEarned).toBe(280);
    expect(engine.state.cargo).toEqual({});
    pose((s) => debug.setFuel(s, 30));
    pose((s) => debug.setCredits(s, 20));
    pose((s) => debug.fillFuel(s));
    expect(engine.state.miner.fuel).toBe(50);
    expect(engine.state.credits).toBe(0);
    pose((s) => debug.setCredits(s, 300));
    pose((s) => debug.buyUpgrade(s, "fuel"));
    expect(engine.state.miner.fuel).toBe(125);
    expect(maxFuel(engine.state)).toBe(175);
    pose((s) => debug.buyUpgrade(s, "fuel"));
    expect(engine.state.tiers.fuel).toBe(2);
  });
  it("saves the mine and restores it, refuses a live Sample, deletes Hardcore saves at death", async () => {
    ready();
    pose((s) => debug.setOreTile(s, 5, 4, "cuprite"));
    pose((s) => debug.setCredits(s, 123));
    pose((s) => debug.save(s));
    expect(engine.state.hasSave).toBe(true);
    pose((s) => debug.setCredits(s, 0));
    pose((s) => debug.setScreen(s, "title"));
    await tap("Enter");
    expect(engine.state.credits).toBe(123);
    expect(at(engine.state, 5, 4).ore).toBe("cuprite");
    pose((s) => debug.setCoreCarried(s, true));
    const saved = store.get("deepcore-expedition");
    pose((s) => debug.save(s));
    expect(store.get("deepcore-expedition")).toBe(saved);
    pose((s) => debug.setMode(s, "hardcore"));
    pose((s) => debug.setHull(s, 0));
    await engine.advance(1);
    expect(engine.state.hasSave).toBe(false);
    expect(store.size).toBe(0);
  });
  it("fabricates in order, consumes requirements, and wins only after a launch", async () => {
    ready();
    pose((s) => debug.setCredits(s, C.ROCKET_TOTAL_CREDITS));
    pose((s) => debug.setMaterial(s, "resonite", 1));
    pose((s) => debug.setMaterial(s, "cryenite", 1));
    pose((s) => debug.setCoreCarried(s, true));
    for (let i = 0; i < 5; i++) pose((s) => debug.fabricate(s));
    expect(engine.state.credits).toBe(0);
    expect(engine.state.coreTimer).toBeNull();
    expect(engine.state.installed).toBe(5);
    pose((s) => debug.launch(s));
    await engine.advance(210);
    expect(engine.state.screen).toBe("victory");
    expect(engine.state.summary?.componentsInstalled).toBe(5);
  });
  it("deploys explosives without collecting ore or destroying exotic nodes", () => {
    pose((s) => debug.setMinerPosition(s, 332, 328));
    pose((s) => debug.setOreTile(s, 4, 4, "cuprite"));
    pose((s) => debug.setMaterialTile(s, 5, 4, "resonite"));
    pose((s) => debug.setTile(s, 3, 4, "stone"));
    pose((s) => debug.setItemCount(s, "dynamite", 1));
    pose((s) => debug.useItem(s, "dynamite"));
    expect(at(engine.state, 3, 4).kind).toBe("tunnel");
    expect(at(engine.state, 4, 4).kind).toBe("tunnel");
    expect(at(engine.state, 5, 4).kind).toBe("material");
    expect(engine.state.cargo).toEqual({});
  });
  it("consumes posed quantum draws once and applies ordinary landing damage", async () => {
    ready();
    pose((s) => debug.setItemCount(s, "quantum-teleporter", 1));
    pose((s) => debug.setNextTeleportHeight(s, 8));
    pose((s) => debug.setNextTeleportSpeed(s, 700));
    pose((s) => debug.setTile(s, 4, 1, "rock"));
    pose((s) => debug.useItem(s, "quantum-teleporter"));
    expect(engine.state.miner.y).toBe(8 - 8 * C.TILE);
    expect(engine.state.nextTeleportHeight).toBeNull();
    await engine.advance(100);
    expect(engine.state.miner.hull).toBeLessThan(100);
  });
  it("preserves supplies when full, otherwise restores the exact amount", () => {
    pose((s) => debug.setItemCount(s, "emergency-fuel", 2));
    pose((s) => debug.useItem(s, "emergency-fuel"));
    expect(engine.state.items["emergency-fuel"]).toBe(2);
    pose((s) => debug.setFuel(s, 45));
    pose((s) => debug.useItem(s, "emergency-fuel"));
    expect(engine.state.miner.fuel).toBe(75);
    expect(engine.state.items["emergency-fuel"]).toBe(1);
  });
});

describe("world and deterministic core", () => {
  it.each(C.WORLD_SIZES)(
    "generates density-correct bands and exactly one of each material at %s size",
    (size) => {
      const rows = C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size],
        grid = generate(rows);
      for (const band of C.BANDS) {
        const cells = grid.filter(
          (t) => t.band === band && t.kind !== "bedrock",
        );
        const ores =
          cells.filter((t) => t.kind === "ore").length / cells.length;
        expect(Math.abs(ores - C.ORE_DENSITY) / C.ORE_DENSITY).toBeLessThan(
          C.DENSITY_TOLERANCE,
        );
      }
      for (const material of C.MATERIALS)
        expect(grid.filter((t) => t.material === material)).toHaveLength(1);
      expect(grid[rows * C.WORLD_COLS + C.CORE_COL].kind).toBe("core");
    },
  );
  it("preserves cell bands and health during resizing", () => {
    pose((s) => debug.setTile(s, 4, 200, "rock"));
    pose((s) => debug.setTileHealth(s, 4, 200, 3));
    const before = debug.tileAt(engine.state, 4, 200);
    pose((s) => debug.setWorldSize(s, "quick"));
    expect(debug.tileAt(engine.state, 4, 200)).toEqual(before);
    expect(debug.tileAt(engine.state, 4, 251).band).toBeNull();
    pose((s) => debug.setWorldSize(s, "marathon"));
    expect(debug.tileAt(engine.state, 16, 250).kind).toBe("tunnel");
    expect(debug.tileAt(engine.state, 16, 1000).kind).toBe("core");
  });
  it("produces the same fall and fuel result under different frame partitions", () => {
    const a = initial();
    a.screen = "in-mine";
    a.miner.y = 1000;
    const b = copy(a),
      held = { left: false, right: false, up: false, down: false };
    for (let i = 0; i < 60; i++) advance(a, held, 1 / 60);
    for (let i = 0; i < 20; i++) advance(b, held, 1 / 20);
    expect(a.miner).toEqual(b.miner);
    expect(a.elapsedSeconds).toBe(b.elapsedSeconds);
  });
  it("ramps camera lead in time, unwinds faster, and follows sky without a ceiling", () => {
    const s = initial();
    s.miner.vy = 500;
    camera(s, 2);
    expect(s.camera.lead).toBe(C.CAM_LEAD_MAX);
    s.miner.vy = -500;
    camera(s, 1);
    expect(s.camera.lead).toBe(-C.CAM_LEAD_MAX / 4);
    s.camera.lead = C.CAM_LEAD_MAX;
    s.miner.vy = 0;
    camera(s, 0.5);
    expect(s.camera.lead).toBe(0);
    s.miner.y = -5000;
    camera(s, 1);
    expect(s.camera.y).toBeLessThan(-5000);
  });
  it("reconciles purely and rejects invalid poses", () => {
    const s = engine.state;
    expect(debug.snapshot(debug.reconcile(s))).toEqual(debug.snapshot(s));
    expect(() => debug.setTier(s, "fuel", 8)).toThrow();
    expect(() => debug.setTileHealth(s, 4, 1, 9)).toThrow();
    expect(() => debug.setCoreTimer(s, 4)).toThrow();
    expect(() => debug.setCredits(s, -1)).toThrow();
    expect(() => debug.setTile(s, 33, 4, "rock")).toThrow();
  });
  it("locks the scanner only onto missing material in range", () => {
    pose((s) => debug.setTier(s, "scanner", 2));
    pose((s) => debug.setMaterialTile(s, 5, 2, "resonite"));
    expect(debug.snapshot(engine.state).scanner.target).toBe("resonite");
    pose((s) => debug.setMaterial(s, "resonite", 1));
    expect(debug.snapshot(engine.state).scanner.locked).toBe(false);
  });
  it("renders every menu and every panel without advancing state", async () => {
    for (const screen of C.SCREENS) {
      pose((s) => debug.setScreen(s, screen));
      await engine.advance(1);
      expect(menu(engine.state).length > 0).toBe(screen !== "in-mine");
    }
    ready();
    pose((s) => debug.setCredits(s, 100000));
    pose((s) => debug.setCargo(s, "ferron", 1));
    for (const panel of C.PANELS) {
      pose((s) => debug.setPanel(s, panel));
      await engine.advance(1);
      for (const c of controls(engine.state))
        expect(c.rect.w).toBeGreaterThan(0);
    }
    const before = debug.snapshot(engine.state),
      ctx = createCanvas(1280, 720).getContext("2d");
    game.render(engine.state, {
      ctx: ctx as unknown as CanvasRenderingContext2D,
      viewport: () => engine.viewport(),
      frame: () => engine.frame(),
    });
    expect(debug.snapshot(engine.state)).toEqual(before);
  });
});

describe("hazards and deep drilling", () => {
  it("drills a wall only after walking flush against it", async () => {
    ready();
    pose((s) => debug.setMinerPosition(s, 332, 248));
    pose((s) => debug.setTile(s, 4, 4, "rock"));
    pose((s) => debug.setOreTile(s, 5, 3, "marlite"));
    key("KeyD");
    await engine.advance(5);
    expect(at(engine.state, 5, 3).health).toBe(4);
    await engine.advance(40);
    key("KeyD", false);
    expect(at(engine.state, 5, 3).kind).toBe("tunnel");
    expect(engine.state.cargo.marlite).toBe(1);
  });
  it("extracts from an inexhaustible Core and starts a live timer", async () => {
    ready();
    pose((s) =>
      debug.setMinerPosition(
        s,
        C.CORE_COL * C.TILE + 12,
        engine.state.coreRow * C.TILE - C.MINER_H,
      ),
    );
    key("KeyS");
    await engine.advance(15);
    key("KeyS", false);
    expect(engine.state.satchel.coreSample).toBe(true);
    expect(engine.state.coreTimer).toBeLessThan(C.CORE_TIMER);
    expect(at(engine.state, C.CORE_COL, engine.state.coreRow).kind).toBe(
      "core",
    );
  });
  it("resolves gas damage, visual effects and a delayed first-time notice", async () => {
    ready();
    pose((s) => debug.setMinerTravel(s, false));
    pose((s) => debug.setMinerPosition(s, 332, 124 * C.TILE + 8));
    pose((s) => debug.setTile(s, 4, 125, "gas"));
    pose((s) => debug.setTileHealth(s, 4, 125, 1));
    pose((s) => debug.setHull(s, 450));
    pose((s) => debug.setFuel(s, 1000));
    key("KeyS");
    await engine.advance(9);
    key("KeyS", false);
    expect(engine.state.miner.hull).toBeLessThan(450);
    expect(engine.state.noticesFired.gas).toBe(true);
    expect(engine.state.effects.some((e) => e.name === "gas-explosion")).toBe(
      true,
    );
    expect(debug.snapshot(engine.state).notice?.shown).toBe(false);
    await engine.advance(100);
    expect(debug.snapshot(engine.state).notice?.shown).toBe(true);
  });
  it("applies radiator resistance only to lava and does not double-charge an active cut", async () => {
    ready();
    pose((s) => debug.setMinerTravel(s, false));
    pose((s) => debug.setMinerPosition(s, 332, 251 * C.TILE - C.MINER_H));
    pose((s) => debug.setTile(s, 4, 251, "lava"));
    pose((s) => debug.setTier(s, "radiator", 5));
    pose((s) => debug.setTier(s, "drill", 5));
    pose((s) => debug.setHull(s, 450));
    key("KeyS");
    await engine.advance(23);
    key("KeyS", false);
    expect(at(engine.state, 4, 251).kind).toBe("tunnel");
    expect(engine.state.miner.hull).toBeCloseTo(
      450 - C.LAVA_DRILL_DEEPSTONE * (1 - C.RADIATOR_TIERS[4]),
      1,
    );
  });
  it("keeps partly cut health when returning and refuses to cut boulders", async () => {
    ready();
    pose((s) => debug.setTile(s, 4, 1, "rock"));
    pose((s) => debug.setMinerTravel(s, false));
    key("KeyS");
    await engine.advance(8);
    key("KeyS", false);
    await engine.advance(5);
    expect(at(engine.state, 4, 1).health).toBe(3);
    key("KeyS");
    await engine.advance(23);
    key("KeyS", false);
    expect(at(engine.state, 4, 1).kind).toBe("tunnel");
    pose((s) => debug.setTile(s, 4, 1, "stone"));
    key("KeyS");
    await engine.advance(40);
    expect(at(engine.state, 4, 1).kind).toBe("stone");
    expect(engine.state.drilling).toBeNull();
  });
});
