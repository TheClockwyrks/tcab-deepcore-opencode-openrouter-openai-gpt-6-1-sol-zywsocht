import * as C from "./constants";
import {
  type Cell,
  type DeepcoreState,
  type ReadState,
  bandAt,
  cell,
  emptyMine,
  fraction,
  initial,
} from "./model";

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function oreAt(f: number): C.OreId {
  const weights = C.MINERALS.map(
    (m) => m.pick * Math.max(0, 1 - Math.abs(f - m.peak) / m.spread),
  );
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return C.MINERALS[i].id;
  }
  return C.ORE_IDS[0];
}
export function generate(coreRow: number): Cell[] {
  const grid = emptyMine(coreRow);
  for (const band of C.BANDS) {
    const indices: number[] = [];
    for (let row = 1; row < coreRow; row++)
      if (bandAt(row, coreRow) === band)
        for (let col = 1; col < C.WORLD_COLS - 1; col++) {
          const i = row * C.WORLD_COLS + col;
          grid[i] = cell("rock", band);
          indices.push(i);
        }
    const available = shuffle(
      indices.filter((i) => Math.floor(i / C.WORLD_COLS) >= C.ORE_MIN_ROW),
    );
    const oreCount = Math.round(indices.length * C.ORE_DENSITY);
    for (const i of available.slice(0, oreCount)) {
      grid[i] = {
        ...cell("ore", band),
        ore: oreAt(fraction(Math.floor(i / C.WORLD_COLS), coreRow)),
      };
    }
    const mid =
      indices.reduce(
        (a, i) => a + fraction(Math.floor(i / C.WORLD_COLS), coreRow),
        0,
      ) / indices.length;
    const hazards = shuffle(
      indices.filter(
        (i) =>
          grid[i].kind === "rock" &&
          i % C.WORLD_COLS !== C.CAVE_MOUTH_COL &&
          i % C.WORLD_COLS !== C.CORE_COL,
      ),
    );
    let cursor = 0;
    if (band !== "topsoil") {
      for (const [kind, density] of [
        [
          "stone",
          C.STONE_DENSITY_MIN +
            ((C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) * (mid - 0.25)) / 0.75,
        ],
        [
          "gas",
          C.GAS_DENSITY_MIN +
            ((C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) * (mid - 0.25)) / 0.75,
        ],
      ] as const) {
        for (let n = 0; n < Math.round(indices.length * density); n++) {
          const i = hazards[cursor++];
          grid[i] = cell(kind, band);
        }
      }
    }
    if (band === "deepstone" || band === "coreshell") {
      const density =
        C.LAVA_DENSITY_MIN +
        ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) * (mid - 0.5)) / 0.5;
      let left = Math.round(indices.length * density);
      while (left > 0 && cursor < hazards.length) {
        const start = hazards[cursor++];
        for (let dx = 0; dx < 3 && left > 0; dx++) {
          const i = start + dx,
            col = i % C.WORLD_COLS;
          if (
            col > 0 &&
            col < C.WORLD_COLS - 1 &&
            col !== C.CAVE_MOUTH_COL &&
            col !== C.CORE_COL &&
            grid[i]?.kind === "rock" &&
            grid[i].band === band
          ) {
            grid[i] = cell("lava", band);
            left--;
          }
        }
      }
    }
    const material = C.MATERIALS.find((m) => C.MATERIAL_BAND[m] === band);
    if (material) {
      const candidates = indices.filter((i) => grid[i].kind === "rock");
      const i = candidates[Math.floor(Math.random() * candidates.length)];
      grid[i] = { ...cell("material", band), material };
      // A clearable horizontal route joins the protected vertical shaft.
      const row = Math.floor(i / C.WORLD_COLS),
        col = i % C.WORLD_COLS;
      for (
        let x = Math.min(col, C.CAVE_MOUTH_COL);
        x <= Math.max(col, C.CAVE_MOUTH_COL);
        x++
      ) {
        const j = row * C.WORLD_COLS + x;
        if (["lava", "stone"].includes(grid[j].kind))
          grid[j] = cell("rock", band);
      }
    }
  }
  grid[C.WORLD_COLS + C.CAVE_MOUTH_COL] = cell("tunnel", "topsoil");
  for (let col = C.CORE_COL; col <= C.CAVE_MOUTH_COL; col++) {
    const i = (coreRow - 1) * C.WORLD_COLS + col;
    if (grid[i].kind === "stone" || grid[i].kind === "lava")
      grid[i] = cell("rock", grid[i].band);
  }
  return grid;
}
export function resize(s: DeepcoreState, size: C.WorldSize): void {
  const rows = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]),
    grid = emptyMine(rows);
  for (let row = 0; row < Math.min(s.coreRow, rows); row++)
    for (let col = 0; col < C.WORLD_COLS; col++)
      grid[row * C.WORLD_COLS + col] = s.grid[row * C.WORLD_COLS + col];
  s.worldSize = size;
  s.coreRow = rows;
  s.grid = grid;
}
export function start(s: ReadState): DeepcoreState {
  const n = initial(
    s.images as DeepcoreState["images"],
    s.systems as DeepcoreState["systems"],
  );
  resize(n, s.worldSize);
  n.mode = s.mode;
  n.muted = s.muted;
  n.simTime = s.simTime;
  n.grid = generate(n.coreRow);
  n.screen = "in-mine";
  try {
    localStorage.removeItem("deepcore-expedition");
  } catch {
    /* Storage is optional. */
  }
  n.note = "OUTPOST 07  /  Dig. Haul. Build your way home.";
  n.noteTime = 6;
  return n;
}
