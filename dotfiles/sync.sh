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
ROLLBACK_FILES=()
BACKUP_FILES=()
KEEP_BACKUPS=0
TRANSACTION_ACTIVE=0
PROMOTED_COUNT=0

log()     { echo -e "\n${BLUE}${BOLD}==> $1${NC}"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
error()   { echo -e "${RED}${BOLD}Error:${NC} $1" >&2; }

usage() {
    cat >&2 <<'EOF'
Uso:
  ./sync.sh           HOME → repo (bloquea cambios locales)
  ./sync.sh --force   HOME → repo (reemplazo deliberado)
  ./sync.sh --apply   repo → HOME (crea backups versionados)
EOF
}

cleanup() {
    local path

    if [[ "$TRANSACTION_ACTIVE" -eq 1 && "$PROMOTED_COUNT" -gt 0 ]]; then
        restore_promoted "$PROMOTED_COUNT"
        TRANSACTION_ACTIVE=0
        PROMOTED_COUNT=0
    fi

    for path in "${STAGED_FILES[@]}" "${ROLLBACK_FILES[@]}"; do
        [[ -n "$path" ]] && rm -f "$path"
    done

    if [[ "$KEEP_BACKUPS" -eq 0 ]]; then
        for path in "${BACKUP_FILES[@]}"; do
            [[ -n "$path" ]] && rm -f "$path"
        done
    fi
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
        )
        DESTINATIONS=(
            "$HOME/.config/ghostty/config"
            "$HOME/.config/fish/config.fish"
            "$HOME/.config/herdr/config.toml"
            "$HOME/.config/starship.toml"
        )
    else
        SOURCES=(
            "$HOME/.config/ghostty/config"
            "$HOME/.config/fish/config.fish"
            "$HOME/.config/herdr/config.toml"
            "$HOME/.config/starship.toml"
        )
        DESTINATIONS=(
            "$DOTFILES_DIR/ghostty/config"
            "$DOTFILES_DIR/fish/config.fish"
            "$DOTFILES_DIR/herdr/config.toml"
            "$DOTFILES_DIR/starship/starship.toml"
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
    done
}

next_backup_path() {
    local dst="$1"
    local timestamp="$2"
    local candidate="${dst}.backup.${timestamp}"
    local suffix=1

    while [[ -e "$candidate" || -L "$candidate" ]]; do
        candidate="${dst}.backup.${timestamp}.${suffix}"
        suffix=$((suffix + 1))
    done

    echo "$candidate"
}

prepare_backups() {
    local timestamp
    local i
    local dst
    local backup

    timestamp="$(date '+%Y%m%d-%H%M%S')"
    for ((i = 0; i < ${#DESTINATIONS[@]}; i++)); do
        dst="${DESTINATIONS[$i]}"
        BACKUP_FILES[$i]=""
        if [[ -e "$dst" || -L "$dst" ]]; then
            backup="$(next_backup_path "$dst" "$timestamp")"
            BACKUP_FILES[$i]="$backup"
            if ! cp -p "$dst" "$backup"; then
                error "no se pudo crear el backup de $dst"
                return 1
            fi
        fi
    done

    KEEP_BACKUPS=1
}

prepare_rollbacks() {
    local i
    local dst
    local rollback

    for ((i = 0; i < ${#DESTINATIONS[@]}; i++)); do
        dst="${DESTINATIONS[$i]}"
        ROLLBACK_FILES[$i]=""
        if [[ -e "$dst" || -L "$dst" ]]; then
            rollback="$(mktemp "${dst}.rollback.XXXXXX")"
            ROLLBACK_FILES[$i]="$rollback"
            if ! cp -p "$dst" "$rollback"; then
                error "no se pudo preparar el rollback de $dst"
                return 1
            fi
        fi
    done
}

restore_promoted() {
    local count="$1"
    local i
    local dst
    local original
    local rollback_failed=0

    for ((i = 0; i < count; i++)); do
        dst="${DESTINATIONS[$i]}"
        if [[ "$MODE" == "apply" ]]; then
            original="${BACKUP_FILES[$i]}"
        else
            original="${ROLLBACK_FILES[$i]}"
        fi

        if [[ -n "$original" ]]; then
            cp -p "$original" "$dst" || rollback_failed=1
        else
            rm -f "$dst" || rollback_failed=1
        fi
    done

    if [[ "$rollback_failed" -ne 0 ]]; then
        error "el rollback no pudo restaurar todos los destinos"
    fi
}

promote_all() {
    local i
    local dst
    local staged

    TRANSACTION_ACTIVE=1
    PROMOTED_COUNT=0

    for ((i = 0; i < ${#DESTINATIONS[@]}; i++)); do
        dst="${DESTINATIONS[$i]}"
        staged="${STAGED_FILES[$i]}"
        PROMOTED_COUNT=$((i + 1))
        if ! mv -f "$staged" "$dst"; then
            error "no se pudo promover la copia preparada a $dst"
            restore_promoted "$PROMOTED_COUNT"
            TRANSACTION_ACTIVE=0
            PROMOTED_COUNT=0
            return 1
        fi
        STAGED_FILES[$i]=""
    done

    TRANSACTION_ACTIVE=0
    PROMOTED_COUNT=0
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

log "Prevalidando las cuatro fuentes"
prevalidate_sources

if [[ "$MODE" == "sync" && "$FORCE" -eq 0 ]]; then
    log "Comprobando cambios locales en los destinos del repo"
    ensure_repo_is_clean
fi

log "Preparando las cuatro copias"
stage_all

if [[ "$MODE" == "apply" ]]; then
    log "Creando backups versionados"
    prepare_backups
else
    prepare_rollbacks
fi

log "Promoviendo las cuatro copias"
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
