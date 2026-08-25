#!/bin/bash

set -e

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- COLORES ---
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

log()     { echo -e "\n${BLUE}${BOLD}==> $1${NC}"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}!${NC} $1"; }
error()   { echo -e "  ${RED}✗${NC} $1"; exit 1; }

installed() { command -v "$1" &>/dev/null; }

registered_user_shell() {
    local current_user shell_record registered_shell

    current_user="$(id -un)" || return 1
    shell_record="$(dscl . -read "/Users/$current_user" UserShell 2>/dev/null)" || return 1
    registered_shell="${shell_record#UserShell: }"

    [[ "$registered_shell" != "$shell_record" && -n "$registered_shell" ]] || return 1
    printf '%s\n' "$registered_shell"
}

geist_mono_font_installed() {
    local font_dir font_file
    for font_dir in "$HOME/Library/Fonts" "/Library/Fonts"; do
        [[ -d "$font_dir" ]] || continue
        for font_file in "$font_dir"/GeistMono*.{ttf,otf}; do
            [[ -e "$font_file" ]] && return 0
        done
    done
    return 1
}

# --- HOMEBREW ---
install_homebrew() {
    log "Homebrew"
    if installed brew; then
        success "Homebrew ya instalado"
    else
        local installer
        installer="$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        /bin/bash -c "$installer"
        # Añadir al PATH según arquitectura
        if [[ -f /opt/homebrew/bin/brew ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        else
            eval "$(/usr/local/bin/brew shellenv)"
        fi
        success "Homebrew instalado"
    fi
}

# --- PAQUETES ---
install_packages() {
    log "Paquetes Homebrew"

    local casks=(
        ghostty
        font-geist-mono
    )

    local formulae=(
        fish
        herdr
        starship
        eza
        fzf
        atuin
        zoxide
        fnm
        terminal-notifier
        git
        pnpm
    )

    for cask in "${casks[@]}"; do
        if brew list --cask "$cask" &>/dev/null; then
            success "$cask ya instalado"
        elif [[ "$cask" == "font-geist-mono" ]] && geist_mono_font_installed; then
            success "$cask ya instalado (fuente detectada)"
        else
            brew install --cask "$cask"
            success "$cask instalado"
        fi
    done

    for formula in "${formulae[@]}"; do
        if brew list "$formula" &>/dev/null; then
            success "$formula ya instalado"
        else
            brew install "$formula"
            success "$formula instalado"
        fi
    done
}

# --- SHELL ---
set_fish_shell() {
    log "Fish como shell por defecto"

    local fish_path registered_shell
    if [[ -f /opt/homebrew/bin/fish ]]; then
        fish_path="/opt/homebrew/bin/fish"
    else
        fish_path="/usr/local/bin/fish"
    fi

    if ! grep -Fqx "$fish_path" /etc/shells; then
        echo "$fish_path" | sudo tee -a /etc/shells
        success "Fish añadido a /etc/shells"
    else
        success "Fish ya estaba en /etc/shells"
    fi

    if ! registered_shell="$(registered_user_shell)"; then
        error "No se pudo consultar el shell registrado del usuario con dscl"
    fi

    if [[ "$registered_shell" == "$fish_path" ]]; then
        success "Fish ya es el shell por defecto"
    else
        chsh -s "$fish_path"
        success "Fish establecido como shell por defecto"
    fi
}

# --- CONFIGS ---
copy_configs() {
    log "Copiando configuraciones"

    if ! HERDR_CONFIG_PATH="$DOTFILES_DIR/herdr/config.toml" herdr config check &>/dev/null; then
        error "La configuración de Herdr del repositorio no es válida"
    fi

    # Crear directorios necesarios
    mkdir -p ~/.config/ghostty
    mkdir -p ~/.config/fish
    mkdir -p ~/.config/herdr
    mkdir -p ~/.config

    # Función para copiar con backup
    copy_with_backup() {
        local src="$1"
        local dst="$2"
        local backup timestamp counter
        if [[ -f "$dst" ]]; then
            timestamp="$(date +%Y%m%d-%H%M%S)"
            backup="${dst}.backup.${timestamp}"
            counter=1
            while [[ -e "$backup" ]]; do
                backup="${dst}.backup.${timestamp}.${counter}"
                counter=$((counter + 1))
            done
            cp -p "$dst" "$backup"
            warn "Backup creado: $backup"
        fi
        cp "$src" "$dst"
        success "$(basename "$dst") copiado"
    }

    copy_with_backup "$DOTFILES_DIR/ghostty/config"       ~/.config/ghostty/config
    copy_with_backup "$DOTFILES_DIR/fish/config.fish"     ~/.config/fish/config.fish
    copy_with_backup "$DOTFILES_DIR/herdr/config.toml"     ~/.config/herdr/config.toml
    copy_with_backup "$DOTFILES_DIR/starship/starship.toml" ~/.config/starship.toml
}

# --- INTEGRACIONES HERDR ---
install_herdr_integrations() {
    log "Integraciones de Herdr"

    if [[ -d "$HOME/.config/opencode" ]]; then
        herdr integration install opencode
        success "Integración de OpenCode instalada"
    else
        success "Integración de OpenCode omitida (cliente no configurado)"
    fi

    if [[ -d "$HOME/.codex" ]]; then
        herdr integration install codex
        success "Integración de Codex instalada"
    else
        success "Integración de Codex omitida (cliente no configurado)"
    fi
}

# --- HEALTHCHECK ---
healthcheck() {
    log "Healthcheck"

    local ok=true

    check() {
        local label="$1"
        local result="$2"
        if [[ "$result" == "ok" ]]; then
            success "$label"
        else
            echo -e "  ${RED}✗${NC} $label — $result"
            ok=false
        fi
    }

    check_config() {
        local label="$1"
        local source="$2"
        local destination="$3"

        if [[ ! -f "$destination" ]]; then
            check "$label" "no encontrado en $destination"
        elif cmp -s "$source" "$destination"; then
            check "$label" "ok"
        else
            check "$label" "diferente de la versión del repositorio"
        fi
    }

    check_integration() {
        local target="$1"
        local label="$2"
        local status

        if ! status="$(herdr integration status 2>/dev/null)"; then
            check "$label" "no se pudo consultar"
        elif grep -Eq "^${target}: current " <<< "$status"; then
            check "$label" "ok"
        else
            check "$label" "no instalada o desactualizada"
        fi
    }

    # Binarios
    installed brew      && check "Homebrew"           "ok" || check "Homebrew"           "no encontrado"
    installed fish      && check "Fish"               "ok" || check "Fish"               "no encontrado"
    installed herdr     && check "Herdr"              "ok" || check "Herdr"              "no encontrado"
    installed starship  && check "Starship"           "ok" || check "Starship"           "no encontrado"
    installed eza       && check "eza"                "ok" || check "eza"                "no encontrado"
    installed fzf       && check "fzf"                "ok" || check "fzf"                "no encontrado"
    installed atuin     && check "atuin"              "ok" || check "atuin"              "no encontrado"
    installed zoxide    && check "zoxide"             "ok" || check "zoxide"             "no encontrado"
    installed fnm       && check "fnm"                "ok" || check "fnm"                "no encontrado"
    installed terminal-notifier && check "terminal-notifier" "ok" || check "terminal-notifier" "no encontrado"
    geist_mono_font_installed && check "Geist Mono" "ok" || check "Geist Mono" "no encontrada"

    # Configs
    check_config "Config Ghostty"  "$DOTFILES_DIR/ghostty/config"          "$HOME/.config/ghostty/config"
    check_config "Config Fish"     "$DOTFILES_DIR/fish/config.fish"        "$HOME/.config/fish/config.fish"
    check_config "Config Herdr"    "$DOTFILES_DIR/herdr/config.toml"        "$HOME/.config/herdr/config.toml"
    check_config "Config Starship" "$DOTFILES_DIR/starship/starship.toml"  "$HOME/.config/starship.toml"

    if installed herdr; then
        if HERDR_CONFIG_PATH="$HOME/.config/herdr/config.toml" herdr config check &>/dev/null; then
            check "Sintaxis Herdr" "ok"
        else
            check "Sintaxis Herdr" "configuración activa no válida"
        fi
        if [[ -d "$HOME/.config/opencode" ]]; then
            check_integration "opencode" "Integración Herdr para OpenCode"
        fi
        if [[ -d "$HOME/.codex" ]]; then
            check_integration "codex" "Integración Herdr para Codex"
        fi
    fi

    # Shell por defecto
    local fish_path registered_shell
    [[ -f /opt/homebrew/bin/fish ]] && fish_path="/opt/homebrew/bin/fish" || fish_path="/usr/local/bin/fish"
    if registered_shell="$(registered_user_shell)"; then
        [[ "$registered_shell" == "$fish_path" ]] && check "Fish como shell por defecto" "ok" || check "Fish como shell por defecto" "shell registrado: $registered_shell"
    else
        check "Fish como shell por defecto" "no se pudo consultar el shell registrado con dscl"
    fi

    if [[ "$ok" == true ]]; then
        echo -e "\n${GREEN}${BOLD}✓ Todo correcto${NC}"
    else
        echo -e "\n${YELLOW}${BOLD}! Algunos checks fallaron — revisa los errores arriba${NC}"
        return 1
    fi
}

# --- MAIN ---
usage() {
    echo "Uso: $0 [--check]"
}

main() {
    if (( $# > 1 )) || { (( $# == 1 )) && [[ "$1" != "--check" ]]; }; then
        usage >&2
        return 1
    fi

    if [[ "${1:-}" == "--check" ]]; then
        echo -e "\n${BOLD}toolkit/dotfiles — healthcheck${NC}"
        echo "----------------------------------------"
        healthcheck
        return
    fi

    echo -e "\n${BOLD}toolkit/dotfiles — instalación automática${NC}"
    echo "----------------------------------------"

    install_homebrew
    install_packages
    set_fish_shell
    copy_configs
    install_herdr_integrations
    healthcheck

    echo -e "\n${GREEN}${BOLD}✓ Instalación completada${NC}"
    echo -e "  Abre Ghostty para empezar.\n"
}

main "$@"
