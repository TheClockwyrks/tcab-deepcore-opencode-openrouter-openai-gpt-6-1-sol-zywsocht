import * as C from "./constants";
import {
  type DeepcoreState,
  at,
  clamp,
  cue,
  depth,
  effect,
  grounded,
  lift,
  minable,
  position,
  put,
  weight,
} from "./model";
import { checkDeath, collect, damage, finish } from "./transactions";

export interface Held {
  left: boolean;
  right: boolean;
  down: boolean;
  up: boolean;
}
const STEP = 1 / 120;
function solid(s: DeepcoreState, col: number, row: number): boolean {
  return at(s, col, row).kind !== "tunnel";
}
function move(s: DeepcoreState, dt: number): void {
  const m = s.miner;
  let x = clamp(m.x + m.vx * dt, C.TILE, C.WORLD_W - C.TILE - C.MINER_W);
  const left = Math.floor(x / C.TILE),
    right = Math.floor((x + C.MINER_W - 0.001) / C.TILE);
  for (
    let row = Math.floor(m.y / C.TILE);
    row <= Math.floor((m.y + C.MINER_H - 0.001) / C.TILE);
    row++
  ) {
    if (m.vx > 0 && solid(s, right, row))
      x = Math.min(x, right * C.TILE - C.MINER_W);
    if (m.vx < 0 && solid(s, left, row)) x = Math.max(x, (left + 1) * C.TILE);
  }
  m.x = x;
  let y = m.y + m.vy * dt;
  const top = Math.floor(y / C.TILE),
    bottom = Math.floor((y + C.MINER_H - 0.001) / C.TILE);
  for (
    let col = Math.floor(m.x / C.TILE);
    col <= Math.floor((m.x + C.MINER_W - 0.001) / C.TILE);
    col++
  ) {
    if (m.vy >= 0 && solid(s, col, bottom)) {
      y = Math.min(y, bottom * C.TILE - C.MINER_H);
      if (m.vy > C.IMPACT_SAFE_SPEED) {
        const amount = (m.vy - C.IMPACT_SAFE_SPEED) * C.IMPACT_DAMAGE_RATE;
        damage(s, amount);
        effect(s, "impact-dust", m.x + C.MINER_W / 2, y + C.MINER_H);
        cue(s, C.CUES.impact);
        s.shake = Math.max(s.shake, amount / 70);
      }
      m.vy = 0;
    } else if (m.vy < 0 && solid(s, col, top)) {
      y = Math.max(y, (top + 1) * C.TILE);
      m.vy = 0;
    }
  }
  m.y = y;
}
function drill(s: DeepcoreState, h: Held, dt: number): void {
  const m = s.miner;
  if (!m.drill || h.up || m.fuel <= 0 || !grounded(s)) {
    s.drilling = null;
    s.drillClock = 0;
    return;
  }
  const p = position(s);
  let target = s.drilling;
  if (
    target &&
    ((target.dir === "down" && !h.down) ||
      (target.dir === "left" && !h.left) ||
      (target.dir === "right" && !h.right) ||
      !solid(s, target.col, target.row))
  )
    target = null;
  if (!target) {
    if (h.down)
      target = {
        col: p.col,
        row: Math.floor((m.y + C.MINER_H + 0.2) / C.TILE),
        dir: "down",
      };
    else if (h.left && Math.abs(m.x - Math.round(m.x / C.TILE) * C.TILE) < 0.5)
      target = { col: Math.round(m.x / C.TILE) - 1, row: p.row, dir: "left" };
    else if (
      h.right &&
      Math.abs(
        m.x + C.MINER_W - Math.round((m.x + C.MINER_W) / C.TILE) * C.TILE,
      ) < 0.5
    )
      target = {
        col: Math.round((m.x + C.MINER_W) / C.TILE),
        row: p.row,
        dir: "right",
      };
  }
  if (!target) {
    s.drilling = null;
    s.drillClock = 0;
    return;
  }
  const t = at(s, target.col, target.row);
  if (t.kind === "core" && target.dir === "down") {
    s.drilling = null;
    if (s.coreTimer === null) {
      s.drillClock += dt;
      if (s.drillClock >= C.DRILL_HIT_INTERVAL) {
        s.drillClock = 0;
        s.satchel.coreSample = true;
        s.coreTimer = C.CORE_TIMER;
        effect(
          s,
          "core-extract",
          (target.col + 0.5) * C.TILE,
          target.row * C.TILE,
        );
        cue(s, C.CUES.materialChime);
      }
    }
    return;
  }
  if (!minable(t.kind)) {
    s.drilling = null;
    s.drillClock = 0;
    return;
  }
  if (
    !s.drilling ||
    s.drilling.col !== target.col ||
    s.drilling.row !== target.row
  )
    s.drillClock = 0;
  s.drilling = target;
  s.drillClock += dt;
  if (s.drillClock + 1e-9 >= C.DRILL_HIT_INTERVAL) {
    s.drillClock -= C.DRILL_HIT_INTERVAL;
    m.fuel = Math.max(0, m.fuel - C.DRILL_HIT_FUEL);
    const health = (t.health ?? 0) - C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1];
    const below = at(s, target.col, target.row + 1),
      sink =
        target.dir === "down" &&
        below.kind !== "tunnel" &&
        below.kind !== "lava";
    if (health <= 0) {
      collect(s, target.col, target.row);
      if (sink && m.travel) m.y = (target.row + 1) * C.TILE - C.MINER_H;
      s.drilling = null;
    } else {
      put(s, target.col, target.row, { ...t, health });
      if (sink && m.travel)
        m.y =
          target.row * C.TILE -
          C.MINER_H +
          C.TILE * (1 - health / C.BAND_HEALTH[t.band!]);
    }
  }
}
function step(s: DeepcoreState, h: Held, dt: number): void {
  const m = s.miner;
  s.elapsedSeconds += dt;
  s.animTime += dt;
  s.hurt = Math.max(0, s.hurt - dt);
  s.shake = Math.max(0, s.shake - dt * 0.7);
  if (s.notice) {
    s.notice.age += dt;
    if (s.notice.age > C.NOTICE_DELAY + C.NOTICE_FADE) s.notice = null;
  }
  if (s.coreTimer !== null) {
    s.coreTimer -= dt;
    if (s.coreTimer <= 0) {
      const p = s.coreGround,
        x = p ? (p.col + 0.5) * C.TILE : m.x + C.MINER_W / 2,
        y = p ? (p.row + 0.5) * C.TILE : m.y + C.MINER_H / 2;
      effect(s, "core-detonation", x, y);
      cue(s, C.CUES.gasExplosion);
      s.shake = 2;
      const kill =
        s.satchel.coreSample ||
        Math.hypot(m.x + C.MINER_W / 2 - x, m.y + C.MINER_H / 2 - y) <=
          C.CORE_BLAST_TILES * C.TILE;
      s.coreTimer = null;
      s.coreGround = null;
      s.satchel.coreSample = false;
      if (kill) {
        finish(s, "core-detonation");
        return;
      }
    }
  }
  checkDeath(s);
  if (s.screen !== "in-mine") return;
  if (s.launchTime > 0) {
    s.launchTime += dt;
    if (Math.floor(s.launchTime * 12) !== Math.floor((s.launchTime - dt) * 12))
      effect(
        s,
        "launch-exhaust",
        1820,
        C.SURFACE_Y - Math.pow(s.launchTime, 2) * 70,
      );
    if (s.launchTime > 3.4) finish(s, null);
    return;
  }
  if (s.panel) return;
  const ground = grounded(s),
    dir = Number(h.right) - Number(h.left),
    thrust = h.up && m.fuel > 0;
  if (dir) m.facing = dir > 0 ? "east" : "west";
  const load = weight(s) / lift(s),
    jet = C.JETPACK_TIERS[s.tiers.jetpack - 1];
  if (m.travel) {
    if (s.hurt <= 0) m.vx = dir * C.WALK_SPEED;
    if (thrust)
      m.vy = Math.max(
        -jet.emptyClimb * (1 - (1 - C.CLIMB_CAP_FLOOR) * Math.min(1, load)),
        m.vy - jet.emptyAccel * Math.max(0, 1 - load) * dt,
      );
    else if (!s.drilling)
      m.vy = Math.min(
        C.FALL_TERMINAL_EMPTY +
          (C.FALL_TERMINAL_LOADED - C.FALL_TERMINAL_EMPTY) * Math.min(1, load),
        m.vy + C.GRAVITY * dt,
      );
    if (s.drilling?.dir === "down" && h.down) {
      m.vy = 0;
      const oldY = m.y;
      move(s, dt);
      m.y = oldY;
    } else move(s, dt);
  }
  drill(s, h, dt);
  let burn = depth(s) > 0 ? C.LIFE_SUPPORT_BURN : 0;
  if (thrust)
    burn +=
      (C.THRUST_BURN_MAX +
        (C.THRUST_BURN_MIN - C.THRUST_BURN_MAX) *
          Math.min(1, Math.max(0, -m.vy) / C.CRUISE_SPEED)) *
      C.THRUST_BURN_SIZE_MULT[s.worldSize];
  if (dir && !ground) burn += C.AIR_BURN;
  m.fuel = Math.max(0, m.fuel - burn * dt);
  // Contact includes a touching face, but the actively cut lava charges its lump only.
  let lava = false;
  for (
    let row = Math.floor((m.y - 0.1) / C.TILE);
    row <= Math.floor((m.y + C.MINER_H + 0.1) / C.TILE);
    row++
  )
    for (
      let col = Math.floor((m.x - 0.1) / C.TILE);
      col <= Math.floor((m.x + C.MINER_W + 0.1) / C.TILE);
      col++
    )
      if (
        at(s, col, row).kind === "lava" &&
        !(s.drilling?.col === col && s.drilling.row === row)
      )
        lava = true;
  if (lava) {
    damage(
      s,
      C.LAVA_CONTACT_DPS * (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]) * dt,
      "lava",
    );
    if (
      Math.floor(s.elapsedSeconds * 8) !==
      Math.floor((s.elapsedSeconds - dt) * 8)
    ) {
      effect(s, "lava-embers", m.x + C.MINER_W / 2, m.y + C.MINER_H);
      cue(s, C.CUES.lavaSizzle);
    }
  }
  const next: C.MinerState = s.drilling
    ? s.drilling.dir === "down"
      ? "drill-down"
      : "drill-side"
    : s.hurt > 0
      ? "hurt"
      : m.fuel === 0 && depth(s) > 0
        ? "fuel-out"
        : thrust
          ? "jetpack"
          : !grounded(s)
            ? "fall"
            : dir
              ? "walk"
              : "idle";
  if (next !== m.state) s.animTime = 0;
  m.state = next;
  if (
    Math.floor(s.elapsedSeconds * 10) !==
    Math.floor((s.elapsedSeconds - dt) * 10)
  ) {
    if (s.drilling) {
      const band = at(s, s.drilling.col, s.drilling.row).band;
      const tint =
        band === "topsoil"
          ? "#b39577"
          : band === "rockbed"
            ? "#a0b5b7"
            : band === "deepstone"
              ? "#8e95b3"
              : "#c58e89";
      effect(
        s,
        "drill-debris",
        m.x +
          C.MINER_W / 2 +
          (s.drilling.dir === "right"
            ? 35
            : s.drilling.dir === "left"
              ? -35
              : 0),
        m.y + (s.drilling.dir === "down" ? C.MINER_H : 40),
        tint,
      );
    }
    if (thrust) effect(s, "jetpack-exhaust", m.x + 18, m.y + 60);
  }
  s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
  checkDeath(s);
}
export function advance(s: DeepcoreState, h: Held, dt: number): void {
  s.accumulator += dt;
  while (s.accumulator + 1e-9 >= STEP && s.screen === "in-mine") {
    step(s, h, STEP);
    s.accumulator -= STEP;
  }
  if (s.screen !== "in-mine") s.accumulator = 0;
}
export function camera(s: DeepcoreState, dt: number): void {
  const target =
    Math.abs(s.miner.vy) <= C.CAM_STILL_SPEED
      ? 0
      : Math.sign(s.miner.vy) * C.CAM_LEAD_MAX;
  let lead = s.camera.lead;
  const speed = C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP;
  if (lead !== 0 && Math.sign(lead) !== Math.sign(target)) {
    const duration = Math.min(dt, Math.abs(lead) / (speed * C.CAM_UNWIND_MULT));
    lead -=
      Math.sign(lead) *
      Math.min(Math.abs(lead), duration * speed * C.CAM_UNWIND_MULT);
    dt -= duration;
  }
  s.camera.lead = lead + clamp(target - lead, -speed * dt, speed * dt);
  s.camera.x = clamp(
    s.miner.x + C.MINER_W / 2 - C.VIEW_W / 2,
    0,
    C.WORLD_W - C.VIEW_W,
  );
  s.camera.y = Math.min(
    s.miner.y + C.MINER_H / 2 - C.VIEW_H / 2 + s.camera.lead,
    (s.coreRow + 1) * C.TILE - C.VIEW_H,
  );
}
