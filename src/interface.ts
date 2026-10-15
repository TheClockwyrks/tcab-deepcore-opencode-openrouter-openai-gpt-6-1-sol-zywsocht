import * as C from "./constants";
import {
  type DeepcoreState,
  type ReadState,
  type Rect,
  BUILDING_RECTS,
  depth,
  maxFuel,
  maxHull,
  slots,
} from "./model";
import * as T from "./transactions";
import { start } from "./world";

export function menu(s: ReadState): readonly string[] {
  switch (s.screen) {
    case "title":
      return s.hasSave ? C.TITLE_ITEMS : C.TITLE_ITEMS.slice(1);
    case "mode-select":
      return C.MODE_ITEMS;
    case "size-select":
      return C.SIZE_ITEMS;
    case "how-to-play":
      return C.HOW_TO_PLAY_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "victory":
      return C.VICTORY_ITEMS;
    case "game-over":
      return s.mode === "standard" && s.hasSave
        ? C.GAME_OVER_SAVE_ITEMS
        : C.GAME_OVER_ITEMS;
    default:
      return [];
  }
}
export function menuRect(s: ReadState, index: number): Rect | null {
  if (index < 0 || index >= menu(s).length) return null;
  return {
    x: s.screen === "title" ? 92 : 380,
    y:
      (s.screen === "title" ? 382 : s.screen === "how-to-play" ? 610 : 350) +
      index * 64,
    w: s.screen === "title" ? 380 : 520,
    h: 52,
  };
}
export interface Control {
  id: string;
  subject: string | null;
  label: string;
  rect: Rect;
  enabled: boolean;
}
export function controls(s: ReadState): Control[] {
  if (s.screen !== "in-mine") return [];
  const a: Control[] = [];
  const add = (
    id: string,
    subject: string | null,
    label: string,
    x: number,
    y: number,
    w = 170,
    enabled = true,
  ) => a.push({ id, subject, label, rect: { x, y, w, h: 36 }, enabled });
  add("inventory", null, "[ I ]  CARGO", 1004, 10, 116);
  add("pause", null, "II", 1129, 10, 44);
  add("mute", null, s.muted ? "OFF" : "SND", 1182, 10, 64);
  if (s.notice && s.notice.age >= C.NOTICE_DELAY) {
    add("dismiss-notice", null, "", 48, 554, 690);
    a[a.length - 1].rect.h = 86;
  }
  if (!s.panel) return a;
  add("close", null, "ESC  /  CLOSE", 946, 116, 142);
  const x = 750;
  switch (s.panel) {
    case "fuel-depot":
      add(
        "buy-fuel",
        null,
        `+${C.FUEL_BUY_INCREMENT} FUEL`,
        x,
        236,
        260,
        s.credits > 0 && s.miner.fuel < maxFuel(s),
      );
      add(
        "fill-fuel",
        null,
        "FILL TANK",
        x,
        296,
        260,
        s.credits > 0 && s.miner.fuel < maxFuel(s),
      );
      add(
        "buy-repair",
        null,
        `+${C.REPAIR_BUY_INCREMENT} HULL`,
        x,
        396,
        260,
        s.credits > 0 && s.miner.hull < maxHull(s),
      );
      add(
        "repair-full",
        null,
        "FULL REPAIR",
        x,
        456,
        260,
        s.credits > 0 && s.miner.hull < maxHull(s),
      );
      break;
    case "ore-market":
      add("sell", null, C.SELL, x, 554, 260, slots(s) > 0);
      break;
    case "upgrade-shop":
      C.TRACKS.forEach((t, i) =>
        add(
          "buy-upgrade",
          t,
          s.tiers[t] >= C.MAX_TIER[t]
            ? "MAX"
            : `${C.UPGRADE_PRICES[s.tiers[t] - 1]} Cr`,
          870,
          203 + i * 53,
          160,
          s.tiers[t] < C.MAX_TIER[t] &&
            s.credits >= C.UPGRADE_PRICES[s.tiers[t] - 1],
        ),
      );
      break;
    case "supply-depot":
      C.ITEMS.forEach((t, i) =>
        add(
          "buy-item",
          t.id,
          `${t.price.toLocaleString()} Cr`,
          870,
          208 + i * 60,
          160,
          s.credits >= t.price,
        ),
      );
      break;
    case "launch-pad":
      if (s.installed === C.ROCKET_COMPONENTS.length)
        add("launch", null, C.LAUNCH, x, 554, 260);
      else add("fabricate", null, C.FABRICATE, x, 554, 260, T.canFabricate(s));
      break;
    case "inventory": {
      const ores = C.MINERALS.filter((m) => (s.cargo[m.id] ?? 0) > 0);
      ores.forEach((m, i) => {
        add("drop-ore", m.id, "− DROP", 590, 200 + i * 29, 90);
        a[a.length - 1].rect.h = 25;
      });
      C.ITEMS.forEach((t, i) =>
        add(
          "use-item",
          t.id,
          C.USE,
          965,
          240 + i * 43,
          72,
          s.items[t.id] > 0 &&
            (t.id !== "nanobots" || s.miner.hull < maxHull(s)) &&
            (t.id !== "emergency-fuel" || s.miner.fuel < maxFuel(s)),
        ),
      );
      if (s.satchel.coreSample)
        add("jettison", null, C.JETTISON, 760, 544, 265);
      break;
    }
  }
  return a;
}
export function controlRect(
  s: ReadState,
  id: string,
  subject: string | null,
): Rect | null {
  return (
    controls(s).find((c) => c.id === id && c.subject === subject)?.rect ?? null
  );
}
export function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
export function action(
  s: DeepcoreState,
  id: string,
  subject: string | null,
): void {
  switch (id) {
    case "inventory":
      s.panel = s.panel === "inventory" ? null : "inventory";
      break;
    case "pause":
      s.screen = "paused";
      s.menuIndex = 0;
      break;
    case "close":
      s.panel = null;
      break;
    case "sell":
      T.sell(s);
      break;
    case "buy-fuel":
      T.service(s, "fuel", false);
      break;
    case "fill-fuel":
      T.service(s, "fuel", true);
      break;
    case "buy-repair":
      T.service(s, "hull", false);
      break;
    case "repair-full":
      T.service(s, "hull", true);
      break;
    case "buy-upgrade":
      T.buyUpgrade(s, subject as C.TrackName);
      break;
    case "buy-item":
      T.buyItem(s, subject as C.ItemId);
      break;
    case "use-item":
      T.useItem(s, subject as C.ItemId);
      break;
    case "drop-ore":
      T.dropOre(s, subject as C.OreId);
      break;
    case "jettison":
      T.jettison(s);
      break;
    case "fabricate":
      T.fabricate(s);
      break;
    case "launch":
      T.launch(s);
      break;
    case "dismiss-notice":
      s.notice = null;
      break;
  }
}
export function choose(s: DeepcoreState): DeepcoreState {
  const item = menu(s)[s.menuIndex];
  if (item === "CONTINUE" || item === "CONTINUE FROM SAVE") return T.restore(s);
  if (item === "PLAY AGAIN" || item === "RESTART") return start(s);
  if (item === "NEW EXPEDITION") {
    s.screen = "mode-select";
    s.menuIndex = 0;
  } else if (item === "HOW TO PLAY") {
    s.screen = "how-to-play";
    s.menuIndex = 0;
  } else if (s.screen === "mode-select" && item !== "BACK") {
    s.mode = C.MODES[s.menuIndex];
    s.screen = "size-select";
    s.menuIndex = 0;
  } else if (s.screen === "size-select" && item !== "BACK") {
    s.worldSize = C.WORLD_SIZES[s.menuIndex];
    return start(s);
  } else if (item === "RESUME") {
    s.screen = "in-mine";
    s.menuIndex = 0;
  } else if (item === "BACK") back(s);
  else if (item === "MENU" || item === "QUIT TO MENU") {
    s.screen = "title";
    s.panel = null;
    s.menuIndex = s.hasSave ? 1 : 0;
  }
  return s;
}
export function back(s: DeepcoreState): void {
  if (s.screen === "paused") {
    s.screen = "in-mine";
    s.menuIndex = 0;
  } else if (s.screen === "size-select") {
    s.screen = "mode-select";
    s.menuIndex = C.MODES.indexOf(s.mode);
  } else {
    const how = s.screen === "how-to-play";
    s.screen = "title";
    s.menuIndex = (s.hasSave ? 1 : 0) + (how ? 1 : 0);
  }
}
export function activateBuilding(s: DeepcoreState, id?: C.BuildingId): void {
  if (depth(s) > 1 || Math.abs(s.miner.y + C.MINER_H - C.SURFACE_Y) > 2) return;
  const b = BUILDING_RECTS.find(
    (b) =>
      (!id || b.id === id) &&
      s.miner.x + C.MINER_W / 2 >= b.x &&
      s.miner.x + C.MINER_W / 2 <= b.x + b.w,
  );
  if (!b) return;
  if (b.id === "save-pad") T.save(s);
  else s.panel = b.id;
}
