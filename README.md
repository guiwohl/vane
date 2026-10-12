# vane

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Claude Code 2.1.289+](https://img.shields.io/badge/Claude%20Code-2.1.289%2B-orange.svg)

A Claude Code mod: a side pane, a status line above the prompt, and a restyled chat. Colours follow your session `/color` and `/theme`.

A personal fork of [markneonin/paneline](https://github.com/markneonin/paneline) (MIT, Copyright (c) 2026 Mark).

## Installing

On Claude Code 2.1.275 or later, one line:

```
/plugin install vane --marketplace guiwohl/vane
```

Or use the installer, which puts the checkout at a path you can edit and reload:

```
git clone https://github.com/guiwohl/vane.git ~/.claude/mods/vane
~/.claude/mods/vane/install.sh install
```

Then `/reload-plugins`, or restart Claude Code.

Needs `git`, `bash` 3.2 or newer, Linux or macOS, and Claude Code 2.1.289+.

## What it does

- **Overview** — context and rate-limit gauges, sparklines of tokens, cost and turns, the tool mix, and a live `Now` block with what is running and the last failures.
- **Agents** — the subagents running now, as a tree.
- **Context** — a stacked bar of the window, with a legend naming what filled each part.
- **Setup** — Skills, Commands and MCPs as collapsible sections, each line with its use count.
- **Spend** — the session cost split by agent, and the biggest tool results.
- **Chat** — Mermaid diagrams, tables, alerts, code panels and diff panels, drawn in the terminal.
- **Details** — a tool group's `Details` button opens that call in the pane; Esc leaves it.
- **Commands** — `/session` and `/hud` toggle the pane.

## Screenshots

![Status row](docs/screenshots/statusrow.png)
_The status row above the prompt._

![Chat layout](docs/screenshots/chat.png)
_The restyled chat._

![Tables, alerts and a code panel](docs/screenshots/visuals.png)
_Tables, alerts and code panels._

![Mermaid diagram in the terminal](docs/screenshots/diagram.png)
_A Mermaid diagram, drawn as text._

![Edit diff panel](docs/screenshots/diff.png)
_An `Edit` diff panel._

![Write panel](docs/screenshots/write.png)
_A `Write` panel._

Captures of the reshaped pane itself are not in the repository yet. Upstream's were removed rather than reused, because they show a tab bar this fork no longer has.

## Details

**What it runs and reads.** It works only on your machine and sends nothing over the network. It starts two read-only programs — `git rev-parse` for the branch on agent cards, and `grep` on the transcript to find your `/color` — and reads your skill, command and MCP files.

**What it changes for the model.** One thing: `hooks/reread-guard.ts` replaces a `Read` result the model has already received identically with a short note saying so, matched by hashing the delivered content. The transcript keeps the real text, and no other tool result is touched.

**The installer.** `install.sh` also takes `update` (fast-forwards the checkout, refusing if it is dirty or diverged) and `remove` (asks, then disables the plugin and deletes the checkout). `--dry-run` prints what any of them would do. It installs globally and touches no project: it writes only inside `~/.claude`, backs up `settings.json` with a timestamp before editing it as JSON, and replaces it atomically.

**Where the pane sits.** It docks beside the chat from 110 columns; narrower, or under tmux, it opens inline above the prompt.

**Hacking on it.** The hooks are TypeScript in `hooks/`, tests in `tests/`, and `npm run check` runs lint, format, types and tests. That needs the plugin type definitions in `.claude-plugin/types/`, which Claude Code generates on your machine and git ignores — a clean checkout cannot run the two type-aware checks.

## License

[MIT](LICENSE) (c) 2026 Mark, (c) 2026 Guilherme Wohl. The Mermaid renderer in `hooks/vendor/` is a build of [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) (MIT); see [THIRD_PARTY_NOTICES.md](hooks/vendor/THIRD_PARTY_NOTICES.md).
