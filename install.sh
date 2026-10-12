#!/usr/bin/env bash
# Global installer for a Claude Code mod that lives at ~/.claude/mods/<name>.
# Needs bash 3.2+ (macOS default). Non-POSIX features used: [[ ]], local, $(( )),
# ${var##pat}, ${var%pat}, `read -d ''`. No associative arrays, no ${var^^}, no mapfile.
set -euo pipefail

# ---- configuration: set once, before publishing --------------------------
REPO_SLUG="guiwohl/vane"
REPO_URL="${VANE_REPO_URL:-https://github.com/${REPO_SLUG}.git}"
# Must equal "name" in .claude-plugin/marketplace.json and the plugin's own name.
NAME="vane"
# ---------------------------------------------------------------------------

DRY_RUN=0
ASSUME_YES=0
ACTION=""
TMP_PATHS=""

say() { printf '%s\n' "$*"; }
note() { if [ "$DRY_RUN" -eq 1 ]; then printf '[dry-run] would: %s\n' "$*"; else printf '%s\n' "$*"; fi; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

cleanup() {
  local p
  for p in $TMP_PATHS; do rm -f -- "$p"; done
}
trap cleanup EXIT

usage() {
  cat <<EOF
Usage: install.sh [--dry-run] [--yes] <install|update|remove>

  install   clone ${REPO_SLUG} to ~/.claude/mods/${NAME} and enable it in ~/.claude/settings.json
  update    fast-forward the checkout from origin; refuses on local changes or divergence
  remove    disable it in ~/.claude/settings.json and delete the checkout (asks first)

  --dry-run   print every action, change nothing
  --yes       skip the confirmation prompt of 'remove'

Only ~/.claude and the checkout are touched, never a project, from any directory.
EOF
}

parse_args() {
  local a
  for a in "$@"; do
    case "$a" in
      --dry-run) DRY_RUN=1 ;;
      --yes|-y) ASSUME_YES=1 ;;
      -h|--help) usage; exit 0 ;;
      install|update|remove)
        [ -z "$ACTION" ] || die "give exactly one of install, update, remove"
        ACTION=$a ;;
      *) usage >&2; die "unknown argument: $a" ;;
    esac
  done
  [ -n "$ACTION" ] || { usage >&2; exit 2; }
}

# ---- environment ----------------------------------------------------------

