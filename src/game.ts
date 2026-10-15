/// <reference types="vite/client" />
import type { Game } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  type DeepcoreState,
  copy,
  initial,
  effect,
  at,
  BUILDING_RECTS,
} from "./model";
import { debug, type DeepcoreDebugApi, snapshot } from "./debug";
import {
  action,
  activateBuilding,
  back,
  choose,
  controls,
  inside,
  menu,
  menuRect,
} from "./interface";
import { advance, camera } from "./simulation";
import { checkDeath, hasSave, jettison, useItem } from "./transactions";
import { render } from "./render";
export type { DeepcoreState, DeepcoreDebugApi };
export const BACKGROUND = "#0b1721";

// Vite bundles these committed files; asset authoring is never part of a build.
const files = import.meta.glob("../assets/**/*.{png,wav,json}", {
  query: "?url&no-inline",
  import: "default",
  eager: true,
}) as Record<string, string>;
function path(url: string): string {
  // With a relative Vite base, production URL imports are resolved against the
  // bundled module. Hand only their asset-root-relative suffix to the engine.
  const root = url.lastIndexOf("/assets/");
  return root >= 0
    ? url.slice(root + "/assets/".length)
    : url.replace(/^assets\//, "");
}

export const game: Game<DeepcoreState, DeepcoreDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTION_NAMES)
      api.input.register(name, { keys: [...C.ACTIONS[name]] });
    const images: DeepcoreState["images"] = {},
      systems: DeepcoreState["systems"] = {};
    await Promise.all(
      Object.entries(files).map(async ([name, url]) => {
        const key = name.replace("../assets/", "");
        if (key.endsWith(".png"))
          images[key] = await api.assets.loadImage(path(url));
        else if (key.endsWith(".json"))
          systems[key.replace("fx/", "").replace(".json", "")] = JSON.parse(
            await (await api.assets.load(path(url))).text(),
          ) as ParticleSystem;
      }),
    );
    await Promise.all(
      Object.values(C.CUES).map((name) =>
        api.audio.load(name, path(files[`../assets/audio/${name}.wav`])),
      ),
    );
    const readings = {
      screen: (s: DeepcoreState) => `${s.screen} / ${s.panel ?? "no panel"}`,
      expedition: (s: DeepcoreState) => `${s.mode} / ${s.worldSize}`,
      position: (s: DeepcoreState) =>
        `${s.miner.x.toFixed(1)}, ${s.miner.y.toFixed(1)}`,
      velocity: (s: DeepcoreState) =>
        `${s.miner.vx.toFixed(0)}, ${s.miner.vy.toFixed(0)}`,
      miner: (s: DeepcoreState) =>
        `${s.miner.state} / ${s.miner.facing} / grounded ${snapshot(s).miner.grounded}`,
      fuel: (s: DeepcoreState) =>
        `${s.miner.fuel.toFixed(1)} / ${snapshot(s).miner.maxFuel}`,
      hull: (s: DeepcoreState) =>
        `${s.miner.hull.toFixed(1)} / ${snapshot(s).miner.maxHull}`,
      drill: (s: DeepcoreState) => JSON.stringify(snapshot(s).miner.drilling),
      credits: (s: DeepcoreState) => s.credits,
      depth: (s: DeepcoreState) => snapshot(s).depthMeters.toFixed(0),
      cargo: (s: DeepcoreState) =>
        `${snapshot(s).cargo.slotsUsed} slots / ${snapshot(s).cargo.loadKg} kg / overload ${snapshot(s).miner.overloaded}`,
      satchel: (s: DeepcoreState) => JSON.stringify(s.satchel),
      tiers: (s: DeepcoreState) => JSON.stringify(s.tiers),
      core: (s: DeepcoreState) => s.coreTimer?.toFixed(1) ?? "none",
      scanner: (s: DeepcoreState) => JSON.stringify(snapshot(s).scanner),
    };
    for (const [name, fn] of Object.entries(readings))
      api.diagnostics.register(name, (s) => fn(s as DeepcoreState));
    const s = initial(images, systems);
    s.hasSave = hasSave();
    return [s, debug];
  },
  update(state, api, dt) {
    let s = copy(state);
    s.simTime += dt;
    const pressed = Object.fromEntries(
      C.ACTION_NAMES.map((n) => [n, api.input.pressed(n)]),
    ) as Record<C.ActionName, boolean>;
    if (pressed.mute) api.audio.setMuted(!api.audio.muted());
    s.muted = api.audio.muted();
    const samples = api.input.pointerSamples();
    for (const p of samples) {
      let hit: string | null = null;
      for (let i = 0; i < menu(s).length; i++) {
        const r = menuRect(s, i);
        if (r && inside(r, p.x, p.y)) {
          s.menuIndex = i;
          hit = `menu:${i}`;
        }
      }
      for (const c of controls(s))
        if (c.enabled && inside(c.rect, p.x, p.y))
          hit = `control:${c.id}:${c.subject ?? ""}`;
      if (s.screen === "in-mine" && !s.panel) {
        for (const b of BUILDING_RECTS) {
          const r = {
            x: b.x - s.camera.x,
            y: b.y - s.camera.y + C.HUD_H,
            w: b.w,
            h: b.h,
          };
          if (inside(r, p.x, p.y)) hit = `building:${b.id}`;
        }
      }
      if (p.type === "down") {
        if (hit) s.pointerDown[p.id] = hit;
        if (hit === "control:dismiss-notice:") s.notice = null;
      }
      if (p.type === "up") {
        if (hit && s.pointerDown[p.id] === hit) {
          if (hit.startsWith("menu:")) s = choose(s);
          else if (hit.startsWith("control:")) {
            const [, id, subject] = hit.split(":");
            if (id === "mute") api.audio.setMuted(!api.audio.muted());
            else action(s, id, subject || null);
          } else activateBuilding(s, hit.split(":")[1] as C.BuildingId);
        }
        delete s.pointerDown[p.id];
      }
    }
    if (s.screen !== "in-mine") {
      const items = menu(s);
      if (pressed.down) s.menuIndex = (s.menuIndex + 1) % items.length;
      if (pressed.up)
        s.menuIndex = (s.menuIndex + items.length - 1) % items.length;
      if (pressed.activate) s = choose(s);
      else if (
        pressed.pause &&
        ["paused", "mode-select", "size-select", "how-to-play"].includes(
          s.screen,
        )
      )
        back(s);
    } else {
      if (pressed.pause) {
        if (s.panel) s.panel = null;
        else {
          s.screen = "paused";
          s.menuIndex = 0;
        }
      }
      if (pressed.inventory)
        s.panel = s.panel === "inventory" ? null : "inventory";
      if (pressed.activate && !s.panel) activateBuilding(s);
      if (pressed.jettison) jettison(s);
      C.ITEM_IDS.forEach((id, i) => {
        if (pressed[`supply${i + 1}` as C.ActionName]) useItem(s, id);
      });
    }
    if (s.screen === "in-mine") {
      checkDeath(s);
      advance(
        s,
        {
          left: api.input.value("left") > 0,
          right: api.input.value("right") > 0,
          down: api.input.value("down") > 0,
          up: api.input.value("up") > 0,
        },
        dt,
      );
      if (
        Math.floor(s.simTime / C.GAS_SEEP_PERIOD) !==
        Math.floor(state.simTime / C.GAS_SEEP_PERIOD)
      ) {
        for (
          let row = Math.max(1, Math.floor(s.camera.y / C.TILE));
          row <=
          Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
          row++
        )
          for (
            let col = Math.floor(s.camera.x / C.TILE);
            col <= Math.ceil((s.camera.x + C.VIEW_W) / C.TILE);
            col++
          )
            if (at(s, col, row).kind === "gas")
              effect(s, "gas-seep", (col + 0.5) * C.TILE, (row + 0.5) * C.TILE);
      }
      camera(s, dt);
    }
    const frozen = s.screen === "paused";
    if (!frozen) {
      s.effects = s.effects
        .map((e) => ({ ...e, age: e.age + dt }))
        .filter((e) => e.age < 2.2)
        .slice(-80);
      s.noteTime = Math.max(0, s.noteTime - dt);
    }
    api.audio.loop(C.CUES.music);
    const active = s.screen === "in-mine" && !s.panel;
    for (const [name, on] of [
      [C.CUES.drill, active && s.drilling !== null],
      [C.CUES.thrust, active && s.miner.state === "jetpack"],
      [
        C.CUES.alarmFuel,
        s.screen === "in-mine" &&
          s.miner.fuel < snapshot(s).miner.maxFuel * C.LOW_FUEL_FRACTION,
      ],
    ] as const) {
      if (on) api.audio.loop(name);
      else api.audio.stop(name);
    }
    if (s.coreTimer !== null && s.screen === "in-mine") {
      const period = s.coreTimer < 15 ? 0.25 : s.coreTimer < 35 ? 0.5 : 1;
      if (
        Math.floor(s.elapsedSeconds / period) !==
        Math.floor(state.elapsedSeconds / period)
      )
        api.audio.play(C.CUES.alarmCore);
    }
    for (const name of s.pendingCues) api.audio.play(name);
    s.pendingCues = [];
    s.muted = api.audio.muted();
    return s;
  },
  render,
};
