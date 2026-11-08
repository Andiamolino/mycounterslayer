# Counter Slayer

> **This is a fork** of [Counter Slayer](https://github.com/Siege-Perilous/counterslayer) by [Dave Snider](https://davesnider.com) (Siege Perilous LLC). The license stays the same ([FSL-1.1-ALv2](LICENSE.md)) and the copyright of the original author is kept. All credit for the original application goes to him.

Counter Slayer is a small Svelte / JSCad application to help you build box and tray inserts for your war games. It generates clean STLs and even references which counters go where in a PDF you can include with your game. Try it out at [counterslayer.com](https://counteslayer.com).

![Screenshot](https://github.com/Siege-Perilous/counterslayer/blob/main/screenshot.png)

## Credits

[Dave Snider](https://davesnider.com) designs and builds Counter Slayer. You might also enjoy [Table Slayer](https://tableslayer.com), a tool to create animated battle maps for in person RPG games.

## Features

- Layout individual trays with stacks of counters.
- Layout stacks as top-loading, edge-crosswise, or edge-lengthwize across a tray.
- Counters can be custom sized in hex, square, rectangle, circle and triangles.
- Add playing card trays that support custom sized cards.
- Generate boxes for groups of trays with "snap to close" lids.
- Optional honeycomb pattern for boxes to save on filament.
- Bin-packing autosorts for the counters and trays so you don't need to think too much about layouts.
- Export and import single counters, card sizes, standees, trays, boxes and layers as files to reuse them across projects.
- Generate a PDF reference diagram to let you know which counters go in which stack.
- Tile trays hold flat tiles standing at an angle, without a foot.
- Export printable STLs with built in tolerances to make sure everything fits together well.

## What's new in this fork (since 2026-11-06)

- **Project name:** projects have a name, shown in the header and browser tab. It pre-fills the file name when exporting the project JSON and names the STL ZIP, 3MF and PDF downloads.
- **Part library:** export single parts to a file and import them into any other project: counters, card sizes, standees, tiles, trays, boxes and whole layers. Dependencies come along, identical definitions are reused, and a preview dialog shows what will be added.
- **Game box height:** an optional height for the game container, with the height of each layer, the total, and a status ("too tall by X mm" / "X mm free"). An optional **lid lift** says how far the lid may rise above the box and is reported in its own status.
- **Lid thickness:** each box has its own lid thickness (default 2 mm). Lid, box and layer heights now come from one calculation that matches the printed geometry.
- **Tile trays:** one row of flat tiles or cards without a foot, leaning at an angle to the floor and held by two slotted bars. Tiles are defined in their own TILES section.
- **Standee trays:** now always use the alternating layout (two slotted walls); the one-sided layout moved to tile trays.
- **Delete protection:** counters, card sizes, standees and tiles that are still in use cannot be deleted; a message lists where they are used.
- **Decimal comma:** all number fields accept "2,5" as well as "2.5".

See the in-app changelog for details.

## Work in progress

- Stacking (trays and boxes)
- Placeholders (board, rulebook, player boards)
- Custom counter shapes

## Development

Counter Slayer uses typical Node / Svelte tooling with `pnpm`. Run `pnpm install`, then `pnpm run dev` or `pnpm run build` to start working. Run `pnpm run test:unit` for the unit tests (vitest).

### Claude Code Integration

This project includes tooling for [Claude Code](https://github.com/anthropics/claude-code) to help with geometry debugging. See [CLAUDE.md](https://github.com/Siege-Perilous/counterslayer/blob/main/CLAUDE.md) for details.

**Auto-save**: In dev mode, clicking "Regenerate" automatically saves `project.json` with computed layout positions to `mesh-analysis/`.

**Full export**: Click "Import / Export" → "Debug for Claude" to export STLs, screenshots, and layout data.

**View capture**: Use Playwright to capture views at different angles:

```bash
npx tsx scripts/capture-view.ts --angle iso
```

The app also includes a TinkerCAD-style ViewCube for quick camera navigation.

## License & open source contributions

Counter Slayer is available under a functional source [license](LICENSE.md) that becomes Apache 2 after two years. You are free to host and modify Counter Slayer on your own as long as you don't try to monetize it. The primary intention of the source being open is so hobbyists can get familiar with a large Svelte codebase. We welcome PRs and bug reports.

Any STL models you generate with Counter Slayer are yours to do with as you wish, and can be hosted or sold without permission.

## Share your projects with others

Feel free to create a PR to contribute code changes or add a new game to the pre-built trays. You can find these in [`static/projects`](https://github.com/Siege-Perilous/counterslayer/tree/main/static/projects).
