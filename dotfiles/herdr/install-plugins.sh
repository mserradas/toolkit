#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if (( $# > 1 )) || { (( $# == 1 )) && [[ "$1" != "--check" ]]; }; then
    echo "Uso: $0 [--check]" >&2
    exit 1
fi

CHECK=0
[[ "${1:-}" != "--check" ]] || CHECK=1

plugin_matches() {
    local require_enabled="$1"
    herdr plugin list --plugin "$PLUGIN_ID" --json | python3 -c '
import json, sys
plugin_id, repo, version, commit, require_enabled = sys.argv[1:]
owner, repo_name = repo.split("/", 1)
plugins = json.load(sys.stdin)["result"]["plugins"]
matches = any(
    p.get("plugin_id") == plugin_id
    and p.get("version") == version
    and p.get("source", {}).get("owner") == owner
    and p.get("source", {}).get("repo") == repo_name
    and p.get("source", {}).get("resolved_commit") == commit
    and (require_enabled != "enabled" or p.get("enabled") is True)
    for p in plugins
)
sys.exit(0 if matches else 1)
' "$PLUGIN_ID" "$PLUGIN_REPO" "$PLUGIN_VERSION" "$PLUGIN_REF" "$require_enabled"
}

copy_preference() {
    local src="$1" dst="$2" backup
    if cmp -s "$src" "$dst"; then
        return
    fi
    if [[ "$CHECK" -eq 1 ]]; then
        echo "Preferencias distintas o ausentes: $dst" >&2
        return 1
    fi
    mkdir -p "$(dirname "$dst")"
    if [[ -f "$dst" ]]; then
        backup="$(mktemp "${dst}.backup.XXXXXX")"
        cp -p "$dst" "$backup"
    fi
    cp "$src" "$dst"
}

# Preferences must exist before Herdr starts newly installed plugins.
copy_preference "$SCRIPT_DIR/radar.toml" "$HOME/.config/herdr/plugins/config/hhdebb.herdr-radar/config.toml"
copy_preference "$SCRIPT_DIR/auto-title.env" "$HOME/Library/Application Support/herdr-auto-title/config.env"

if ! command -v node >/dev/null; then
    [[ "$CHECK" -eq 0 ]] || { echo "Falta Node.js >=18 para Radar" >&2; exit 1; }
    brew install node
fi
node -e 'if (Number(process.versions.node.split(".")[0]) < 18) { console.error("Radar requiere Node.js >=18"); process.exit(1); }'

while read -r PLUGIN_ID PLUGIN_REPO PLUGIN_VERSION PLUGIN_REF; do
    [[ -n "$PLUGIN_ID" && "$PLUGIN_ID" != \#* ]] || continue
    if [[ "$CHECK" -eq 0 ]]; then
        if ! plugin_matches installed; then
            if [[ "$PLUGIN_ID" == "herdr.auto-title" ]] && ! command -v go >/dev/null; then
                brew install go
            fi
            herdr plugin install "$PLUGIN_REPO" --ref "$PLUGIN_REF" --yes
        fi
        if ! plugin_matches enabled; then
            herdr plugin enable "$PLUGIN_ID" >/dev/null
        fi
    fi
    plugin_matches enabled || {
        echo "$PLUGIN_ID $PLUGIN_VERSION ($PLUGIN_REF) no está instalado y habilitado" >&2
        exit 1
    }
    echo "$PLUGIN_ID $PLUGIN_VERSION habilitado"
done < "$SCRIPT_DIR/plugins.list"

if [[ "$CHECK" -eq 0 ]]; then
    herdr plugin action invoke install-font --plugin hhdebb.herdr-radar >/dev/null
fi

# Match the installed font to the pinned plugin's font, without running plugin code.
herdr plugin list --plugin hhdebb.herdr-radar --json | python3 -c '
import hashlib, json, sys
from pathlib import Path
plugin = next(p for p in json.load(sys.stdin)["result"]["plugins"] if p["plugin_id"] == "hhdebb.herdr-radar")
source = Path(plugin["plugin_root"]) / "dist/HerdrAgentIconsMax-Regular.ttf"
digest = hashlib.sha256(source.read_bytes()).hexdigest()[:8]
installed = Path.home() / "Library/Fonts" / f"HerdrAgentIconsMax-{digest}.ttf"
if not installed.is_file() or installed.read_bytes() != source.read_bytes():
    sys.exit("Falta la fuente de iconos de Radar o no coincide con el plugin")
'
echo "Auto Title, Radar, preferencias y fuente verificados"
