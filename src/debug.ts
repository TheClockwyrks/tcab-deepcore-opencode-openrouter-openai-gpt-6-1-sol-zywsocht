import * as C from "./constants";
import {
  type DeepcoreState,
  type ReadState,
  BUILDING_RECTS,
  at,
  bandAt,
  cell,
  copy,
  depth,
  emptyMine,
  grounded,
  initial,
  lift,
  maxFuel,
  maxHull,
  minable,
  position,
  scanner,
  slots,
  weight,
} from "./model";
import { controlRect, menu, menuRect } from "./interface";
import { generate, resize } from "./world";
import * as T from "./transactions";

function assert(ok: boolean): asserts ok {
  if (!ok)
    throw new RangeError(
      "Deepcore debug: invalid argument or subject condition",
    );
}
function number(n: number, min = -Infinity, max = Infinity): void {
  assert(Number.isFinite(n) && n >= min && n <= max);
}
function integer(n: number, min: number, max = Infinity): void {
  number(n, min, max);
  assert(Number.isInteger(n));
}
function member<T>(n: T, a: readonly T[]): void {
  assert(a.includes(n));
}
function pose(s: ReadState, fn: (n: DeepcoreState) => void): DeepcoreState {
  const n = copy(s);
  fn(n);
  return n;
}
function tilePose(
  s: ReadState,
  col: number,
  row: number,
  fn: (n: DeepcoreState) => void,
): DeepcoreState {
  integer(col, 0, C.WORLD_COLS - 1);
  integer(row, 1, s.coreRow);
  return pose(s, fn);
}
export function tileAt(s: ReadState, col: number, row: number) {
  if (col < 0 || col >= C.WORLD_COLS || row < 0 || row > s.coreRow)
    return { ...cell("bedrock", null), maxHealth: null };
  const t = at(s, col, row);
  return {
    ...t,
    maxHealth: minable(t.kind) && t.band ? C.BAND_HEALTH[t.band] : null,
  };
}
export function snapshot(s: ReadState) {
  const p = position(s),
    target = s.drilling,
    t = target ? at(s, target.col, target.row) : null;
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    screen: s.screen,
    panel: s.panel,
    mode: s.mode,
    worldSize: s.worldSize,
    coreRow: s.coreRow,
    menuIndex: s.menuIndex,
    muted: s.muted,
    simTime: s.simTime,
    elapsedSeconds: s.elapsedSeconds,
    hasSave: s.hasSave,
    credits: s.credits,
    creditsEarned: s.creditsEarned,
    depthMeters: depth(s),
    deepestDepthMeters: s.deepestDepthMeters,
    coreTimer: s.coreTimer,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    camera: { ...s.camera },
    miner: {
      ...s.miner,
      ...p,
      grounded: grounded(s),
      maxFuel: maxFuel(s),
      maxHull: maxHull(s),
      overloaded: weight(s) >= lift(s),
      drilling: target
        ? {
            ...target,
            progress: t?.band ? 1 - (t.health ?? 0) / C.BAND_HEALTH[t.band] : 0,
          }
        : null,
    },
    cargo: {
      slotsUsed: slots(s),
      slotCap: C.CARGO_TIERS[s.tiers.cargo - 1],
      loadKg: weight(s),
      liftLimitKg: lift(s),
      ore: Object.fromEntries(
        Object.entries(s.cargo).filter(([, n]) => n && n > 0),
      ),
    },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    nextTeleportHeight: s.nextTeleportHeight,
    nextTeleportSpeed: s.nextTeleportSpeed,
    rocket: {
      installed: C.ROCKET_COMPONENT_IDS.slice(0, s.installed),
      nextComponent: C.ROCKET_COMPONENT_IDS[s.installed] ?? null,
    },
    scanner: scanner(s),
    notice: s.notice
      ? {
          hazard: s.notice.hazard,
          shown:
            s.notice.age >= C.NOTICE_DELAY &&
            s.notice.age <= C.NOTICE_DELAY + C.NOTICE_FADE,
        }
      : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
  };
}
export const debug = {
  version: C.DEEPCORE_DEBUG_VERSION,
  snapshot,
  tileAt,
  buildings: (_s: ReadState) => BUILDING_RECTS.map((b) => ({ ...b })),
  menuItemRect: menuRect,
  controlRect,
  findTile(s: ReadState, kind: C.TileKind) {
    member(kind, C.TILE_KINDS);
    const p = position(s);
    let best: { col: number; row: number } | null = null,
      distance = Infinity;
    for (let i = 0; i < s.grid.length; i++)
      if (s.grid[i].kind === kind) {
        const col = i % C.WORLD_COLS,
          row = Math.floor(i / C.WORLD_COLS),
          d = Math.hypot(col - p.col, row - p.row);
        if (d < distance) {
          distance = d;
          best = { col, row };
        }
      }
    return best;
  },
  reset: (s: ReadState) => {
    const n = initial(
      s.images as DeepcoreState["images"],
      s.systems as DeepcoreState["systems"],
    );
    n.muted = s.muted;
    n.hasSave = s.hasSave;
    return n;
  },
  reconcile: (s: ReadState) => copy(s),
  generateMine: (s: ReadState) =>
    pose(s, (n) => {
      n.grid = generate(n.coreRow);
    }),
  clearMine: (s: ReadState) =>
    pose(s, (n) => {
      const g = emptyMine(n.coreRow);
      for (let i = C.WORLD_COLS; i < n.coreRow * C.WORLD_COLS; i++)
        if (i % C.WORLD_COLS > 0 && i % C.WORLD_COLS < C.WORLD_COLS - 1)
          g[i].band = n.grid[i].band;
      n.grid = g;
    }),
  clearCargo: (s: ReadState) =>
    pose(s, (n) => {
      n.cargo = {};
    }),
  clearItems: (s: ReadState) =>
    pose(s, (n) => {
      for (const id of C.ITEM_IDS) n.items[id] = 0;
    }),
  setTile: (s: ReadState, col: number, row: number, kind: C.TileKind) => {
    member(kind, ["rock", "gas", "lava", "stone", "bedrock", "tunnel", "core"]);
    return tilePose(s, col, row, (n) => {
      n.grid[row * C.WORLD_COLS + col] = cell(
        kind,
        at(n, col, row).band ??
          (row < n.coreRow ? bandAt(row, n.coreRow) : null),
      );
    });
  },
  setOreTile: (s: ReadState, col: number, row: number, ore: C.OreId) => {
    member(ore, [...C.ORE_IDS, ...C.GEMSTONE_IDS]);
    return tilePose(s, col, row, (n) => {
      n.grid[row * C.WORLD_COLS + col] = {
        ...cell("ore", at(n, col, row).band ?? bandAt(row, n.coreRow)),
        ore,
      };
    });
  },
  setMaterialTile: (
    s: ReadState,
    col: number,
    row: number,
    material: C.MaterialId,
  ) => {
    member(material, C.MATERIALS);
    return tilePose(s, col, row, (n) => {
      n.grid[row * C.WORLD_COLS + col] = {
        ...cell("material", at(n, col, row).band ?? bandAt(row, n.coreRow)),
        material,
      };
    });
  },
  setTileHealth: (s: ReadState, col: number, row: number, health: number) =>
    tilePose(s, col, row, (n) => {
      const t = at(n, col, row);
      assert(minable(t.kind) && t.band !== null);
      number(health, Number.MIN_VALUE, C.BAND_HEALTH[t.band]);
      n.grid[row * C.WORLD_COLS + col] = { ...t, health };
    }),
  placeCoreSample: (s: ReadState, col: number, row: number) =>
    tilePose(s, col, row, (n) => {
      assert(n.coreTimer === null && at(n, col, row).kind === "tunnel");
      n.coreGround = { col, row };
      n.coreTimer = C.CORE_TIMER;
    }),
  setMinerPosition: (s: ReadState, x: number, y: number) => {
    number(x);
    number(y);
    return pose(s, (n) => {
      n.miner.x = x;
      n.miner.y = y;
    });
  },
  setMinerVelocity: (s: ReadState, vx: number, vy: number) => {
    number(vx);
    number(vy);
    return pose(s, (n) => {
      n.miner.vx = vx;
      n.miner.vy = vy;
    });
  },
  setFacing: (s: ReadState, facing: C.Facing) => {
    member(facing, C.FACINGS);
    return pose(s, (n) => {
      n.miner.facing = facing;
    });
  },
  setFuel: (s: ReadState, value: number) => {
    number(value, 0);
    return pose(s, (n) => {
      n.miner.fuel = value;
    });
  },
  setHull: (s: ReadState, value: number) => {
    number(value, 0);
    return pose(s, (n) => {
      n.miner.hull = value;
    });
  },
  setMinerTravel: (s: ReadState, enabled: boolean) => {
    assert(typeof enabled === "boolean");
    return pose(s, (n) => {
      n.miner.travel = enabled;
    });
  },
  setMinerDrill: (s: ReadState, enabled: boolean) => {
    assert(typeof enabled === "boolean");
    return pose(s, (n) => {
      n.miner.drill = enabled;
    });
  },
  setScreen: (s: ReadState, screen: C.ScreenName) => {
    member(screen, C.SCREENS);
    return pose(s, (n) => {
      n.screen = screen;
    });
  },
  setPanel: (s: ReadState, panel: C.PanelId | null) => {
    if (panel !== null) member(panel, C.PANELS);
    return pose(s, (n) => {
      n.panel = panel;
    });
  },
  setMenuIndex: (s: ReadState, index: number) => {
    integer(index, 0, menu(s).length - 1);
    return pose(s, (n) => {
      n.menuIndex = index;
    });
  },
  setMode: (s: ReadState, mode: C.Mode) => {
    member(mode, C.MODES);
    return pose(s, (n) => {
      n.mode = mode;
    });
  },
  setWorldSize: (s: ReadState, size: C.WorldSize) => {
    member(size, C.WORLD_SIZES);
    return pose(s, (n) => resize(n, size));
  },
  setCredits: (s: ReadState, value: number) => {
    number(value, 0);
    return pose(s, (n) => {
      n.credits = value;
    });
  },
  setTier: (s: ReadState, track: C.TrackName, tier: number) => {
    member(track, C.TRACKS);
    integer(tier, 1, C.MAX_TIER[track]);
    return pose(s, (n) => {
      n.tiers[track] = tier;
      n.miner.fuel = Math.min(n.miner.fuel, maxFuel(n));
      n.miner.hull = Math.min(n.miner.hull, maxHull(n));
    });
  },
  setCargo: (s: ReadState, ore: C.OreId, count: number) => {
    member(ore, [...C.ORE_IDS, ...C.GEMSTONE_IDS]);
    integer(count, 0);
    return pose(s, (n) => {
      if (count) n.cargo[ore] = count;
      else delete n.cargo[ore];
    });
  },
  setMaterial: (s: ReadState, material: C.MaterialId, count: number) => {
    member(material, C.MATERIALS);
    integer(count, 0);
    return pose(s, (n) => {
      n.satchel[material] = count;
    });
  },
  setCoreCarried: (s: ReadState, carried: boolean) => {
    assert(typeof carried === "boolean");
    if (carried) assert(s.coreTimer === null);
    return pose(s, (n) => {
      n.satchel.coreSample = carried;
      if (carried) n.coreTimer = C.CORE_TIMER;
      else if (n.satchel.coreSample !== s.satchel.coreSample)
        n.coreTimer = null;
    });
  },
  setCoreTimer: (s: ReadState, seconds: number) => {
    assert(s.coreTimer !== null);
    number(seconds, Number.MIN_VALUE);
    return pose(s, (n) => {
      n.coreTimer = seconds;
    });
  },
  setItemCount: (s: ReadState, item: C.ItemId, count: number) => {
    member(item, C.ITEM_IDS);
    integer(count, 0);
    return pose(s, (n) => {
      n.items[item] = count;
    });
  },
  setRocketInstalled: (s: ReadState, count: number) => {
    integer(count, 0, C.ROCKET_COMPONENT_IDS.length);
    return pose(s, (n) => {
      n.installed = count;
    });
  },
  setNoticeFired: (s: ReadState, hazard: C.NoticeHazard, fired: boolean) => {
    member(hazard, C.NOTICE_HAZARDS);
    assert(typeof fired === "boolean");
    return pose(s, (n) => {
      n.noticesFired[hazard] = fired;
    });
  },
  setCameraLead: (s: ReadState, lead: number) => {
    number(lead, -C.CAM_LEAD_MAX, C.CAM_LEAD_MAX);
    return pose(s, (n) => {
      n.camera.lead = lead;
    });
  },
  setElapsed: (s: ReadState, seconds: number) => {
    number(seconds, 0);
    return pose(s, (n) => {
      n.elapsedSeconds = seconds;
    });
  },
  clearSave: (s: ReadState) => pose(s, T.clearSave),
  setNextTeleportHeight: (s: ReadState, tiles: number | null) => {
    if (tiles !== null)
      number(tiles, C.TELEPORT_HEIGHT_TILES_MIN, C.TELEPORT_HEIGHT_TILES_MAX);
    return pose(s, (n) => {
      n.nextTeleportHeight = tiles;
    });
  },
  setNextTeleportSpeed: (s: ReadState, speed: number | null) => {
    if (speed !== null)
      number(speed, C.TELEPORT_SPEED_MIN, C.TELEPORT_SPEED_MAX);
    return pose(s, (n) => {
      n.nextTeleportSpeed = speed;
    });
  },
  dropOre: (s: ReadState, ore: C.OreId) => {
    member(ore, [...C.ORE_IDS, ...C.GEMSTONE_IDS]);
    return pose(s, (n) => T.dropOre(n, ore));
  },
  sell: (s: ReadState) => pose(s, T.sell),
  buyFuel: (s: ReadState) => pose(s, (n) => T.service(n, "fuel", false)),
  fillFuel: (s: ReadState) => pose(s, (n) => T.service(n, "fuel", true)),
  buyRepair: (s: ReadState) => pose(s, (n) => T.service(n, "hull", false)),
  repairFull: (s: ReadState) => pose(s, (n) => T.service(n, "hull", true)),
  buyUpgrade: (s: ReadState, track: C.TrackName) => {
    member(track, C.TRACKS);
    return pose(s, (n) => T.buyUpgrade(n, track));
  },
  buyItem: (s: ReadState, item: C.ItemId) => {
    member(item, C.ITEM_IDS);
    return pose(s, (n) => T.buyItem(n, item));
  },
  useItem: (s: ReadState, item: C.ItemId) => {
    member(item, C.ITEM_IDS);
    return pose(s, (n) => T.useItem(n, item));
  },
  jettison: (s: ReadState) => pose(s, T.jettison),
  fabricate: (s: ReadState) => pose(s, T.fabricate),
  launch: (s: ReadState) => pose(s, T.launch),
  save: (s: ReadState) => pose(s, T.save),
  dismissNotice: (s: ReadState) =>
    pose(s, (n) => {
      n.notice = null;
    }),
};
export type DeepcoreDebugApi = typeof debug;
