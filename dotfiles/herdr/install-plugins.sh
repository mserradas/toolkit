#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_SPECS=(
    "herdr-focus-notify yankewei/herdr-focus-notify 0.5.0 v0.5.0"
    "aarsh21.tab-title aarsh21/herdr-tab-title 0.1.6 v0.1.6"
)

if (( $# > 1 )) || { (( $# == 1 )) && [[ "$1" != "--check" ]]; }; then
    echo "Uso: $0 [--check]" >&2
    exit 1
fi

plugin_matches() {
    local require_enabled="$1"
    herdr plugin list --plugin "$PLUGIN_ID" --json | python3 -c '
import json, sys
plugin_id, repo, version, ref, require_enabled = sys.argv[1:]
owner, repo_name = repo.split("/", 1)
plugins = json.load(sys.stdin)["result"]["plugins"]
matches = any(
    p.get("plugin_id") == plugin_id
    and p.get("version") == version
    and p.get("source", {}).get("owner") == owner
    and p.get("source", {}).get("repo") == repo_name
    and p.get("source", {}).get("requested_ref") == ref
    and (require_enabled != "enabled" or p.get("enabled") is True)
    for p in plugins
)
sys.exit(0 if matches else 1)
' "$PLUGIN_ID" "$PLUGIN_REPO" "$PLUGIN_VERSION" "$PLUGIN_REF" "$require_enabled"
}

if [[ "${1:-}" == "--check" ]]; then
    command -v alerter >/dev/null || { echo "Falta alerter" >&2; exit 1; }
elif ! command -v alerter >/dev/null; then
    brew install vjeantet/tap/alerter
fi

for spec in "${PLUGIN_SPECS[@]}"; do
    read -r PLUGIN_ID PLUGIN_REPO PLUGIN_VERSION PLUGIN_REF <<< "$spec"
    if [[ "${1:-}" != "--check" ]]; then
        if ! plugin_matches installed; then
            if ! command -v cargo >/dev/null; then
                brew install rust
            fi
            herdr plugin install "$PLUGIN_REPO" --ref "$PLUGIN_REF" --yes
        fi
        if ! plugin_matches enabled; then
            herdr plugin enable "$PLUGIN_ID" >/dev/null
        fi
    fi
    plugin_matches enabled || {
        echo "$PLUGIN_ID $PLUGIN_REF no está instalado y habilitado" >&2
        exit 1
    }
    echo "$PLUGIN_ID $PLUGIN_REF habilitado"
done

tab_config_dir="$(herdr plugin config-dir aarsh21.tab-title)"
if [[ "${1:-}" == "--check" ]]; then
    cmp -s "$SCRIPT_DIR/tab-title.toml" "$tab_config_dir/config.toml" || {
        echo "La configuración de títulos no coincide con herdr/tab-title.toml" >&2
        exit 1
    }
else
    mkdir -p "$tab_config_dir"
    if ! cmp -s "$SCRIPT_DIR/tab-title.toml" "$tab_config_dir/config.toml"; then
        cp "$SCRIPT_DIR/tab-title.toml" "$tab_config_dir/config.toml"
    fi
    # Herdr starts it again on tab/workspace events; no shell startup hook needed.
    herdr plugin action invoke start --plugin aarsh21.tab-title >/dev/null
fi
echo "Títulos automáticos sin números configurados; alerter disponible"
