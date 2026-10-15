import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  type ReadState,
  type Rect,
  BUILDING_RECTS,
  at,
  clamp,
  depth,
  lift,
  maxFuel,
  maxHull,
  scanner,
  slots,
  weight,
} from "./model";
import { controls, menu, menuRect } from "./interface";

const P = {
  bg: "#0b1721",
  panel: "#10232e",
  line: "#334b54",
  text: "#e5e7cf",
  muted: "#8ca6aa",
  amber: "#edb76e",
  teal: "#86d5be",
  red: "#ee846b",
};
type Context = CanvasRenderingContext2D;
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = P.text,
  font = "monospace",
  weight = "400",
): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillText(value, x, y);
}
function box(ctx: Context, r: Rect, fill = P.panel, stroke = P.line): void {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}
function sprite(
  ctx: Context,
  s: ReadState,
  key: string,
  x: number,
  y: number,
  w = 80,
  h = 80,
): void {
  const image = s.images[key];
  if (image) ctx.drawImage(image as ImageBitmap, x, y, w, h);
}
function label(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  color = P.muted,
): void {
  text(ctx, value, x, y, 11, color, "monospace", "600");
}
function rule(ctx: Context, x: number, y: number, w: number, c = P.line): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, 1);
}
function supplyIcon(ctx: Context, index: number, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  ctx.strokeStyle = P.teal;
  ctx.fillStyle = P.amber;
  if (index < 2) {
    for (let i = 0; i < (index === 0 ? 3 : 2); i++)
      ctx.fillRect(4 + i * 7, 8, 5, 20);
    ctx.fillStyle = "#56777d";
    ctx.fillRect(3, 15, 23, 4);
    ctx.beginPath();
    ctx.moveTo(13, 8);
    ctx.lineTo(13, 3);
    ctx.lineTo(23, 2);
    ctx.stroke();
  } else if (index < 4) {
    ctx.beginPath();
    ctx.ellipse(15, 16, 10, index === 2 ? 13 : 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillRect(12, 12, 6, 7);
    if (index === 3) {
      ctx.fillRect(1, 4, 4, 4);
      ctx.fillRect(25, 24, 4, 4);
    }
  } else if (index === 4) {
    ctx.fillRect(12, 5, 7, 23);
    ctx.fillRect(4, 13, 23, 7);
  } else {
    ctx.strokeRect(5, 8, 21, 22);
    ctx.strokeRect(10, 2, 10, 6);
    ctx.fillRect(10, 16, 12, 8);
  }
  ctx.restore();
}
const nice = (v: string): string => v.replace(/-/g, " ").toUpperCase();
function miner(
  ctx: Context,
  s: ReadState,
  x = s.miner.x - 12,
  y = s.miner.y - 8,
  scale = 1,
  state = s.miner.state,
): void {
  const lengths: Record<C.MinerState, number> = {
    idle: 4,
    walk: 6,
    "drill-down": 4,
    "drill-side": 4,
    jetpack: 4,
    fall: 4,
    hurt: 3,
    "fuel-out": 3,
  };
  const f =
    state === "hurt"
      ? Math.min(lengths[state] - 1, Math.floor(s.animTime * C.ANIM_FPS))
      : Math.floor(s.animTime * C.ANIM_FPS) % lengths[state];
  ctx.save();
  if (s.miner.facing === "west") {
    ctx.translate(x + 80 * scale, y);
    ctx.scale(-1, 1);
    sprite(
      ctx,
      s,
      `miner/${state}/frame${String(f).padStart(2, "0")}.png`,
      0,
      0,
      80 * scale,
      80 * scale,
    );
  } else
    sprite(
      ctx,
      s,
      `miner/${state}/frame${String(f).padStart(2, "0")}.png`,
      x,
      y,
      80 * scale,
      80 * scale,
    );
  ctx.restore();
}
function particle(
  ctx: Context,
  s: ReadState,
  e: ReadState["effects"][number],
): void {
  const system = s.systems[e.name];
  if (!system) return;
  // The binding fits a field to its context's canvas. Give it a logical field,
  // keeping the engine's physical canvas and device scale entirely private.
  let ready = false;
  const logical = new Proxy(ctx, {
    get(target, key) {
      if (key === "canvas") return { width: 256, height: 256 };
      if (key === "fill")
        return (...args: Parameters<Context["fill"]>) => {
          if (ready) ctx.fill(...args);
        };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, key, value) {
      return Reflect.set(target, key, value, target);
    },
  });
  ctx.save();
  const scale =
    e.name === "core-detonation"
      ? 2.8
      : e.name === "gas-explosion"
        ? 1.6
        : 0.85;
  ctx.translate(e.x - 128 * scale, e.y - 128 * scale);
  ctx.scale(scale, scale);
  const colored = e.tint
    ? {
        ...system,
        emitters: system.emitters.map((em) => ({
          ...em,
          particle: {
            ...em.particle,
            colorGradient: [
              { color: e.tint!, at: 0 },
              { color: "#54616b", at: 1 },
            ],
          },
        })),
      }
    : system;
  const dust = ["drill-debris", "gas-seep", "impact-dust"].includes(e.name);
  const player = new ParticleCanvasPlayer(colored as ParticleSystem, logical, {
    seed: e.seed,
    clear: false,
    pixelRadius: dust ? 3 : 5,
    composite: dust ? "source-over" : "lighter",
  });
  ready = true;
  player.update(e.age);
  ctx.restore();
}
function terrain(ctx: Context, s: ReadState): void {
  const x0 = Math.max(0, Math.floor(s.camera.x / C.TILE)),
    x1 = Math.min(
      C.WORLD_COLS - 1,
      Math.ceil((s.camera.x + C.VIEW_W) / C.TILE),
    );
  const y0 = Math.max(1, Math.floor(s.camera.y / C.TILE)),
    y1 = Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
  for (let row = y0; row <= y1; row++)
    for (let col = x0; col <= x1; col++) {
      const t = at(s, col, row),
        x = col * C.TILE,
        y = row * C.TILE,
        v = (col * 13 + row * 7) % C.TILE_VARIANTS;
      const base = t.band ? `tiles/${t.band}-${v}.png` : "tiles/bedrock.png";
      sprite(ctx, s, base, x, y);
      if (t.kind === "tunnel" || t.kind === "lava") {
        const kind = t.kind,
          open = (dx: number, dy: number) =>
            at(s, col + dx, row + dy).kind === kind;
        const l = open(-1, 0),
          r = open(1, 0),
          u = row === 1 || open(0, -1),
          d = open(0, 1),
          inset = 9;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(
          x + (l ? 0 : inset),
          y + (u ? 0 : inset),
          C.TILE - (l ? 0 : inset) - (r ? 0 : inset),
          C.TILE - (u ? 0 : inset) - (d ? 0 : inset),
          [u || l ? 0 : 14, u || r ? 0 : 14, d || r ? 0 : 14, d || l ? 0 : 14],
        );
        ctx.clip();
        sprite(
          ctx,
          s,
          kind === "lava"
            ? `hazards/lava/frame${String(Math.floor(s.simTime * 5) % 4).padStart(2, "0")}.png`
            : "tiles/tunnel.png",
          x,
          y,
        );
        ctx.restore();
        // Convex dirt nubs preserve the diagonal solid at an L or T junction.
        for (const [dx, dy, cx, cy] of [
          [-1, -1, 0, 0],
          [1, -1, 80, 0],
          [-1, 1, 0, 80],
          [1, 1, 80, 80],
        ])
          if (open(dx, 0) && open(0, dy) && !open(dx, dy)) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x + cx, y + cy, inset, 0, Math.PI * 2);
            ctx.clip();
            sprite(ctx, s, base, x, y);
            ctx.restore();
          }
      }
      if (t.kind === "stone")
        sprite(ctx, s, `tiles/stone-${(row + col) % 2}.png`, x, y);
      if (t.ore) sprite(ctx, s, `ore/${t.ore}.png`, x, y);
      if (t.material) sprite(ctx, s, `materials/${t.material}.png`, x, y);
      if (t.kind === "core") sprite(ctx, s, "materials/core.png", x, y);
      if (t.health !== null && t.band && t.health < C.BAND_HEALTH[t.band]) {
        const f = Math.min(
          C.CRACK_FRAMES - 1,
          Math.floor((1 - t.health / C.BAND_HEALTH[t.band]) * C.CRACK_FRAMES),
        );
        sprite(
          ctx,
          s,
          `tiles/crack/frame${String(f).padStart(2, "0")}.png`,
          x,
          y,
        );
      }
      ctx.strokeStyle = "#09151d28";
      ctx.strokeRect(x + 0.5, y + 0.5, 79, 79);
    }
}
function world(ctx: Context, s: ReadState): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  ctx.clip();
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  const skyY = C.SURFACE_Y - s.camera.y + C.HUD_H;
  if (skyY > 0) sprite(ctx, s, "surface/sky.png", 0, skyY - 600, 1280, 600);
  const jitter =
    s.shake > 0 ? Math.sin(s.simTime * 93) * Math.min(18, s.shake * 13) : 0;
  ctx.translate(
    -s.camera.x + jitter,
    C.HUD_H - s.camera.y + Math.cos(s.simTime * 81) * jitter * 0.6,
  );
  terrain(ctx, s);
  if (s.camera.y < C.SURFACE_Y) {
    for (let col = 1; col < C.WORLD_COLS - 1; col++)
      if (col !== C.CAVE_MOUTH_COL)
        sprite(
          ctx,
          s,
          "surface/ground.png",
          col * C.TILE,
          C.SURFACE_Y - 4,
          80,
          40,
        );
    sprite(
      ctx,
      s,
      "surface/cave-mouth.png",
      C.CAVE_MOUTH_COL * C.TILE,
      C.SURFACE_Y - 56,
      80,
      80,
    );
    for (const b of BUILDING_RECTS) {
      if (b.id === "launch-pad")
        sprite(
          ctx,
          s,
          `rocket/stage${s.installed}.png`,
          b.x,
          b.y - Math.pow(s.launchTime, 2) * 70,
          b.w,
          b.h,
        );
      else sprite(ctx, s, `surface/${b.id}.png`, b.x, b.y, b.w, b.h);
      const active =
        s.miner.x + C.MINER_W / 2 >= b.x &&
        s.miner.x + C.MINER_W / 2 <= b.x + b.w &&
        depth(s) < 1;
      const title = nice(b.id);
      ctx.textAlign = "center";
      text(
        ctx,
        title,
        b.x + b.w / 2,
        C.SURFACE_Y + 56,
        11,
        active ? P.amber : P.muted,
      );
      if (active && !s.panel)
        text(ctx, "[ E ]  INTERACT", b.x + b.w / 2, b.y - 15, 12, P.teal);
      ctx.textAlign = "left";
    }
    label(
      ctx,
      "↓  MINE ACCESS",
      C.CAVE_MOUTH_COL * C.TILE - 15,
      C.SURFACE_Y - 72,
      P.amber,
    );
  }
  if (s.coreGround) {
    const p = s.coreGround;
    sprite(ctx, s, "materials/core-sample.png", p.col * C.TILE, p.row * C.TILE);
    text(
      ctx,
      `${s.coreTimer?.toFixed(1)}s`,
      p.col * C.TILE,
      p.row * C.TILE - 8,
      19,
      P.red,
    );
  }
  if (s.launchTime === 0) miner(ctx, s);
  for (const e of s.effects) particle(ctx, s, e);
  ctx.restore();
}
function hud(ctx: Context, s: ReadState): void {
  box(ctx, { x: 0, y: 0, w: C.STAGE_W, h: C.HUD_H }, "#0a1821", "#31464d");
  const gauge = (
    icon: string,
    x: number,
    title: string,
    value: number,
    max: number,
    color: string,
    low: number,
  ) => {
    sprite(ctx, s, `icons/${icon}.png`, x, 15, 24, 24);
    label(ctx, title, x + 34, 20);
    text(
      ctx,
      `${Math.ceil(value)} / ${max}`,
      x + 34,
      37,
      13,
      value / max < low ? P.red : P.text,
    );
    ctx.fillStyle = "#253b42";
    ctx.fillRect(x + 124, 19, 75, 16);
    ctx.fillStyle = value / max < low ? P.red : color;
    ctx.fillRect(x + 126, 21, 71 * clamp(value / max, 0, 1), 12);
  };
  gauge(
    "fuel",
    18,
    "FUEL",
    s.miner.fuel,
    maxFuel(s),
    P.amber,
    C.LOW_FUEL_FRACTION,
  );
  gauge(
    "hull",
    235,
    "HULL",
    s.miner.hull,
    maxHull(s),
    P.teal,
    C.LOW_HULL_FRACTION,
  );
  sprite(ctx, s, "icons/cargo.png", 453, 16, 24, 24);
  label(ctx, "CARGO", 487, 20);
  text(
    ctx,
    `${slots(s)}/${C.CARGO_TIERS[s.tiers.cargo - 1]}  ·  ${weight(s)} kg`,
    487,
    38,
    13,
    slots(s) >= C.CARGO_TIERS[s.tiers.cargo - 1] ? P.amber : P.text,
  );
  if (weight(s) >= lift(s)) label(ctx, C.OVERLOAD, 550, 17, P.red);
  sprite(ctx, s, "icons/credits.png", 658, 16, 24, 24);
  text(ctx, s.credits.toLocaleString(), 691, 34, 17, P.amber);
  sprite(ctx, s, "icons/depth.png", 796, 16, 24, 24);
  text(ctx, `${Math.floor(depth(s))} m`, 827, 34, 17);
  for (const [i, m] of C.MATERIALS.entries()) {
    ctx.globalAlpha = s.satchel[m] > 0 ? 1 : 0.2;
    sprite(ctx, s, `icons/${m}.png`, 928 + i * 29, 16, 24, 24);
    ctx.globalAlpha = 1;
  }
  for (const c of controls(s).filter((c) => c.rect.y < C.HUD_H))
    button(ctx, c.rect, c.label, true, false);
}
function button(
  ctx: Context,
  r: Rect,
  value: string,
  enabled: boolean,
  selected: boolean,
): void {
  box(
    ctx,
    r,
    selected ? "#e6b774" : enabled ? "#1b343f" : "#152831",
    selected ? P.amber : enabled ? "#55777a" : "#2b4149",
  );
  if (selected) {
    ctx.fillStyle = "#fff2bf";
    ctx.fillRect(r.x, r.y, 4, r.h);
  }
  ctx.textAlign = "center";
  text(
    ctx,
    value,
    r.x + r.w / 2,
    r.y + r.h / 2 + 5,
    13,
    selected ? "#152630" : enabled ? P.text : "#61777e",
    "monospace",
    "600",
  );
  ctx.textAlign = "left";
}
function mineOverlays(ctx: Context, s: ReadState): void {
  const d = depth(s),
    band =
      C.BANDS[
        Math.min(3, Math.floor((d / (s.coreRow * C.METERS_PER_ROW)) * 4))
      ];
  box(ctx, { x: 24, y: 78, w: 222, h: 54 }, "#10212ce8");
  label(
    ctx,
    d < 1 ? "OUTPOST 07 / SURFACE" : `STRATUM 0${C.BANDS.indexOf(band) + 1}`,
    40,
    98,
    P.amber,
  );
  text(ctx, d < 1 ? "THE LAST WAY HOME" : nice(band), 40, 119, 14);
  if (!s.panel) {
    box(ctx, { x: 982, y: 78, w: 274, h: 86 }, "#10212cea");
    label(ctx, "ESCAPE ROCKET", 998, 99, P.amber);
    text(ctx, `${s.installed} / 5 COMPONENTS INSTALLED`, 998, 121, 12);
    rule(ctx, 998, 136, 240);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < s.installed ? P.teal : "#344b52";
      ctx.fillRect(998 + i * 49, 143, 42, 4);
    }
  }
  // Quiet depth ticks at the edge, in the same world coordinate system.
  for (let y = 180; y < 650; y += 80) {
    rule(ctx, 1240, y, 16, "#a6b9aa60");
    label(
      ctx,
      `${Math.max(0, Math.floor(((s.camera.y + y - C.HUD_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW))}`,
      1201,
      y + 4,
      "#bac4af90",
    );
  }
  const scan = scanner(s);
  if (scan.locked) {
    box(ctx, { x: 24, y: 148, w: 222, h: 66 }, "#10212ceb");
    label(ctx, `${nice(scan.target!)} SIGNAL`, 40, 169, P.teal);
    text(
      ctx,
      `${scan.distanceTiles?.toFixed(1)} tiles  ${scan.dirY > 0 ? "↓" : "↑"} ${scan.dirX > 0 ? "→" : "←"}`,
      40,
      194,
      17,
      P.teal,
    );
  }
  if (s.satchel.coreSample && s.coreTimer !== null) {
    box(ctx, { x: 435, y: 78, w: 410, h: 72 }, "#36272bea", P.red);
    label(ctx, "UNSTABLE CORE SAMPLE  /  J TO JETTISON", 454, 100, P.red);
    text(
      ctx,
      `${s.coreTimer.toFixed(1)} SECONDS`,
      454,
      130,
      25,
      P.amber,
      "monospace",
      "700",
    );
  }
  if (!s.panel) {
    box(ctx, { x: 24, y: 660, w: 1232, h: 40 }, "#0d202bea");
    label(
      ctx,
      "A D  MOVE / DRILL   ·   S  BORE DOWN   ·   W SPACE  THRUST   ·   E  INTERACT",
      40,
      685,
    );
    label(
      ctx,
      "I  CARGO   ·   1—6  SUPPLIES   ·   ESC  PAUSE",
      884,
      685,
      P.amber,
    );
  }
  if (s.noteTime > 0 && !s.panel) {
    box(ctx, { x: 350, y: 600, w: 580, h: 40 }, "#132d38f0", "#59766e");
    ctx.textAlign = "center";
    text(ctx, s.note, 640, 625, 13, P.teal);
    ctx.textAlign = "left";
  }
  if (s.notice && s.notice.age >= C.NOTICE_DELAY) {
    const gas = s.notice.hazard === "gas";
    box(ctx, { x: 48, y: 554, w: 690, h: 86 }, "#152a34f5", P.amber);
    label(
      ctx,
      gas ? "HAZARD REPORT / VOLATILE GAS" : "HAZARD REPORT / MOLTEN ROCK",
      66,
      576,
      P.amber,
    );
    text(
      ctx,
      gas
        ? "Watch for pale seeps. Gas ignores your radiator."
        : "Lava burns on contact. Upgrade your radiator or dig around it.",
      66,
      599,
      13,
    );
    label(ctx, "HULL UPGRADES BUY SURVIVAL.   /   CLICK TO DISMISS", 66, 623);
  }
}
function upgradeEffect(track: C.TrackName, tier: number): string {
  const i = tier - 1;
  switch (track) {
    case "fuel":
      return `${C.FUEL_TIERS[i]} fuel capacity`;
    case "drill":
      return `Power rating ${tier}`;
    case "cargo":
      return `${C.CARGO_TIERS[i]} ore slots`;
    case "hull":
      return `${C.HULL_TIERS[i]} hull integrity`;
    case "jetpack":
      return `${C.JETPACK_TIERS[i].liftLimitKg} kg lift / ${C.JETPACK_TIERS[i].emptyClimb} speed`;
    case "radiator":
      return `${C.RADIATOR_TIERS[i] * 100}% heat resistance`;
    case "scanner":
      return `${C.SCANNER_TIERS[i] ?? 0} tile detection range`;
  }
}
function panel(ctx: Context, s: ReadState): void {
  if (!s.panel) return;
  ctx.fillStyle = "#06111cb0";
  ctx.fillRect(0, C.HUD_H, 1280, 664);
  box(ctx, { x: 172, y: 100, w: 936, h: 550 }, "#10242fee", "#547078");
  ctx.fillStyle = P.amber;
  ctx.fillRect(172, 100, 5, 550);
  label(ctx, "OUTPOST SYSTEMS  /  07", 204, 129, P.amber);
  text(ctx, nice(s.panel), 204, 166, 29, P.text, "sans-serif", "700");
  rule(ctx, 204, 182, 872);
  text(ctx, `${s.credits.toLocaleString()} Cr`, 204, 618, 18, P.amber);
  label(ctx, "YOUR EXPEDITION. YOUR WAY HOME.", 700, 619);
  if (s.panel === "fuel-depot") {
    label(ctx, "FUEL RESERVE", 212, 226);
    text(
      ctx,
      `${s.miner.fuel.toFixed(1)} / ${maxFuel(s)}`,
      212,
      268,
      34,
      P.amber,
    );
    text(
      ctx,
      `${C.FUEL_PRICE} Credit per unit. No automatic refills.`,
      212,
      306,
      14,
      P.muted,
    );
    label(ctx, "HULL INTEGRITY", 212, 386);
    text(
      ctx,
      `${s.miner.hull.toFixed(1)} / ${maxHull(s)}`,
      212,
      428,
      34,
      P.teal,
    );
    text(
      ctx,
      `${C.REPAIR_PRICE} Credits per point. Bring the whole suit home.`,
      212,
      466,
      14,
      P.muted,
    );
  } else if (s.panel === "upgrade-shop") {
    C.TRACKS.forEach((t, i) => {
      const y = 221 + i * 53;
      label(ctx, `0${i + 1}`, 208, y, P.amber);
      text(ctx, nice(t), 244, y, 16);
      label(
        ctx,
        `T${s.tiers[t]} → ${Math.min(C.MAX_TIER[t], s.tiers[t] + 1)}`,
        415,
        y,
        P.teal,
      );
      text(
        ctx,
        upgradeEffect(t, Math.min(C.MAX_TIER[t], s.tiers[t] + 1)),
        520,
        y,
        13,
        P.muted,
      );
      rule(ctx, 208, y + 28, 638);
    });
  } else if (s.panel === "supply-depot") {
    C.ITEMS.forEach((t, i) => {
      const y = 230 + i * 60;
      supplyIcon(ctx, i, 208, y - 24);
      text(ctx, t.name, 254, y, 16);
      label(ctx, `HELD ${s.items[t.id]}`, 701, y, P.teal);
      const descriptions = [
        `[1] Clear a ${C.DYNAMITE_RADIUS * 2 + 1}×${C.DYNAMITE_RADIUS * 2 + 1} block. Ore is destroyed.`,
        `[2] Clear a ${C.PLASTIC_EXPLOSIVES_RADIUS * 2 + 1}×${C.PLASTIC_EXPLOSIVES_RADIUS * 2 + 1} block, including boulders.`,
        `[3] Return above camp. Brace for a rough landing.`,
        `[4] Return safely to the surface.`,
        `[5] Repair ${C.NANOBOT_HULL} hull in the field.`,
        `[6] Restore ${C.EMERGENCY_FUEL} fuel in the field.`,
      ];
      label(ctx, descriptions[i], 254, y + 20);
    });
  } else if (s.panel === "launch-pad") {
    sprite(ctx, s, `rocket/stage${s.installed}.png`, 208, 240, 270, 248);
    C.ROCKET_COMPONENTS.forEach((c, i) => {
      const y = 223 + i * 60;
      label(
        ctx,
        i < s.installed ? "✓ INSTALLED" : `0${i + 1}`,
        520,
        y,
        i < s.installed ? P.teal : P.amber,
      );
      text(ctx, c.name, 650, y, 16);
      label(
        ctx,
        `${c.credits.toLocaleString()} Cr${c.material ? ` + ${nice(c.material)}` : ""}`,
        650,
        y + 21,
      );
    });
  } else if (s.panel === "ore-market" || s.panel === "inventory") {
    const ores = C.MINERALS.filter((m) => (s.cargo[m.id] ?? 0) > 0),
      inventory = s.panel === "inventory";
    if (!ores.length)
      text(ctx, "Your cargo bay is empty.", 212, 236, 17, P.muted);
    ores.forEach((m, i) => {
      const y = 222 + i * 29;
      sprite(ctx, s, `ore/${m.id}.png`, 206, y - 20, 28, 28);
      text(ctx, m.name, 245, y, 14);
      text(ctx, `×${s.cargo[m.id]}`, 380, y, 14, P.teal);
      text(
        ctx,
        inventory
          ? `${(s.cargo[m.id] ?? 0) * m.weightKg} kg`
          : `${(s.cargo[m.id] ?? 0) * m.value} Cr`,
        453,
        y,
        13,
        P.muted,
      );
    });
    if (!inventory) {
      const value = C.MINERALS.reduce(
        (a, m) => a + (s.cargo[m.id] ?? 0) * m.value,
        0,
      );
      label(ctx, "COMPLETE HAUL VALUE", 750, 246);
      text(ctx, `${value.toLocaleString()} Cr`, 750, 289, 35, P.amber);
      text(ctx, "Sell the bay. Bank the Credits.", 750, 330, 13, P.muted);
    } else {
      label(ctx, "MATERIALS SATCHEL", 720, 216, P.amber);
      text(
        ctx,
        `RESONITE ${s.satchel.resonite}   CRYENITE ${s.satchel.cryenite}`,
        720,
        238,
        12,
        P.teal,
      );
      C.ITEMS.forEach((t, i) => {
        text(
          ctx,
          `${i + 1}  ${t.name.replace("Regenerative ", "")} ×${s.items[t.id]}`,
          720,
          263 + i * 43,
          12,
          s.items[t.id] ? P.text : P.muted,
        );
      });
      if (s.satchel.coreSample)
        label(
          ctx,
          `CORE SAMPLE / ${s.coreTimer?.toFixed(1)}s STABILITY`,
          720,
          526,
          P.red,
        );
      label(
        ctx,
        `${slots(s)} / ${C.CARGO_TIERS[s.tiers.cargo - 1]} SLOTS  ·  ${weight(s)} / ${lift(s)} kg LIFT`,
        212,
        586,
        weight(s) >= lift(s) ? P.red : P.teal,
      );
    }
  }
  for (const c of controls(s).filter(
    (c) => c.rect.y > C.HUD_H && c.id !== "dismiss-notice",
  ))
    button(ctx, c.rect, c.label, c.enabled, false);
  if (s.noteTime > 0) {
    ctx.textAlign = "center";
    text(ctx, s.note, 640, 682, 14, P.teal);
    ctx.textAlign = "left";
  }
}
function titleArt(ctx: Context, s: ReadState): void {
  sprite(ctx, s, "surface/sky.png", 0, 0, 1280, 600);
  // An illustrated cross-section, composed entirely of the shipped environment art.
  ctx.save();
  ctx.beginPath();
  ctx.rect(605, 100, 675, 620);
  ctx.clip();
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 9; col++) {
      const x = 605 + col * 80,
        y = 235 + row * 80,
        band = C.BANDS[Math.min(3, Math.floor(row / 2))];
      sprite(ctx, s, `tiles/${band}-${(col + row) % 3}.png`, x, y);
      const shaft =
        (col === 4 && row < 3) ||
        (row === 2 && col >= 4 && col <= 6) ||
        (col === 6 && row >= 2 && row <= 4) ||
        (row === 4 && col >= 2 && col <= 6) ||
        (col === 2 && row >= 4);
      if (shaft) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x + 6, y - 5, 68, 90, 10);
        ctx.clip();
        sprite(ctx, s, "tiles/tunnel.png", x, y);
        ctx.restore();
      } else if ((col * 7 + row * 3) % 5 === 0)
        sprite(
          ctx,
          s,
          `ore/${C.ORE_IDS[Math.min(9, row + (col % 3))]}.png`,
          x,
          y,
        );
      if (row === 5 && (col === 6 || col === 7))
        sprite(
          ctx,
          s,
          `hazards/lava/frame${String(Math.floor(s.simTime * 4) % 4).padStart(2, "0")}.png`,
          x + 6,
          y + 6,
          68,
          68,
        );
    }
  sprite(ctx, s, "surface/ground.png", 605, 231, 675, 40);
  sprite(ctx, s, "surface/cave-mouth.png", 919, 187, 80, 80);
  sprite(ctx, s, "surface/ore-market.png", 645, 82, 216, 162);
  sprite(ctx, s, "rocket/stage3.png", 1030, 40, 216, 198);
  miner(ctx, s, 925, 330, 1.2, "drill-down");
  ctx.restore();
  const gradient = ctx.createLinearGradient(420, 0, 790, 0);
  gradient.addColorStop(0, P.bg);
  gradient.addColorStop(1, "#0b172100");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 850, 720);
  label(ctx, "SURFACE", 1165, 223);
  label(ctx, "ROCKBED", 1165, 476);
  label(ctx, "THE CORE ↓", 1150, 681, P.amber);
}
function menus(ctx: Context, s: ReadState): void {
  if (s.screen === "title") {
    titleArt(ctx, s);
    label(ctx, "A SUBTERRANEAN EXPEDITION", 94, 130, P.teal);
    text(ctx, C.TITLE_TEXT, 85, 224, 88, P.text, "sans-serif", "900");
    rule(ctx, 94, 251, 70, P.amber);
    label(ctx, "DEPTH IS CHEAP.", 94, 291, P.amber);
    text(ctx, "Height is expensive.", 92, 328, 28, P.text, "sans-serif", "400");
    label(ctx, "DIG. HAUL. BUILD YOUR WAY HOME.", 94, 617);
    label(ctx, "OUTPOST 07  /  SIGNAL LOST", 94, 679, "#60818b");
    box(ctx, { x: 792, y: 577, w: 330, h: 63 }, "#0b1d29e8", "#3b5d65");
    label(ctx, "ONE PROSPECTOR. ONE WAY OFF THIS ROCK.", 810, 601, P.teal);
    label(ctx, "AN ORIGINAL DEEP-SPACE MINING EXPEDITION", 810, 622);
  } else {
    if (
      s.screen === "paused" ||
      s.screen === "game-over" ||
      s.screen === "victory"
    ) {
      world(ctx, s);
      hud(ctx, s);
      ctx.fillStyle = "#07131edb";
      ctx.fillRect(0, 0, 1280, 720);
    } else {
      titleArt(ctx, s);
      ctx.fillStyle = "#07131ee8";
      ctx.fillRect(0, 0, 1280, 720);
    }
    label(ctx, "DEEPCORE  /  EXPEDITION CONTROL", 380, 168, P.amber);
    const heading =
      s.screen === "mode-select"
        ? "CHOOSE YOUR STAKES"
        : s.screen === "size-select"
          ? "HOW DEEP WILL YOU GO?"
          : s.screen === "paused"
            ? "TAKE A BREATH."
            : s.screen === "how-to-play"
              ? "THE WAY HOME"
              : s.screen === "victory"
                ? "SIGNAL RESTORED."
                : "EXPEDITION LOST.";
    text(ctx, heading, 378, 227, 42, P.text, "sans-serif", "800");
    rule(ctx, 380, 251, 520, P.line);
    if (s.screen === "mode-select") {
      text(
        ctx,
        "STANDARD — Restore from your last Save Pad.",
        380,
        286,
        14,
        P.muted,
      );
      text(
        ctx,
        "HARDCORE — A death erases the save. Make it count.",
        380,
        313,
        14,
        P.red,
      );
    }
    if (s.screen === "size-select") {
      text(
        ctx,
        "Same gamble. A different distance to the molten heart.",
        380,
        286,
        14,
        P.muted,
      );
      text(
        ctx,
        `QUICK  ${C.STANDARD_ROWS * C.WORLD_SIZE_SCALE.quick * C.METERS_PER_ROW} m   /   STANDARD  ${C.STANDARD_ROWS * C.METERS_PER_ROW} m   /   MARATHON  ${C.STANDARD_ROWS * C.WORLD_SIZE_SCALE.marathon * C.METERS_PER_ROW} m`,
        380,
        313,
        13,
        P.teal,
      );
    }
    if (s.screen === "how-to-play") {
      const rows = [
        [
          "01 / DIG",
          "A D / arrows walk and drill walls. S / ↓ bores down. Never up.",
        ],
        [
          "02 / RETURN",
          "W / ↑ / Space fires your jetpack. Fuel is your return ticket.",
        ],
        [
          "03 / SELL",
          "Sell ore at the Market. Buy fuel, repairs and upgrades at camp.",
        ],
        [
          "04 / WATCH THE LOAD",
          "Slots hold ore. Weight slows your climb. I opens cargo; drop to lift.",
        ],
        [
          "05 / READ THE ROCK",
          "Gas seeps. Lava burns. Hull and radiator upgrades buy survival.",
        ],
        [
          "06 / FIND A WAY HOME",
          "Scan for Resonite and Cryenite. Build five rocket components.",
        ],
        [
          "07 / RACE THE CORE",
          "Extract a Core Sample. Return in 90 seconds. J jettisons it.",
        ],
        [
          "08 / BANK YOUR PROGRESS",
          "E at Save Pad saves. Standard restores; Hardcore death deletes.",
        ],
      ];
      rows.forEach(([a, b], i) => {
        label(ctx, a, 200, 298 + i * 37, P.amber);
        text(ctx, b, 405, 298 + i * 37, 13, P.text);
      });
    }
    if ((s.screen === "victory" || s.screen === "game-over") && s.summary) {
      const q = s.summary;
      text(
        ctx,
        `${Math.floor(q.deepestDepthMeters)} m DEEPEST  ·  ${q.creditsEarned.toLocaleString()} Cr EARNED`,
        380,
        285,
        14,
        P.teal,
      );
      text(
        ctx,
        `${Math.floor(q.elapsedSeconds / 60)}m ${Math.floor(q.elapsedSeconds % 60)}s  /  ${nice(q.mode)}  /  ${q.componentsInstalled} COMPONENTS`,
        380,
        311,
        13,
        P.muted,
      );
      if (q.deathCause) text(ctx, nice(q.deathCause), 380, 330, 12, P.red);
    }
  }
  menu(s).forEach((item, i) => {
    const r = menuRect(s, i);
    if (r) {
      button(ctx, r, item, true, i === s.menuIndex);
      if (i === s.menuIndex) {
        text(ctx, "›", r.x - 23, r.y + 34, 28, P.amber);
      }
    }
  });
  if (s.screen !== "title")
    label(ctx, "↑ ↓  SELECT   /   ENTER  CONFIRM   /   ESC  BACK", 380, 691);
}
export function render(s: ReadState, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  if (s.screen === "in-mine") {
    world(ctx, s);
    hud(ctx, s);
    mineOverlays(ctx, s);
    panel(ctx, s);
  } else menus(ctx, s);
}
