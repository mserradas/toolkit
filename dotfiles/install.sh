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

setup_homebrew_environment() {
    local brew_path
    for brew_path in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        if [[ -x "$brew_path" ]]; then
            eval "$("$brew_path" shellenv bash)"
            break
        fi
    done
}

registered_user_shell() {
    local current_user shell_record registered_shell

    current_user="$(id -un)" || return 1
    shell_record="$(dscl . -read "/Users/$current_user" UserShell 2>/dev/null)" || return 1
    registered_shell="${shell_record#UserShell: }"

    [[ "$registered_shell" != "$shell_record" && -n "$registered_shell" ]] || return 1
    printf '%s\n' "$registered_shell"
}

jetbrains_mono_font_installed() {
    local font_dir font_file
    for font_dir in "$HOME/Library/Fonts" "/Library/Fonts"; do
        [[ -d "$font_dir" ]] || continue
        for font_file in "$font_dir"/JetBrainsMono*.{ttf,otf}; do
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
            eval "$(/opt/homebrew/bin/brew shellenv bash)"
        else
            eval "$(/usr/local/bin/brew shellenv bash)"
        fi
        success "Homebrew instalado"
    fi
}

# --- PAQUETES ---
install_packages() {
    log "Paquetes Homebrew"

    local casks=(
        ghostty
        font-jetbrains-mono
    )

    local formulae=(
        fish
        herdr
        starship
        eza
        fzf
        fd
        bat
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
        elif [[ "$cask" == "font-jetbrains-mono" ]] && jetbrains_mono_font_installed; then
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
    mkdir -p ~/.config/fish/functions
    mkdir -p ~/.config/herdr
    mkdir -p ~/.config/atuin
    mkdir -p ~/.config

    # Copiar directamente sin guardar versiones anteriores
    copy_config() {
        local src="$1"
        local dst="$2"
        cp "$src" "$dst"
        success "$(basename "$dst") copiado"
    }

    copy_config "$DOTFILES_DIR/ghostty/config"       ~/.config/ghostty/config
    copy_config "$DOTFILES_DIR/fish/config.fish"     ~/.config/fish/config.fish
    copy_config "$DOTFILES_DIR/herdr/config.toml"     ~/.config/herdr/config.toml
    copy_config "$DOTFILES_DIR/starship/starship.toml" ~/.config/starship.toml
    copy_config "$DOTFILES_DIR/atuin/config.toml"     ~/.config/atuin/config.toml
    copy_config "$DOTFILES_DIR/fish/functions/md.fish" "$HOME/.config/fish/functions/md.fish"
}

# --- INTEGRACIONES HERDR ---
install_fish_plugins() {
    log "Plugins Fish"
    fish "$DOTFILES_DIR/fish/install-plugins.fish"
}

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
    local runtime_pending=false

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
        elif [[ "$source" == "$DOTFILES_DIR/herdr/config.toml" ]] && python3 "$DOTFILES_DIR/herdr/portable-config.py" "$source" "$destination"; then
            check "$label" "ok"
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
    installed fd        && check "fd"                 "ok" || check "fd"                 "no encontrado"
    installed bat       && check "bat"                "ok" || check "bat"                "no encontrado"
    installed atuin     && check "atuin"              "ok" || check "atuin"              "no encontrado"
    installed zoxide    && check "zoxide"             "ok" || check "zoxide"             "no encontrado"
    installed fnm       && check "fnm"                "ok" || check "fnm"                "no encontrado"
    installed terminal-notifier && check "terminal-notifier" "ok" || check "terminal-notifier" "no encontrado"
    jetbrains_mono_font_installed && check "JetBrains Mono" "ok" || check "JetBrains Mono" "no encontrada"

    # Configs
    check_config "Config Ghostty"  "$DOTFILES_DIR/ghostty/config"          "$HOME/.config/ghostty/config"
    check_config "Config Fish"     "$DOTFILES_DIR/fish/config.fish"        "$HOME/.config/fish/config.fish"
    check_config "Config Herdr"    "$DOTFILES_DIR/herdr/config.toml"        "$HOME/.config/herdr/config.toml"
    check_config "Config Starship" "$DOTFILES_DIR/starship/starship.toml"  "$HOME/.config/starship.toml"
    check_config "Config Atuin"    "$DOTFILES_DIR/atuin/config.toml"       "$HOME/.config/atuin/config.toml"
    check_config "Función md" "$DOTFILES_DIR/fish/functions/md.fish" "$HOME/.config/fish/functions/md.fish"

    if installed atuin; then
        if [[ "$(atuin config get --resolved auto_sync 2>/dev/null)" == "false" ]]; then
            check "Historial Atuin sin sincronización automática" "ok"
        else
            check "Historial Atuin sin sincronización automática" "auto_sync no está desactivado"
        fi
    fi

    if installed fish; then
        if fish -c 'command -q ghostty'; then
            check "CLI Ghostty en Fish" "ok"
        else
            check "CLI Ghostty en Fish" "no encontrado en PATH"
        fi
        if fish --no-config --no-execute "$HOME/.config/fish/config.fish"; then
            check "Sintaxis Fish" "ok"
        else
            check "Sintaxis Fish" "configuración activa no válida"
        fi
        local plugin fish_plugins
        fish_plugins="$(fish -c 'functions -q fisher; and string replace -r "@[^@]+\$" "" -- (fisher list)')" || true
        while IFS= read -r plugin; do
            [[ -n "$plugin" && "$plugin" != \#* ]] || continue
            if grep -Fxq "$plugin" <<< "$fish_plugins"; then
                check "Plugin $plugin" "ok"
            else
                check "Plugin $plugin" "no instalado"
            fi
        done < "$DOTFILES_DIR/fish/plugins.list"
    fi

    if installed herdr; then
        if bash "$DOTFILES_DIR/herdr/install-plugins.sh" --check; then
            check "Plugins Herdr: Auto Title y Radar" "ok"
        else
            check "Plugins Herdr: Auto Title y Radar" "plugin, preferencias, Node.js o fuente no disponible"
        fi
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

        local runtime_result runtime_status
        if ! installed python3; then
            check "Servidor Herdr y colores" "no comprobado: falta python3 (herramientas de Xcode)"
        elif runtime_result="$(python3 "$DOTFILES_DIR/check-runtime.py")"; then
            check "Servidor Herdr y colores" "ok"
        else
            runtime_status=$?
            if [[ "$runtime_status" -eq 2 ]]; then
                warn "$runtime_result"
                runtime_pending=true
            else
                check "Servidor Herdr y colores" "$runtime_result"
            fi
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
        if [[ "$runtime_pending" == true ]]; then
            echo -e "\n${YELLOW}${BOLD}! Instalación correcta; quedan comprobaciones de sesión pendientes${NC}"
        else
            echo -e "\n${GREEN}${BOLD}✓ Todo correcto${NC}"
        fi
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
    setup_homebrew_environment
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
    bash "$DOTFILES_DIR/herdr/install-plugins.sh"
    install_fish_plugins
    install_herdr_integrations
    healthcheck

    echo -e "\n${GREEN}${BOLD}✓ Instalación completada${NC}"
    echo -e "  Abre Ghostty para empezar.\n"
}

main "$@"
