import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";

export interface Cell {
  kind: C.TileKind;
  band: C.BandName | null;
  ore: C.OreId | null;
  material: C.MaterialId | null;
  health: number | null;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Effect {
  name: string;
  x: number;
  y: number;
  age: number;
  seed: number;
  tint?: string;
}
export interface DeepcoreState {
  screen: C.ScreenName;
  panel: C.PanelId | null;
  mode: C.Mode;
  worldSize: C.WorldSize;
  coreRow: number;
  menuIndex: number;
  muted: boolean;
  simTime: number;
  elapsedSeconds: number;
  hasSave: boolean;
  credits: number;
  creditsEarned: number;
  deepestDepthMeters: number;
  grid: Cell[];
  miner: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: C.Facing;
    state: C.MinerState;
    travel: boolean;
    drill: boolean;
    fuel: number;
    hull: number;
  };
  tiers: Record<C.TrackName, number>;
  cargo: Partial<Record<C.OreId, number>>;
  satchel: { resonite: number; cryenite: number; coreSample: boolean };
  items: Record<C.ItemId, number>;
  installed: number;
  coreTimer: number | null;
  coreGround: { col: number; row: number } | null;
  camera: { x: number; y: number; lead: number };
  drilling: { col: number; row: number; dir: "down" | "left" | "right" } | null;
  drillClock: number;
  hurt: number;
  animTime: number;
  accumulator: number;
  nextTeleportHeight: number | null;
  nextTeleportSpeed: number | null;
  noticesFired: Record<C.NoticeHazard, boolean>;
  notice: { hazard: C.NoticeHazard; age: number } | null;
  summary: {
    deepestDepthMeters: number;
    creditsEarned: number;
    elapsedSeconds: number;
    mode: C.Mode;
    componentsInstalled: number;
    deathCause: C.DeathCause | null;
  } | null;
  note: string;
  noteTime: number;
  shake: number;
  launchTime: number;
  effects: Effect[];
  pendingCues: C.CueName[];
  pointerDown: Record<number, string>;
  images: Record<string, ImageBitmap>;
  systems: Record<string, ParticleSystem>;
}
export type ReadState = DeepReadonly<DeepcoreState>;
export const clamp = (n: number, a: number, b: number): number =>
  Math.max(a, Math.min(b, n));
export const fraction = (row: number, coreRow: number): number =>
  (row - 1) / (coreRow - 1);
export const bandAt = (row: number, coreRow: number): C.BandName =>
  C.BANDS[Math.min(3, Math.floor(4 * fraction(row, coreRow)))];
export const minable = (kind: C.TileKind): boolean =>
  ["rock", "ore", "material", "gas", "lava"].includes(kind);