setup_paths() {
  [ "$(id -u)" -ne 0 ] || die "refusing to run as root: this edits one user's global Claude Code settings"
  [ -n "${HOME:-}" ] || die "HOME is not set"
  # VANE_CLAUDE_DIR exists so the script can be exercised against a copy of the settings.
  CLAUDE_DIR="${VANE_CLAUDE_DIR:-$HOME/.claude}"
  case "$CLAUDE_DIR" in /*) ;; *) die "VANE_CLAUDE_DIR must be an absolute path" ;; esac
  case "$NAME" in
    ""|.|..|*[!A-Za-z0-9._-]*) die "invalid NAME '$NAME' in the script header" ;;
  esac
  [ -d "$CLAUDE_DIR" ] || die "$CLAUDE_DIR does not exist: Claude Code has not run on this machine yet"
  SETTINGS="$CLAUDE_DIR/settings.json"
  MODS_DIR="$CLAUDE_DIR/mods"
  CHECKOUT="$MODS_DIR/$NAME"
  MK_KEY="$NAME"
  PLUGIN_KEY="$NAME@$NAME"
  unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR
  # Nothing below may depend on the caller's directory.
  cd /
}

need_tools() {
  command -v git >/dev/null 2>&1 || die "git is required and was not found on PATH. Nothing was changed."
  if command -v jq >/dev/null 2>&1; then
    JSON_TOOL=jq
  elif command -v python3 >/dev/null 2>&1; then
    JSON_TOOL=python3
  else
    die "need jq or python3 to edit settings.json safely, and found neither on PATH. Install one and rerun. Nothing was changed."
  fi
}

resolve_link() {
  local p=$1 t
  while [ -L "$p" ]; do
    t=$(readlink "$p")
    case "$t" in /*) p=$t ;; *) p="$(dirname "$p")/$t" ;; esac
  done
  printf '%s\n' "$p"
}

# ---- JSON layer: the only place settings.json is parsed or written -------

read -r -d '' PY_HELPER <<'PY' || true
import json, sys
op, name, key = sys.argv[1:4]
args = sys.argv[4:]

def load(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("top level is not a JSON object")
    return data

def section(data, k):
    v = data.get(k)
    if v is None:
        return {}
    if not isinstance(v, dict):
        raise ValueError(k + " is not a JSON object")
    return v

def ensure(data, k):
    sec = section(data, k)
    return data.setdefault(k, sec) if k not in data or data[k] is None else sec

def drop(data, k, entry):
    sec = section(data, k)
    if entry in sec:
        del sec[entry]
    if k in data and not sec:
        del data[k]

def emit(data):
    sys.stdout.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

try:
    d = load(args[0])
    if op == "valid":
        pass
    elif op == "mkinfo":
        e = section(d, "extraKnownMarketplaces").get(name)
        if e is not None:
            s = e.get("source") if isinstance(e, dict) else None
            s = s if isinstance(s, dict) else {}
            print("%s|%s" % (s.get("source", ""), s.get("path", "")))
    elif op == "enabled":
        e = section(d, "enabledPlugins")
        if key in e:
            print(json.dumps(e[key]))
    elif op == "install":
        d["extraKnownMarketplaces"] = ensure(d, "extraKnownMarketplaces")
        entry = d["extraKnownMarketplaces"].setdefault(name, {})
        if not isinstance(entry, dict):
            raise ValueError("existing marketplace entry is not an object")
        entry["source"] = {"source": "directory", "path": args[1]}
        d["enabledPlugins"] = ensure(d, "enabledPlugins")
        d["enabledPlugins"][key] = True
        emit(d)
    elif op == "remove":
        if args[1] == "yes":
            drop(d, "extraKnownMarketplaces", name)
        if args[2] == "yes":
            drop(d, "enabledPlugins", key)
        emit(d)
    elif op == "rest":
        drop(d, "extraKnownMarketplaces", name)
        drop(d, "enabledPlugins", key)
        sys.stdout.write(json.dumps(d, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n")
    elif op == "manifest":
        ok = d.get("name") == name and any(isinstance(p, dict) and p.get("name") == name for p in d.get("plugins") or [])
        sys.exit(0 if ok else 1)
except (ValueError, TypeError, AttributeError, OSError) as exc:
    sys.stderr.write("%s\n" % exc)
    sys.exit(2)
PY

jx() {
  local op=$1 file=$2
  shift 2
  if [ "$JSON_TOOL" = python3 ]; then
    python3 -I -c "$PY_HELPER" "$op" "$MK_KEY" "$PLUGIN_KEY" "$file" "$@"
    return
  fi
  case "$op" in
    valid)
      jq -e 'type == "object"' "$file" >/dev/null ;;
    mkinfo)
      jq -r --arg n "$MK_KEY" '
        (.extraKnownMarketplaces // {})[$n] as $e
        | if $e == null then empty
          else "\(($e.source? // {}) | (.source? // ""))|\(($e.source? // {}) | (.path? // ""))" end' "$file" ;;
    enabled)
      jq -r --arg k "$PLUGIN_KEY" '(.enabledPlugins // {}) | if has($k) then .[$k] else empty end' "$file" ;;
    install)
      jq --arg n "$MK_KEY" --arg k "$PLUGIN_KEY" --arg p "$1" '
        .extraKnownMarketplaces[$n].source = {source: "directory", path: $p}
        | .enabledPlugins[$k] = true' "$file" ;;
    remove)
      jq --arg n "$MK_KEY" --arg k "$PLUGIN_KEY" --arg dmk "$1" --arg den "$2" '
        def drop($sec; $entry):
          if (.[$sec] // {} | has($entry)) then del(.[$sec][$entry]) else . end
          | if .[$sec] == {} then del(.[$sec]) else . end;
        (if $dmk == "yes" then drop("extraKnownMarketplaces"; $n) else . end)
        | (if $den == "yes" then drop("enabledPlugins"; $k) else . end)' "$file" ;;
    rest)
      jq -S -c --arg n "$MK_KEY" --arg k "$PLUGIN_KEY" '
        def drop($sec; $entry):
          if (.[$sec] // {} | has($entry)) then del(.[$sec][$entry]) else . end
          | if .[$sec] == {} then del(.[$sec]) else . end;
        drop("extraKnownMarketplaces"; $n) | drop("enabledPlugins"; $k)' "$file" ;;
    manifest)
      jq -e --arg n "$MK_KEY" '.name == $n and ((.plugins // []) | map(.name) | index($n) != null)' "$file" >/dev/null ;;
  esac
}

settings_precheck() {
  [ -e "$SETTINGS" ] || return 0
  [ -r "$SETTINGS" ] || die "$SETTINGS is not readable"
  jx valid "$SETTINGS" 2>/dev/null || die "$SETTINGS is not a valid JSON object. Fix it by hand first. Nothing was changed."
}

# Rewrites settings.json via op "install" or "remove"; $1 = op, rest = op arguments.
apply_settings() {
  local op=$1 real dir src tmp backup ts
  shift
  real=$(resolve_link "$SETTINGS")
  dir=$(dirname "$real")
  tmp=$(mktemp "$dir/.settings.json.XXXXXX") || die "cannot create a temp file in $dir"
  TMP_PATHS="$TMP_PATHS $tmp"
  if [ -e "$real" ]; then
    src=$real
    cp -p "$real" "$tmp"
  else
    src=$(mktemp "$dir/.settings.json.XXXXXX")
    TMP_PATHS="$TMP_PATHS $src"
    printf '{}\n' >"$src"
    chmod 644 "$tmp"
  fi

  jx "$op" "$src" "$@" >"$tmp" 2>/dev/null || die "could not compute the new settings.json. Original left untouched."
  jx valid "$tmp" 2>/dev/null || die "new settings.json would not parse. Original left untouched."
  [ "$(jx rest "$src")" = "$(jx rest "$tmp")" ] \
    || die "new settings.json would change keys other than ours. Original left untouched."

  if [ -e "$real" ]; then
    ts=$(date +%Y%m%d-%H%M%S)
    backup="$real.bak-$ts"
    [ ! -e "$backup" ] || backup="$backup-$$"
    cp -p "$real" "$backup"
    say "Backed up settings to $backup"
  fi
  mv -f "$tmp" "$real"
  say "Updated $real"
}

settings_state() {
  MK_INFO=""
  EN_VAL=""
  [ -e "$SETTINGS" ] || return 0
  MK_INFO=$(jx mkinfo "$SETTINGS") || die "could not read $SETTINGS"
  EN_VAL=$(jx enabled "$SETTINGS") || die "could not read $SETTINGS"
}

# ---- checkout helpers ----------------------------------------------------

is_checkout_root() {
  [ -d "$CHECKOUT" ] && [ -z "$(git -C "$CHECKOUT" rev-parse --show-prefix 2>/dev/null || echo x)" ]
}

dirty_count() { git --no-optional-locks -C "$CHECKOUT" status --porcelain --untracked-files=no | wc -l | tr -d ' '; }
unpushed_count() { git -C "$CHECKOUT" log --branches --not --remotes --oneline | wc -l | tr -d ' '; }

finish() {
  say ""
  say "Run /reload-plugins in Claude Code, or restart it, to pick this up."
}

# ---- operations -----------------------------------------------------------

do_install() {
  local want_mk="directory|$CHECKOUT"
  settings_precheck
  settings_state

  if [ -n "$MK_INFO" ] && [ "$MK_INFO" != "$want_mk" ]; then
    die "settings.json already has a marketplace '$MK_KEY' pointing at '${MK_INFO#*|}'. Remove or rename that entry by hand; nothing was changed."
  fi

  if [ -e "$CHECKOUT" ] || [ -L "$CHECKOUT" ]; then
    is_checkout_root || die "$CHECKOUT exists but is not a git checkout. Move it away and rerun. Nothing was changed."
    say "Checkout already present at $CHECKOUT; leaving it untouched."
    if [ "$(dirty_count)" -gt 0 ]; then
      say "It has uncommitted changes. They are kept."
    fi
  else
    note "mkdir -p $MODS_DIR && git clone $REPO_URL $CHECKOUT"
    if [ "$DRY_RUN" -eq 0 ]; then
      mkdir -p "$MODS_DIR"
      git clone --quiet -- "$REPO_URL" "$CHECKOUT" || die "git clone failed. Nothing in settings.json was changed."
      jx manifest "$CHECKOUT/.claude-plugin/marketplace.json" 2>/dev/null \
        || die "the clone has no .claude-plugin/marketplace.json naming '$NAME'. The checkout is at $CHECKOUT; settings.json was not changed."
    fi
  fi

  if [ "$MK_INFO" = "$want_mk" ] && [ "$EN_VAL" = "true" ]; then
    say "settings.json already enables $PLUGIN_KEY; not touching it."
  else
    note "add extraKnownMarketplaces.$MK_KEY (directory $CHECKOUT) and enabledPlugins[\"$PLUGIN_KEY\"] = true in $SETTINGS (backup first)"
    [ "$DRY_RUN" -eq 1 ] || apply_settings install "$CHECKOUT"
  fi
  [ "$DRY_RUN" -eq 1 ] || finish
}

do_update() {
  local branch ahead behind counts old new
  is_checkout_root || die "no git checkout at $CHECKOUT. Run: install.sh install"
  git -C "$CHECKOUT" remote get-url origin >/dev/null 2>&1 || die "the checkout has no 'origin' remote"

  if [ "$(dirty_count)" -gt 0 ]; then
    git --no-optional-locks -C "$CHECKOUT" status --short --untracked-files=no >&2
    die "the checkout has uncommitted changes (listed above). Nothing was changed.
Keep them with:    git -C $CHECKOUT commit -am 'my changes'
or set them aside: git -C $CHECKOUT stash
then run update again."
  fi
  branch=$(git -C "$CHECKOUT" symbolic-ref --quiet --short HEAD) \
    || die "the checkout is on a detached HEAD. Run: git -C $CHECKOUT switch <branch>, then update again."
  git -C "$CHECKOUT" rev-parse --verify --quiet '@{u}' >/dev/null \
    || die "branch '$branch' tracks no upstream. Run: git -C $CHECKOUT branch --set-upstream-to=origin/$branch"

  if [ "$DRY_RUN" -eq 1 ]; then
    note "git -C $CHECKOUT fetch origin, then fast-forward '$branch' with --ff-only (refuses if diverged)"
    return 0
  fi

  git -C "$CHECKOUT" fetch --quiet origin || die "git fetch failed. Nothing was changed."
  counts=$(git -C "$CHECKOUT" rev-list --left-right --count 'HEAD...@{u}')
  ahead=${counts%%[[:space:]]*}
  behind=${counts##*[[:space:]]}

  if [ "$ahead" -gt 0 ] && [ "$behind" -gt 0 ]; then
    die "'$branch' has diverged: $ahead local commit(s) and $behind new upstream commit(s). Nothing was changed.
Replay your commits on top of upstream: git -C $CHECKOUT rebase
or merge them:                           git -C $CHECKOUT merge
then run update again, or skip updating."
  fi
  if [ "$behind" -eq 0 ]; then
    say "Already up to date."
    [ "$ahead" -eq 0 ] || say "(You have $ahead local commit(s) not on origin; they are untouched.)"
  else
    old=$(git -C "$CHECKOUT" rev-parse --short HEAD)
    git -C "$CHECKOUT" merge --quiet --ff-only '@{u}' || die "fast-forward failed. Nothing was lost; inspect with: git -C $CHECKOUT status"
    new=$(git -C "$CHECKOUT" rev-parse --short HEAD)
    say "Updated $old -> $new ($behind commit(s))."
  fi

  settings_precheck
  settings_state
  if [ "$MK_INFO" != "directory|$CHECKOUT" ] || [ "$EN_VAL" != "true" ]; then
    say "Note: $PLUGIN_KEY is not enabled in settings.json. Run: install.sh install"
  fi
  finish
}

confirm_remove() {
  local dirty unpushed ans
  dirty=0
  unpushed=0
  if is_checkout_root; then
    dirty=$(dirty_count)
    unpushed=$(unpushed_count)
  fi
  say "This will:"
  say "  - remove extraKnownMarketplaces.$MK_KEY and enabledPlugins[\"$PLUGIN_KEY\"] from $SETTINGS"
  say "  - delete $CHECKOUT"
  say "Any local modifications in that folder are deleted with it and cannot be recovered."
  [ "$dirty" -eq 0 ] || say "  ! $dirty file(s) with uncommitted changes would be lost."
  [ "$unpushed" -eq 0 ] || say "  ! $unpushed local commit(s) that are not on any remote would be lost."
  [ "$ASSUME_YES" -eq 0 ] || return 0
  [ -t 0 ] || die "not a terminal, so I cannot ask. Rerun with --yes to confirm."
  printf 'Type "yes" to continue: '
  read -r ans
  [ "$ans" = "yes" ] || die "aborted; nothing was changed."
}

do_remove() {
  local want_mk="directory|$CHECKOUT" dmk=no den=no what
  settings_precheck
  settings_state

  if [ -n "$MK_INFO" ]; then
    if [ "$MK_INFO" = "$want_mk" ]; then
      dmk=yes
    else
      say "Leaving extraKnownMarketplaces.$MK_KEY alone: it points at '${MK_INFO#*|}', not at this checkout."
    fi
  fi
  [ -z "$EN_VAL" ] || den=yes

  if [ ! -e "$CHECKOUT" ] && [ ! -L "$CHECKOUT" ] && [ "$dmk" = no ] && [ "$den" = no ]; then
    say "Nothing to remove."
    return 0
  fi
  if [ -e "$CHECKOUT" ] || [ -L "$CHECKOUT" ]; then
    is_checkout_root || die "$CHECKOUT is not a git checkout; refusing to delete it. Nothing was changed."
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    note "ask for confirmation (local modifications in $CHECKOUT would be lost)"
  else
    confirm_remove
  fi

  if [ "$dmk" = yes ] || [ "$den" = yes ]; then
    what=""
    [ "$dmk" = no ] || what="extraKnownMarketplaces.$MK_KEY"
    [ "$den" = no ] || what="${what:+$what, }enabledPlugins[\"$PLUGIN_KEY\"]"
    note "remove ${what# } from $SETTINGS (backup first)"
    [ "$DRY_RUN" -eq 1 ] || apply_settings remove "$dmk" "$den"
  fi
  if [ -e "$CHECKOUT" ] || [ -L "$CHECKOUT" ]; then
    note "delete $CHECKOUT"
    [ "$DRY_RUN" -eq 1 ] || { rm -rf -- "$CHECKOUT"; say "Deleted $CHECKOUT"; }
  fi
  [ "$DRY_RUN" -eq 1 ] || finish
}

main() {
  parse_args "$@"
  setup_paths
  need_tools
  [ "$DRY_RUN" -eq 0 ] || say "[dry-run] nothing will be changed. Using $JSON_TOOL for JSON, claude dir $CLAUDE_DIR"
  case "$ACTION" in
    install) do_install ;;
    update) do_update ;;
    remove) do_remove ;;
  esac
}

main "$@"
