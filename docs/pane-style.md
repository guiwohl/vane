# Pane style

The house look of the side pane tabs. It is taken from the tabs the owner accepted: Overview, Agents, Context. A new tab copies them. The owner judges the look, not the tests.

## Frame (the shell owns it)

- The tab bar, the selected tab (filled with the `/color` accent, dark bold text) and the one blank row under the bar come from `tab-bar.tsx`. A tab never draws its own title chip or tab highlight.
- The shell adds one cell of left padding and passes `view.width` = `bodyColumns` minus that cell. Lay every row out to `view.width`. Add no padding of your own.

## Colours

- Take every colour from `paneInk()` (`pane-ink.ts`). It already holds the right colour for dark, light, ANSI and auto. No hex, no colour names, no `palette.*` keys read directly in a draw file, no `if (isDark)` colour choice.

| Role | Key |
| --- | --- |
| Headings, item names, primary values | `paneInk().text` |
| Secondary text, counts, hints, empty state | `paneInk().muted` |
| Rules, tree guides, spacer guides | `paneInk().rule` |
| Status and diff counts | `ok` (✓ ✔ `+N`), `failed` (✗ `-N`), `alert` (waiting) |
| Data series (mix bar, legend) | `paneInk().mix` / `paneInk().hues` |
| Empty meter cells | `paneInk().meterEmpty` (via `bar`) |

- `paneInk().section` (periwinkle) and the `/color` accent are not used in a tab body. `sectionLook` and `accentLook` belong to the chat, not the pane.
- `paneInk().tool` only colours tool names in Activity.

## Block headings

- White bold text with a thin rule to the right edge: `header(ui, "Title", paneHeaderLook(), view.width)`. In a light theme the same call draws black bold text. Never write your own heading row.
- One blank row (`<Box height={1} />`) before every heading except the first.
- A tab-wide title with a count under it is allowed when it mirrors an engine screen (MCP: "Manage MCP servers" bold `text`, "3 servers" `muted`). Context mirrors `/context`: bold title, ` · hint` in `muted`, no rule.

```
good                                      bad (first Skills tab)
User ──────────────────────────────       User ──────────────────   periwinkle heading
```

## Item rows

- One row per item, `height={1}`. Every `Text` has `wrap="truncate-end"` (paths: `truncate-start` or `clipStart`, so the file name stays). Nothing wraps to a second row.
- Secondary text sits on the same row in `muted`: after ` · ` (`main · opus 5.5`), or in a column. Use `paneRow` (prefix, `dot`, `label`, `middle`, `right`) before writing a row by hand.
- Columns: the name column is as wide as the longest name, clamped (Activity: 6 to 16 cells; MCP: longest name). The flexible part is `flexGrow={1} flexShrink={1} minWidth={0}` and truncates; fixed parts (counts, durations, `+N -N`) are `flexShrink={0}` and stay right-aligned at the edge.
- A status mark comes first, one cell: `statusDot(status)`, or ✔ / ○ in `ok` / `muted` as MCP does.
- A card (Agents) is the only multi-row item: a title row in `text`, then one to three `muted` detail rows indented under it, then a guide-only spacer row (`gapRow`). Use it only when the owner asked for cards.

```
good: one row, dim description on the same row
code-style     Use when writing or editing ANY code - f…
council        Use for a decision with several credibl…

bad: "полотно текста", a name row plus an indented description row
code-style
  Use when writing or editing ANY code - functions, cla…
council
  Use for a decision with several credible paths and n…
```

## Indentation

- 2 cells per level, never more. Trees use `treeGlyphs`, `guideUnder` and `guideBetween` (`├─ └─ │` in `rule`).
- Rows that belong to an item (MCP actions, Agents details) are indented 2 cells under it.

## Counts

- Always `${n} ${plural(noun, n)}`. Numbers via `formatTokens` and `formatDuration`.
- A per-item count goes in `muted`, right-aligned in its own fixed column (MCP "15 tools", Activity durations, Agents spend). Totals go in one summary row at the top, parts joined by ` · ` in `muted` (MCP "3 servers", the Overview summary line).
- Changes are `+N` in `ok` and `-N` in `failed`, never one colour.

## Click targets

- The whole name is the click target: `labelButton(ui, { key, label, onPress })`. It draws the name in the text colour in every theme, never dim. Never a name in `Text` plus a one-glyph `Button`.
- A command with its own word uses `button(ui, …)`, drawn `[ back ]`.
- Item actions (MCP `reconnect  disable`) are plain dim `Button`s, 2 cells apart, on one row indented 2 cells, shown only for the selected item.
- Draw functions never call `update`. Clicks go through callbacks in the view.

## Expand and collapse

- A foldable row starts with `▾` (open) or `▸` (folded) and is one `Button` with the name (MCP servers). A folded row shows its summed counts on the right.
- An open item shows its extra rows under it, indented 2 cells, in `muted`, one line each, truncated. Long text that needs more opens a detail view with `[ back ]` (Activity call details). Exception, an owner decision: an item whose text must open in full (a Skills description) shows it as `muted` rows, wrapped and indented 2 cells.

## Empty state

- One `muted` row in lowercase, no full stop: `no calls yet`, `idle`, `no subagents yet`, `no MCP servers`. Data not loaded yet: `no <thing> data yet`.
- Draw the headings that frame the empty part and leave out blocks that have nothing to show.

## Width

- Check at about 60 and about 120 columns. At 60 every row still fits on one line by truncation; at 120 the extra width goes to the flexible part and the rules reach the edge.
- A layout change by width happens at one named constant (Context: grid beside the summary from `SIDE_BY_SIDE_WIDTH = 60`, stacked below it).
- `paneRow` caps its parts: prefix half, label a third, right part a quarter of the width.

## Before you call a tab done

1. Live check (skill `live-check`): capture the new tab next to an accepted one (Overview or Agents) in the dark and light themes, with the default colour and after `/color red`, at about 60 and about 120 columns.
2. Put the screenshots side by side and compare: heading colour and weight, rule, blank rows, one row per item, dim secondary text, right column, indentation.
3. Look for a `38;2` code in an ANSI theme: a hardcoded colour leaked.
4. Show the screenshots to the owner. He judges the look; green tests do not make a tab done.