export function cell(kind: C.TileKind, band: C.BandName | null): Cell {
  return {
    kind,
    band,
    ore: null,
    material: null,
    health: minable(kind) && band ? C.BAND_HEALTH[band] : null,
  };
}
export function emptyMine(coreRow: number): Cell[] {
  return Array.from({ length: (coreRow + 1) * C.WORLD_COLS }, (_, i) => {
    const row = Math.floor(i / C.WORLD_COLS),
      col = i % C.WORLD_COLS;
    return cell(
      row === coreRow
        ? col === C.CORE_COL
          ? "core"
          : "bedrock"
        : col === 0 || col === C.WORLD_COLS - 1
          ? "bedrock"
          : "tunnel",
      row > 0 && row < coreRow ? bandAt(row, coreRow) : null,
    );
  });
}
export function at(s: ReadState, col: number, row: number): DeepReadonly<Cell> {
  return row < 0
    ? cell("tunnel", null)
    : s.grid[row * C.WORLD_COLS + col] && col >= 0 && col < C.WORLD_COLS
      ? s.grid[row * C.WORLD_COLS + col]
      : cell("bedrock", null);
}
export function put(s: DeepcoreState, col: number, row: number, c: Cell): void {
  s.grid[row * C.WORLD_COLS + col] = c;
}
export function copy(s: ReadState): DeepcoreState {
  // Assets are immutable handles. Cells use copy-on-write; no prior frame is modified.
  return {
    ...s,
    grid: [...s.grid],
    miner: { ...s.miner },
    tiers: { ...s.tiers },
    cargo: { ...s.cargo },
    satchel: { ...s.satchel },
    items: { ...s.items },
    camera: { ...s.camera },
    drilling: s.drilling ? { ...s.drilling } : null,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    notice: s.notice ? { ...s.notice } : null,
    noticesFired: { ...s.noticesFired },
    effects: s.effects.map((e) => ({ ...e })),
    pendingCues: [...s.pendingCues],
    pointerDown: { ...s.pointerDown },
    images: s.images as Record<string, ImageBitmap>,
    systems: s.systems as Record<string, ParticleSystem>,
  };
}
export function initial(
  images: DeepcoreState["images"] = {},
  systems: DeepcoreState["systems"] = {},
): DeepcoreState {
  const s: DeepcoreState = {
    screen: "title",
    panel: null,
    mode: "standard",
    worldSize: "standard",
    coreRow: C.STANDARD_ROWS,
    menuIndex: 0,
    muted: false,
    simTime: 0,
    elapsedSeconds: 0,
    hasSave: false,
    credits: 0,
    creditsEarned: 0,
    deepestDepthMeters: 0,
    grid: emptyMine(C.STANDARD_ROWS),
    miner: {
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      facing: "east",
      state: "idle",
      travel: true,
      drill: true,
      fuel: C.FUEL_TIERS[0],
      hull: C.HULL_TIERS[0],
    },
    tiers: Object.fromEntries(C.TRACKS.map((t) => [t, 1])) as Record<
      C.TrackName,
      number
    >,
    cargo: {},
    satchel: { resonite: 0, cryenite: 0, coreSample: false },
    items: Object.fromEntries(C.ITEM_IDS.map((t) => [t, 0])) as Record<
      C.ItemId,
      number
    >,
    installed: 0,
    coreTimer: null,
    coreGround: null,
    camera: { x: 0, y: -300, lead: 0 },
    drilling: null,
    drillClock: 0,
    hurt: 0,
    animTime: 0,
    accumulator: 0,
    nextTeleportHeight: null,
    nextTeleportSpeed: null,
    noticesFired: { gas: false, lava: false },
    notice: null,
    summary: null,
    note: "",
    noteTime: 0,
    shake: 0,
    launchTime: 0,
    effects: [],
    pendingCues: [],
    pointerDown: {},
    images,
    systems,
  };
  return s;
}
export function position(s: ReadState): { col: number; row: number } {
  return {
    col: Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE),
    row: Math.max(0, Math.floor((s.miner.y + C.MINER_H / 2) / C.TILE)),
  };
}
export const maxFuel = (s: ReadState): number => C.FUEL_TIERS[s.tiers.fuel - 1];
export const maxHull = (s: ReadState): number => C.HULL_TIERS[s.tiers.hull - 1];
export const slots = (s: ReadState): number =>
  Object.values(s.cargo).reduce((a, b) => a + (b ?? 0), 0);
export const weight = (s: ReadState): number =>
  C.MINERALS.reduce((a, m) => a + (s.cargo[m.id] ?? 0) * m.weightKg, 0);
export const lift = (s: ReadState): number =>
  C.JETPACK_TIERS[s.tiers.jetpack - 1].liftLimitKg;
export const depth = (s: ReadState): number =>
  Math.max(
    0,
    ((s.miner.y + C.MINER_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW,
  );
export function grounded(s: ReadState): boolean {
  if (s.drilling?.dir === "down") return true;
  const feet = s.miner.y + C.MINER_H,
    row = Math.floor((feet + 0.2) / C.TILE);
  if (Math.abs(feet - row * C.TILE) > 0.6) return false;
  return [s.miner.x + 1, s.miner.x + C.MINER_W - 1].some(
    (x) => at(s, Math.floor(x / C.TILE), row).kind !== "tunnel",
  );
}
export function scanner(s: ReadState) {
  const range = C.SCANNER_TIERS[s.tiers.scanner - 1],
    p = position(s);
  let target: C.MaterialId | null = null,
    dist = Infinity,
    dx = 0,
    dy = 0;
  if (range !== null)
    for (let i = 0; i < s.grid.length; i++) {
      const t = s.grid[i];
      if (t.material && s.satchel[t.material] === 0) {
        const x = (i % C.WORLD_COLS) - p.col,
          y = Math.floor(i / C.WORLD_COLS) - p.row,
          d = Math.hypot(x, y);
        if (d < dist) {
          dist = d;
          target = t.material;
          dx = x;
          dy = y;
        }
      }
    }
  const locked = range !== null && dist <= range;
  return {
    locked,
    target: locked ? target : null,
    dirX: locked ? dx / (dist || 1) : 0,
    dirY: locked ? dy / (dist || 1) : 0,
    distanceTiles: locked ? dist : null,
  };
}
export const BUILDING_RECTS = C.BUILDINGS.map((id, i) => ({
  id,
  x: 100 + i * 320,
  y: C.SURFACE_Y - (id === "launch-pad" ? 220 : 180),
  w: 240,
  h: id === "launch-pad" ? 220 : 180,
}));
export function effect(
  s: DeepcoreState,
  name: string,
  x: number,
  y: number,
  tint?: string,
): void {
  s.effects.push({
    name,
    x,
    y,
    age: 0,
    seed: Math.floor(Math.random() * 100000),
    tint,
  });
}
export function note(s: DeepcoreState, text: string): void {
  s.note = text;
  s.noteTime = 3.5;
}
export function cue(s: DeepcoreState, name: C.CueName): void {
  s.pendingCues.push(name);
}
