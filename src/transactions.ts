import * as C from "./constants";
import {
  type DeepcoreState,
  type ReadState,
  at,
  cell,
  copy,
  cue,
  depth,
  effect,
  fraction,
  maxFuel,
  maxHull,
  minable,
  note,
  position,
  put,
} from "./model";

export const SAVE_KEY = "deepcore-expedition";
export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}
export function clearSave(s: DeepcoreState): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* Optional browser storage. */
  }
  s.hasSave = false;
}
export function save(s: DeepcoreState): void {
  if (s.coreTimer !== null) {
    note(s, "SAVE REFUSED / Live Core Sample is unstable.");
    return;
  }
  try {
    const { images: _images, systems: _systems, ...payload } = s;
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    s.hasSave = true;
    note(s, "EXPEDITION SAVED / Your progress is banked.");
    cue(s, C.CUES.fabricate);
  } catch {
    note(s, "STORAGE UNAVAILABLE / Expedition cannot be saved.");
  }
}
export function restore(s: ReadState): DeepcoreState {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (!text) return copy(s);
    const n = {
      ...JSON.parse(text),
      images: s.images,
      systems: s.systems,
    } as DeepcoreState;
    n.screen = "in-mine";
    n.panel = null;
    n.menuIndex = 0;
    n.summary = null;
    n.hasSave = true;
    n.miner = {
      ...n.miner,
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      state: "idle",
    };
    n.effects = [];
    n.pendingCues = [];
    n.drilling = null;
    n.camera.lead = 0;
    return n;
  } catch {
    return copy(s);
  }
}
export function finish(s: DeepcoreState, cause: C.DeathCause | null): void {
  if (s.screen === "game-over" || s.screen === "victory") return;
  s.summary = {
    deepestDepthMeters: s.deepestDepthMeters,
    creditsEarned: s.creditsEarned,
    elapsedSeconds: s.elapsedSeconds,
    mode: s.mode,
    componentsInstalled: s.installed,
    deathCause: cause,
  };
  s.screen = cause ? "game-over" : "victory";
  s.menuIndex = 0;
  s.panel = null;
  s.coreTimer = null;
  s.coreGround = null;
  s.satchel.coreSample = false;
  if (cause) {
    effect(
      s,
      "death-burst",
      s.miner.x + C.MINER_W / 2,
      s.miner.y + C.MINER_H / 2,
    );
    cue(s, C.CUES.death);
    if (s.mode === "hardcore") clearSave(s);
  } else clearSave(s);
}
export function damage(
  s: DeepcoreState,
  amount: number,
  hazard?: C.NoticeHazard,
): void {
  if (amount <= 0) return;
  s.miner.hull = Math.max(0, s.miner.hull - amount);
  s.hurt = C.HURT_TIME;
  if (hazard && !s.noticesFired[hazard]) {
    s.noticesFired[hazard] = true;
    s.notice = { hazard, age: 0 };
  }
  if (s.miner.hull <= 0) finish(s, "hull-destroyed");
}
export function gas(s: DeepcoreState, col: number, row: number): void {
  const x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE,
    dx = s.miner.x + C.MINER_W / 2 - x,
    dy = s.miner.y + C.MINER_H / 2 - y,
    d = Math.hypot(dx, dy);
  effect(s, "gas-explosion", x, y);
  cue(s, C.CUES.gasExplosion);
  s.shake = 1;
  if (d <= C.GAS_BLAST_TILES * C.TILE) {
    damage(
      s,
      C.GAS_DAMAGE_MIN +
        ((C.GAS_DAMAGE_MAX - C.GAS_DAMAGE_MIN) *
          Math.max(0, fraction(row, s.coreRow) - 0.25)) /
          0.75,
      "gas",
    );
    if (s.miner.travel) {
      s.miner.vx = (dx / (d || 1)) * C.GAS_KNOCKBACK;
      s.miner.vy = (dy / (d || 1)) * C.GAS_KNOCKBACK;
    }
  }
}
export function collect(s: DeepcoreState, col: number, row: number): void {
  const t = at(s, col, row),
    x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE;
  put(s, col, row, cell("tunnel", t.band));
  if (t.ore) {
    const count = Object.values(s.cargo).reduce((a, b) => a + (b ?? 0), 0);
    if (count < C.CARGO_TIERS[s.tiers.cargo - 1]) {
      s.cargo[t.ore] = (s.cargo[t.ore] ?? 0) + 1;
      const colors = [
        "#c48d72",
        "#c2b96f",
        "#e29c59",
        "#d5e5de",
        "#67b6d9",
        "#c1df67",
        "#9e8acc",
        "#f39361",
        "#eb5c62",
        "#8ce7e3",
        "#6bf0a7",
        "#f98bbe",
        "#ffdc74",
      ];
      effect(
        s,
        "ore-sparkle",
        x,
        y,
        colors[C.MINERALS.findIndex((m) => m.id === t.ore)],
      );
      cue(s, C.CUES.orePickup);
      note(
        s,
        `+ ${C.MINERALS.find((m) => m.id === t.ore)?.name} / Cargo secured`,
      );
    } else note(s, "CARGO FULL / Ore left behind.");
  }
  if (t.material) {
    s.satchel[t.material]++;
    effect(s, "material-shimmer", x, y);
    cue(s, C.CUES.materialChime);
    note(s, `${t.material.toUpperCase()} / Exotic material secured`);
  }
  if (t.kind === "gas") gas(s, col, row);
  if (t.kind === "lava") {
    damage(
      s,
      (t.band === "coreshell"
        ? C.LAVA_DRILL_CORESHELL
        : C.LAVA_DRILL_DEEPSTONE) *
        (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]),
      "lava",
    );
    effect(s, "lava-embers", x, y);
    cue(s, C.CUES.lavaSizzle);
  }
}
export function dropOre(s: DeepcoreState, ore: C.OreId): void {
  if ((s.cargo[ore] ?? 0) > 0) {
    s.cargo[ore] = (s.cargo[ore] ?? 0) - 1;
    if (!s.cargo[ore]) delete s.cargo[ore];
    note(s, "ORE DISCARDED / Load reduced.");
  }
}
export function sell(s: DeepcoreState): void {
  const value = C.MINERALS.reduce(
    (a, m) => a + (s.cargo[m.id] ?? 0) * m.value,
    0,
  );
  if (!value) {
    note(s, "CARGO EMPTY / Bring back a haul.");
    return;
  }
  s.credits += value;
  s.creditsEarned += value;
  s.cargo = {};
  cue(s, C.CUES.fabricate);
  note(s, `HAUL SOLD / +${value.toLocaleString()} Credits`);
}
export function service(
  s: DeepcoreState,
  kind: "fuel" | "hull",
  full: boolean,
): void {
  const price = kind === "fuel" ? C.FUEL_PRICE : C.REPAIR_PRICE,
    max = kind === "fuel" ? maxFuel(s) : maxHull(s),
    increment = kind === "fuel" ? C.FUEL_BUY_INCREMENT : C.REPAIR_BUY_INCREMENT;
  const amount = Math.max(
    0,
    Math.min(
      max - s.miner[kind],
      full ? Infinity : increment,
      s.credits / price,
    ),
  );
  if (!amount) {
    note(s, "SERVICE UNAVAILABLE / Check balance and capacity.");
    return;
  }
  s.miner[kind] += amount;
  s.credits -= amount * price;
  cue(s, C.CUES.fabricate);
  note(s, "SERVICE COMPLETE / Ready for the next descent.");
}
export function buyUpgrade(s: DeepcoreState, track: C.TrackName): void {
  const tier = s.tiers[track],
    price = C.UPGRADE_PRICES[tier - 1];
  if (tier >= C.MAX_TIER[track] || s.credits < price) {
    note(s, "UPGRADE UNAVAILABLE / More Credits required.");
    return;
  }
  const fuel = maxFuel(s),
    hull = maxHull(s);
  s.credits -= price;
  s.tiers[track]++;
  s.miner.fuel += maxFuel(s) - fuel;
  s.miner.hull += maxHull(s) - hull;
  cue(s, C.CUES.fabricate);
  note(s, `${track.toUpperCase()} / Tier ${tier + 1} installed`);
}
export function buyItem(s: DeepcoreState, item: C.ItemId): void {
  const price = C.ITEMS.find((t) => t.id === item)!.price;
  if (s.credits < price) {
    note(s, "INSUFFICIENT CREDITS");
    return;
  }
  s.credits -= price;
  s.items[item]++;
  cue(s, C.CUES.fabricate);
  note(s, "FIELD SUPPLY / Added to inventory");
}
export function useItem(s: DeepcoreState, item: C.ItemId): void {
  if (!s.items[item]) {
    note(s, "NO SUPPLY / Visit the Supply Depot.");
    return;
  }
  const p = position(s);
  if (item === "nanobots" || item === "emergency-fuel") {
    const kind = item === "nanobots" ? "hull" : "fuel",
      max = kind === "hull" ? maxHull(s) : maxFuel(s),
      amount = kind === "hull" ? C.NANOBOT_HULL : C.EMERGENCY_FUEL;
    if (s.miner[kind] >= max) {
      note(s, "ALREADY FULL / Supply preserved.");
      return;
    }
    s.miner[kind] = Math.min(max, s.miner[kind] + amount);
    effect(s, "material-shimmer", s.miner.x, s.miner.y);
    cue(s, C.CUES.fabricate);
  } else if (item === "quantum-teleporter" || item === "matter-transmitter") {
    const height =
      s.nextTeleportHeight ??
      C.TELEPORT_HEIGHT_TILES_MIN +
        Math.random() *
          (C.TELEPORT_HEIGHT_TILES_MAX - C.TELEPORT_HEIGHT_TILES_MIN);
    const speed =
      s.nextTeleportSpeed ??
      C.TELEPORT_SPEED_MIN +
        Math.random() * (C.TELEPORT_SPEED_MAX - C.TELEPORT_SPEED_MIN);
    if (
      item === "matter-transmitter" &&
      s.miner.y === C.SURFACE_Y - C.MINER_H &&
      s.miner.vx === 0 &&
      s.miner.vy === 0
    ) {
      note(s, "ALREADY AT CAMP");
      return;
    }
    s.miner.x = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2;
    s.miner.y =
      C.SURFACE_Y -
      C.MINER_H -
      (item === "quantum-teleporter" ? height * C.TILE : 0);
    s.miner.vx = 0;
    s.miner.vy = item === "quantum-teleporter" ? speed : 0;
    if (item === "quantum-teleporter") {
      s.nextTeleportHeight = null;
      s.nextTeleportSpeed = null;
    }
    s.drilling = null;
    effect(s, "core-extract", s.miner.x, s.miner.y);
    cue(s, C.CUES.materialChime);
  } else {
    const radius =
      item === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
    let changed = false;
    for (
      let row = Math.max(1, p.row - radius);
      row <= Math.min(s.coreRow, p.row + radius);
      row++
    )
      for (
        let col = Math.max(0, p.col - radius);
        col <= Math.min(C.WORLD_COLS - 1, p.col + radius);
        col++
      ) {
        const t = at(s, col, row);
        if ((minable(t.kind) && t.kind !== "material") || t.kind === "stone") {
          changed = true;
          put(s, col, row, cell("tunnel", t.band));
          if (t.kind === "gas") gas(s, col, row);
        }
      }
    if (!changed) {
      note(s, "NOTHING TO BLAST / Supply preserved.");
      return;
    }
    effect(
      s,
      "gas-explosion",
      s.miner.x + C.MINER_W / 2,
      s.miner.y + C.MINER_H / 2,
    );
    cue(s, C.CUES.gasExplosion);
    s.shake = 1;
  }
  s.items[item]--;
  note(
    s,
    `${C.ITEMS.find((t) => t.id === item)!.name.toUpperCase()} / Deployed`,
  );
  if (s.miner.hull <= 0) finish(s, "hull-destroyed");
}
export function jettison(s: DeepcoreState): void {
  if (!s.satchel.coreSample) {
    note(s, "NO CORE SAMPLE TO JETTISON");
    return;
  }
  s.satchel.coreSample = false;
  s.coreGround = position(s);
  note(s, "CORE JETTISONED / Move at least three tiles clear.");
}
export function canFabricate(s: ReadState): boolean {
  const component = C.ROCKET_COMPONENTS[s.installed];
  return (
    !!component &&
    s.credits >= component.credits &&
    (!component.material ||
      (component.material === "core-sample"
        ? s.satchel.coreSample
        : s.satchel[component.material] > 0))
  );
}
export function fabricate(s: DeepcoreState): void {
  if (!canFabricate(s)) {
    note(s, "FABRICATION BLOCKED / Credits or material missing.");
    return;
  }
  const c = C.ROCKET_COMPONENTS[s.installed];
  s.credits -= c.credits;
  if (c.material === "core-sample") {
    s.satchel.coreSample = false;
    s.coreTimer = null;
  } else if (c.material) s.satchel[c.material]--;
  s.installed++;
  cue(s, C.CUES.fabricate);
  note(s, `${c.name.toUpperCase()} / Installed`);
}
export function launch(s: DeepcoreState): void {
  if (s.installed !== C.ROCKET_COMPONENT_IDS.length) {
    note(s, "ROCKET INCOMPLETE");
    return;
  }
  s.launchTime = 0.001;
  s.panel = null;
  effect(s, "launch-exhaust", 1820, C.SURFACE_Y);
  cue(s, C.CUES.launch);
}
export function checkDeath(s: DeepcoreState): void {
  if (s.miner.hull <= 0) finish(s, "hull-destroyed");
  else if (s.miner.fuel <= 0 && depth(s) > 0) {
    s.miner.state = "fuel-out";
    finish(s, "fuel-out");
  }
}
