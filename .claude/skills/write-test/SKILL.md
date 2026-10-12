---
name: write-test
description: Use when writing or changing a test for vane hooks or draw functions.
---

# Write a test

Tests run only with `claude plugin test .` (also part of `npm run check`). They run in a sandbox like the plugin's own: no file system, no network, no process.

## Layout and names

- One file per area: `tests/<area>.test.ts`, or `.test.tsx` when it mounts UI. Shared helpers for draw trees are in `tests/draw-tree.ts`.
- Import from `claude-code/testing`: `describe`, `expect`, `test`, `mock`. Types `Engine`, `Mounted` come from the same module.
- `describe("<area>")`, then tests named `<ID> <what the user sees>`, for example `M3 clicking a server selects it and shows its actions`. IDs are one letter and a number per file.
- Test body: `async ($, on) => { ... }`. `$` is the engine, `on` registers fake engine hooks.

## Build the fake world

Copy the `worldOf(on)` helper from the nearest test file, for example `tests/mcp-pane.test.tsx`. It:

- calls `mock.clock(on, { now })` and `mock.env(on, { HOME: "/h/u" })`;
- answers the engine events the code under test calls, such as `session.usage` and `ui.open`, with fixed data;
- returns a `world` object that records calls (commands run, usage fetches) for assertions.

## Mount and act

```
const pane = await $.ui.mount({ plugin: "vane", surface: "terminal", component: "Pane",
  requestId: "session", props: { title: "Session", isFocused: false, bodyColumns: 60,
  placement: "dock", scroll: { offset: 0, bodyRows: 40 }, view: {} },
  viewport: { columns: 60, rows: 40 } })
```

- Find: `pane.findAll({ type: "Button" })`, `pane.find({ type: "Text", text })`.
- Act: `pane.press({ key })`. Read the tree: `pane.drawn()`.
- Chat parts mount the same way with their own component name, see `tests/reply.test.tsx`.

## Assert

- Assert drawn text, theme keys from `palette`, and the keys written to state. Not private variables.
- Name numbers as constants at the top of the file.
- Pure helpers, such as `fitTabs`, are tested by calling them directly (`tests/tab-bar.test.ts`).
- A new behaviour needs a test that fails without it. Check by breaking the code once.
- No comments in tests.

`claude plugin test .` runs every test file. To run one file, copy the folder with only that file under `tests/`, or accept the full run: it is fast.
