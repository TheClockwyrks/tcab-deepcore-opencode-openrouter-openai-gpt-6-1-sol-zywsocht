# Deepcore

**Depth is cheap. Height is expensive.**

A lone prospector, a derelict outpost, and an entire planet between you and a way
home. Drill through four strata, haul mineral veins back on your jetpack, and turn
the proceeds into a five-component escape rocket. Cargo has weight. Fuel does not
refill itself. The last component needs a sample from the molten Core—and that
sample only stays stable for ninety seconds.

## Play locally

Requires Node.js 22.12+ (or a newer supported Node release).

```sh
npm ci
npm run dev
```

Open the URL Vite prints. Select Standard or Hardcore, then Quick (1,250 m),
Standard (2,500 m), or Marathon (5,000 m). A keyboard drives the miner; menus,
shops, and inventory also accept mouse, pen, or touch.

## Controls

| Keys | Action |
| --- | --- |
| A / D or ← / → | Walk; drill a wall when grounded and flush against it |
| S or ↓ | Drill down |
| W / ↑ / Space | Fire the jetpack |
| E / Enter | Use a surface building; confirm a menu choice |
| I | Open / close cargo and supplies |
| 1–6 | Use the corresponding field supply |
| J | Jettison a carried Core Sample |
| Escape / P | Close a panel, pause, or resume |
| M | Mute / unmute |
| Backtick | Toggle the engine's diagnostic overlay |

Sell at the Ore Market, purchase fuel and hull repair at the Fuel Depot, improve
seven equipment tracks, and assemble your rocket at the Launch Pad. Save at the
Save Pad: Standard allows restoring a saved expedition; a Hardcore death deletes
the slot. Browser storage is optional. A live Core Sample cannot be saved.

## Production build

```sh
npm ci
npm run build
npm run preview
```

`dist/index.html` is the static entry point. Serve all of `dist/` from any static
host, including a subdirectory. All bundled asset requests are page-relative.
There is no server component, network service, or account.

The build bundles the original, committed assets in `assets/`. It never runs an
asset-generation binary. `assets/author.py` and `assets/author-effects.py` document
the one-time art, animation, particle, sound, and music authoring; they are not
needed to install, build, or play.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The simulation is render-independent and advances at 120 fixed steps per second.
Tests drive the actual Simple 2D engine over a native canvas with a counted clock
and dispatched input. The engine owns input, audio, loading, diagnostics, and the
frame loop. The game owns immutable state transitions, world generation,
collision, mining, economics, camera, and presentation.

`game.initialize` returns the required debug API next to its state. Automation
uses `engine.apply(s => engine.debug.setFuel(s, 40))` and
`engine.debug.snapshot(engine.state)`; no debug handle is installed on the page.

## Showcase

`showcase/` contains a player-facing description, screenshots, and a compressed
recording captured with the engine's own draw-command recorder. To recapture it
while the development server is running, use `node tools/capture.mjs`.
