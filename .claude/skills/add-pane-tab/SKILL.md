---
name: add-pane-tab
description: Use when adding a tab to the vane side pane, or changing which data a tab loads.
---

# Add a pane tab

Read `docs/architecture.md` (Side pane) and `docs/engine-limits.md` first. Use `hooks/context-tab.tsx` with `hooks/context-draw.tsx`, and `hooks/mcp-tab.tsx` with `hooks/mcp-draw.tsx`, as models.

1. Create a Backlog.md task for the tab (see `AGENTS.md`).
2. Find the data source before you plan. Search `.claude-plugin/types/claude-code/index.d.ts` for the noun you need. Do not guess `$` methods: for example there is no `$.skill.list`. The session usage breakdown carries `skillFrontmatter` (see `ContextSkill`) and is fetched by the Context tab.
3. If the tab keeps new state, add its keys under `PluginState.vane` in `types/index.d.ts`. Do not import anything there. The tab id is a plain string, so there is no tab type to extend.
4. Write the body in `hooks/<name>-draw.tsx`:
   - Export a view type, for example `SkillsView`, and a function `<name>Tab(ui: Ui, view: <Name>View): RenderElement`.
   - Take `Box`, `Text` and `Button` from `ui`. Use `paneRow` and the helpers from `pane-kit.tsx`. Colours are theme keys from `palette.ts` only.
   - Keep it a pure function of its view. No `$`, no reads.
   - Follow `docs/pane-style.md` for headings, rows, spacing, colours and widths.
5. Write `hooks/<name>-tab.tsx`. It exports two things:
   - `<NAME>_TAB = { id: "<name>", label: "<Label>" }`.
   - `register<Name>Tab(on: On)`. It registers a `ui.render` hook for `{ component: "Pane", requestId: tabRequestId(<NAME>_TAB.id) }` (from `pane-tab.ts`). The hook reads the data, calls `<name>Tab($.ui.resolve(e), view)` and returns the result. The shell has already set `e.props.bodyColumns`.
   - Declare the tab's own atoms in this file. The loader does not accept an atom or `$` that comes from another file. See `docs/engine-limits.md`.
6. Add the tab to `hooks/tabs.ts`: one entry in `TABS` (its order is the order on screen) and one `register<Name>Tab(on)` call in `registerTabs`. Do not touch `session-pane.tsx` or `register.ts`. Two lines are needed because `on` cannot go through a list.
7. Data:
   - From events: write `hooks/<name>-track.ts` that exports `track<Name>(on: On)`, declare its atoms there, and call it from `hooks/register.ts`.
   - From `$.session` or `$.fs`: fetch it in the tab's render hook. Pass `$.session.usage` as a closure, as `breakdown.ts` does.
   - Work that must start when the tab opens: call `justEntered(<NAME>_TAB.id)` from `shown-tab.ts` in the render hook. Use `isShownTab` to skip work while the tab is hidden.
8. A click that must change state: pass a callback in the view (`select: (x) => void update(...)`) as the MCP tab does. Draw functions never call `update`.
9. Write `tests/<name>-pane.test.tsx` with skill `write-test`. Cover: the tab opens with its title, an empty state, one populated state, each button.
10. Run `npm run check` and `claude plugin validate .`. Then use skill `live-check` and look at the tab in a real session at 60 and 120 columns.
11. Update the tab list in `README.md` if it names the tabs, in `.claude-plugin/plugin.json` (description), and in `docs/architecture.md`.
