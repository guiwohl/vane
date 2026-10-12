# vane

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Claude Code 2.1.289+](https://img.shields.io/badge/Claude%20Code-2.1.289%2B-orange.svg)

vane is a Claude Code mod (plugin) that adds a side pane with Overview, Agents, Context, Setup and Spend tabs, a status line above the prompt, a restyled chat, terminal Mermaid diagrams, tables, code panels and diff panels. Colours follow your session `/color` and `/theme`.

vane is a personal fork of [markneonin/paneline](https://github.com/markneonin/paneline) (MIT, Copyright (c) 2026 Mark). What differs from upstream:

- The pane has five tabs: Overview, Agents, Context, Setup, Spend. There is no Files tab, and MCP servers, skills and commands are collapsible sections inside Setup, closed every time the tab opens.
- Overview has sparkline trend charts, gauges and a live "Now" block. Context has a vertical stacked bar with a legend.
- A command's `Details` button opens a call-detail overlay; Esc leaves it.
- The Agents tab lists only the agents running now.
- `hooks/reread-guard.ts` suppresses a re-delivered identical Read result by hashing the delivered content. The transcript keeps the real text.
- `/session` and `/hud` both toggle the pane.
- Install, update and remove go through `install.sh`.

## Install, update and remove (this fork)

On Claude Code 2.1.275 or later, one line installs it:

```
/plugin install vane --marketplace guiwohl/vane
```

That is the whole install, and Claude Code owns the checkout. Use the installer below instead when you want the checkout at a path you know, `~/.claude/mods/vane`, so you can edit the files and reload.

It installs globally and touches no project. The installer only writes inside `~/.claude`: it clones the repo to `~/.claude/mods/vane` and adds two entries to `~/.claude/settings.json`. It never reads or writes a project's `.claude`, and it behaves the same from any directory.

```
git clone https://github.com/guiwohl/vane.git ~/.claude/mods/vane
~/.claude/mods/vane/install.sh install
```

Or fetch and read the script first, then run it:

```
curl -fsSLO https://raw.githubusercontent.com/guiwohl/vane/main/install.sh
less install.sh
bash install.sh install
```

Then run `/reload-plugins` in Claude Code, or restart it.

| Command              | What it does                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install.sh install` | Clones the repo (if it is not there yet) and enables the plugin. Safe to run again; it never touches a checkout that already exists.                    |
| `install.sh update`  | Fast-forwards the checkout from `origin`. It refuses, and tells you what to run, if the checkout has uncommitted changes or has diverged from `origin`. |
| `install.sh remove`  | Disables the plugin and deletes the checkout, after asking. Local modifications in the checkout go with it.                                             |

Add `--dry-run` to any of them to print what would happen without changing anything.

The plugin loads in place from the checkout, so an update is a `git pull` plus `/reload-plugins`, with no build step. Edit the files under `~/.claude/mods/vane` and reload to see your changes.

Before it writes `settings.json` the installer saves a timestamped copy beside it (`settings.json.bak-<time>`) and prints the path. It edits the file as JSON with `jq`, or `python3` if `jq` is missing, keeps every other key as it was, and replaces the file atomically. With neither tool installed it stops before changing anything.

Needs `git`, `bash` 3.2 or newer, Linux or macOS, and Claude Code 2.1.289+ with a terminal at least 110 columns wide. Do not run it as root.

## How it looks

### Status row

![Status row](docs/screenshots/statusrow.png)

### Chat

![Chat layout](docs/screenshots/chat.png)

### Tables, alerts and code panels

![Tables, alerts and a code panel](docs/screenshots/visuals.png)

### Mermaid diagram

![Mermaid diagram in the terminal](docs/screenshots/diagram.png)

### Edit diff panel

![Edit diff panel](docs/screenshots/diff.png)

### Write panel

![Write panel](docs/screenshots/write.png)

### The tabs

The pane has five tabs.

**Overview** (id `activity`) draws gauges for the context window and the 5-hour and 7-day limits, sparklines of tokens, cost and turns over the session, the tool mix, and a live block listing the calls and agents running now with the last failures. Tokens scale against the context window; cost and turns against their own maximum. A chart needs 16 collected points before it draws. `clear` empties the tool mix and the sparklines.

**Agents** lists only the agents running now, with a sticky header that keeps the back button in view. An agent that stops while open returns you to the list.

**Context** draws one vertical stacked bar for the window with a legend beside it naming what consumed each part. A category too small for a bar row keeps its real number in the legend.

**Setup** holds three collapsible sections — Skills, Commands, MCPs — closed every time the tab opens, each line prefixed by its use count and suffixed `(Project)` or `(Global)`, sorted by type.

**Spend** splits the session cost by agent and shows the biggest tool results.

Captures of the reshaped pane are not in the repository yet. Upstream's pane screenshots were removed rather than reused, because they show a tab bar this fork no longer has.

## What it runs and reads

vane works only on your machine. It sends nothing over the network and asks for no keys or tokens.

- **Programs it starts:** exactly two, both read-only. `git -C <dir> rev-parse --show-toplevel --abbrev-ref HEAD` in the folders of the session and its subagents, for the branch and worktree on agent cards; `grep -a` on the session transcript, to find the colour set with `/color`.
- **Files it reads:** `~/.claude.json` and the project `.mcp.json` for the Setup tab's MCPs section; `SKILL.md` and command files of your skills and `~/.claude/plugins/installed_plugins.json` for its Skills section and the command folders for its Commands section; the session transcript, only through the `grep` above.
- **Slash commands it runs:** `/mcp enable <server>` or `/mcp disable <server>`, only when you press that button in the MCPs section of the Setup tab.
- **Events it watches:** tool calls, prompts, subagent starts and stops, `/color`, `/theme` and `/config` changes. It passes every event on unchanged, bar the one case below, and never answers a permission prompt.
- **What it changes for the model:** one thing. `hooks/reread-guard.ts` replaces the result of a `Read` the model has already received identically, through `PostToolUse`'s `updatedToolOutput`, with a short note saying so. It hashes the delivered content, so a file edited between reads is never suppressed. The transcript keeps the real text, and no other tool result is touched.
- **What it stores:** its own state in Claude Code's plugin store on this machine.
- **Commands it adds:** `/session` and `/hud` toggle the pane.
- `hooks/vendor/mermaid-text.js` is a build of [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) (MIT) that draws Mermaid diagrams as text.

## Other ways to run

- In the fullscreen layout the pane docks beside the chat from 110 columns. In the main-screen layout (the default under tmux, or with `CLAUDE_CODE_NO_FLICKER=0`) it opens inline above the prompt at any width.
- The pane opens when a session starts. Run `/session` or `/hud` to open it again after you close it.
- Node.js, only if you want to run the checks (see Development).

To run from a clone instead, pass the folder with `--plugin-dir` for one session:

```sh
git clone https://github.com/guiwohl/vane
```

```sh
claude --plugin-dir /path/to/vane
```

To load it every time, put these in your shell profile instead:

```sh
export CLAUDE_CODE_PLUGIN_DIRS=/path/to/vane
```

The plugin id is `vane`. It has one option, `probe`, which writes render times to the debug log. It is off by default.

## Development

```sh
npm install
npm run check
```

Scripts:

- `npm run lint`: ESLint with the strict type-checked typescript-eslint rules.
- `npm run format` and `npm run format:check`: Prettier, write or verify.
- `npm run typecheck`: `tsc -p .`.
- `npm test`: `claude plugin test .`.
- `npm run check`: all four.

`claude plugin validate .` checks the manifest.

Notes:

- The hooks are TypeScript in `hooks/`. Tests are in `tests/`.
- The pre-commit hook (husky and lint-staged) lints and format-checks staged files, then type-checks.
- `typecheck` and `lint` need the plugin type definitions in `.claude-plugin/types/`. Claude Code generates them on your machine and git ignores them, so a clean checkout or CI cannot run these two checks.
- `claude plugin test` has no coverage option, so there is no coverage report.
- The code has no comments. Names and tests have to explain it.

## License

[MIT](LICENSE) (c) 2026 Mark, (c) 2026 Guilherme Wohl. The Mermaid renderer in `hooks/vendor/` is third-party code, see [THIRD_PARTY_NOTICES.md](hooks/vendor/THIRD_PARTY_NOTICES.md).
