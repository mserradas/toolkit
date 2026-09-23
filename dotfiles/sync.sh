#!/bin/bash

set -e

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

SOURCES=()
DESTINATIONS=()
STAGED_FILES=()

log()     { echo -e "\n${BLUE}${BOLD}==> $1${NC}"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
error()   { echo -e "${RED}${BOLD}Error:${NC} $1" >&2; }

usage() {
    cat >&2 <<'EOF'
Uso:
  ./sync.sh           HOME → repo (bloquea cambios locales)
  ./sync.sh --force   HOME → repo (reemplazo deliberado)
  ./sync.sh --apply   repo → HOME (reemplaza sin backups)
EOF
}

cleanup() {
    local path

    for path in "${STAGED_FILES[@]}"; do
        if [[ -n "$path" ]]; then
            rm -f "$path"
        fi
    done
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

configure_paths() {
    if [[ "$MODE" == "apply" ]]; then
        SOURCES=(
            "$DOTFILES_DIR/ghostty/config"
            "$DOTFILES_DIR/fish/config.fish"
            "$DOTFILES_DIR/herdr/config.toml"
            "$DOTFILES_DIR/starship/starship.toml"
            "$DOTFILES_DIR/atuin/config.toml"
            "$DOTFILES_DIR/herdr/radar.toml"
            "$DOTFILES_DIR/herdr/auto-title.env"
            "$DOTFILES_DIR/fish/functions/md.fish"
        )
        DESTINATIONS=(
            "$HOME/.config/ghostty/config"
            "$HOME/.config/fish/config.fish"
            "$HOME/.config/herdr/config.toml"
            "$HOME/.config/starship.toml"
            "$HOME/.config/atuin/config.toml"
            "$HOME/.config/herdr/plugins/config/hhdebb.herdr-radar/config.toml"
            "$HOME/Library/Application Support/herdr-auto-title/config.env"
            "$HOME/.config/fish/functions/md.fish"
        )
    else
        SOURCES=(
            "$HOME/.config/ghostty/config"
            "$HOME/.config/fish/config.fish"
            "$HOME/.config/herdr/config.toml"
            "$HOME/.config/starship.toml"
            "$HOME/.config/atuin/config.toml"
            "$HOME/.config/herdr/plugins/config/hhdebb.herdr-radar/config.toml"
            "$HOME/Library/Application Support/herdr-auto-title/config.env"
            "$HOME/.config/fish/functions/md.fish"
        )
        DESTINATIONS=(
            "$DOTFILES_DIR/ghostty/config"
            "$DOTFILES_DIR/fish/config.fish"
            "$DOTFILES_DIR/herdr/config.toml"
            "$DOTFILES_DIR/starship/starship.toml"
            "$DOTFILES_DIR/atuin/config.toml"
            "$DOTFILES_DIR/herdr/radar.toml"
            "$DOTFILES_DIR/herdr/auto-title.env"
            "$DOTFILES_DIR/fish/functions/md.fish"
        )
    fi
}

prevalidate_sources() {
    local src
    local invalid=0

    for src in "${SOURCES[@]}"; do
        if [[ ! -f "$src" || ! -r "$src" ]]; then
            error "fuente ausente o ilegible: $src"
            invalid=1
        fi
    done

    [[ "$invalid" -eq 0 ]]
}

ensure_repo_is_clean() {
    local repo_root
    local dst
    local relative_path
    local status
    local dirty=0

    repo_root="$(git -C "$DOTFILES_DIR" rev-parse --show-toplevel 2>/dev/null)" || {
        error "no se pudo localizar el repositorio Git"
        return 1
    }

    for dst in "${DESTINATIONS[@]}"; do
        relative_path="${dst#"$repo_root"/}"
        status="$(git -C "$repo_root" status --porcelain --untracked-files=all -- "$relative_path")" || {
            error "no se pudo comprobar el estado Git de $relative_path"
            return 1
        }
        if [[ -n "$status" ]]; then
            error "el destino tiene cambios locales: $relative_path"
            dirty=1
        fi
    done

    if [[ "$dirty" -ne 0 ]]; then
        echo "Usa ./sync.sh --force solo si quieres reemplazarlos." >&2
        return 1
    fi
}

stage_all() {
    local i
    local src
    local dst
    local staged

    for ((i = 0; i < ${#SOURCES[@]}; i++)); do
        src="${SOURCES[$i]}"
        dst="${DESTINATIONS[$i]}"
        mkdir -p "$(dirname "$dst")"
        staged="$(mktemp "${dst}.sync.XXXXXX")"
        STAGED_FILES[$i]="$staged"
        if ! cp -p "$src" "$staged"; then
            error "no se pudo preparar la copia de $src"
            return 1
        fi
        if [[ "$MODE" == "sync" && "$dst" == "$DOTFILES_DIR/herdr/config.toml" ]]; then
            python3 "$DOTFILES_DIR/herdr/portable-config.py" "$src" > "$staged"
        fi
    done
}

promote_all() {
    local i
    local dst
    local staged

    for ((i = 0; i < ${#DESTINATIONS[@]}; i++)); do
        dst="${DESTINATIONS[$i]}"
        staged="${STAGED_FILES[$i]}"
        if ! mv -f "$staged" "$dst"; then
            error "no se pudo promover la copia preparada a $dst"
            return 1
        fi
        STAGED_FILES[$i]=""
    done
}

MODE="sync"
FORCE=0

case "$#" in
    0)
        ;;
    1)
        case "$1" in
            --apply)
                MODE="apply"
                ;;
            --force)
                FORCE=1
                ;;
            *)
                usage
                exit 1
                ;;
        esac
        ;;
    *)
        usage
        exit 1
        ;;
esac

configure_paths

if [[ "$MODE" == "apply" ]]; then
    echo -e "\n${BOLD}toolkit/dotfiles — apply (repo → HOME)${NC}"
else
    echo -e "\n${BOLD}toolkit/dotfiles — sync (HOME → repo)${NC}"
fi
echo "----------------------------------------"

log "Prevalidando las fuentes"
prevalidate_sources

if [[ "$MODE" == "sync" && "$FORCE" -eq 0 ]]; then
    log "Comprobando cambios locales en los destinos del repo"
    ensure_repo_is_clean
fi

log "Preparando las copias"
stage_all

log "Promoviendo las copias"
promote_all

for destination in "${DESTINATIONS[@]}"; do
    success "$destination"
done

if [[ "$MODE" == "apply" ]]; then
    echo -e "\n${GREEN}${BOLD}✓ Configuración aplicada (repo → HOME)${NC}"
    echo -e "  Reinicia Ghostty o recarga las configuraciones activas.\n"
else
    echo -e "\n${GREEN}${BOLD}✓ Sync completado (HOME → repo)${NC}"
    echo -e "  Revisa los cambios con: git diff\n"
fi
