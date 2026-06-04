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

# --- HOMEBREW ---
install_homebrew() {
    log "Homebrew"
    if installed brew; then
        success "Homebrew ya instalado"
    else
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
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
        font-jetbrains-mono-nerd-font
    )

    local formulae=(
        fish
        tmux
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
        else
            brew install --cask "$cask" && success "$cask instalado"
        fi
    done

    for formula in "${formulae[@]}"; do
        if brew list "$formula" &>/dev/null; then
            success "$formula ya instalado"
        else
            brew install "$formula" && success "$formula instalado"
        fi
    done
}

# --- SHELL ---
set_fish_shell() {
    log "Fish como shell por defecto"

    local fish_path
    if [[ -f /opt/homebrew/bin/fish ]]; then
        fish_path="/opt/homebrew/bin/fish"
    else
        fish_path="/usr/local/bin/fish"
    fi

    if ! grep -q "$fish_path" /etc/shells; then
        echo "$fish_path" | sudo tee -a /etc/shells
        success "Fish añadido a /etc/shells"
    else
        success "Fish ya estaba en /etc/shells"
    fi

    if [[ "$SHELL" == "$fish_path" ]]; then
        success "Fish ya es el shell por defecto"
    else
        chsh -s "$fish_path"
        success "Fish establecido como shell por defecto"
    fi
}

# --- TPM ---
setup_tpm() {
    log "TPM (gestor de plugins tmux)"

    if [[ -d "$HOME/.tmux/plugins/tpm" ]]; then
        success "TPM ya instalado"
    else
        git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
        success "TPM instalado"
    fi
}

# --- CONFIGS ---
copy_configs() {
    log "Copiando configuraciones"

    # Crear directorios necesarios
    mkdir -p ~/.config/ghostty
    mkdir -p ~/.config/fish
    mkdir -p ~/.config

    # Función para copiar con backup
    copy_with_backup() {
        local src="$1"
        local dst="$2"
        if [[ -f "$dst" ]]; then
            cp "$dst" "${dst}.backup"
            warn "Backup creado: ${dst}.backup"
        fi
        cp "$src" "$dst"
        success "$(basename "$dst") copiado"
    }

    copy_with_backup "$DOTFILES_DIR/ghostty/config"       ~/.config/ghostty/config
    copy_with_backup "$DOTFILES_DIR/fish/config.fish"     ~/.config/fish/config.fish
    copy_with_backup "$DOTFILES_DIR/tmux/.tmux.conf"      ~/.tmux.conf
    copy_with_backup "$DOTFILES_DIR/starship/starship.toml" ~/.config/starship.toml
}

# --- PLUGINS TMUX ---
install_tmux_plugins() {
    log "Plugins de Tmux"

    if [[ -f "$HOME/.tmux/plugins/tpm/bin/install_plugins" ]]; then
        "$HOME/.tmux/plugins/tpm/bin/install_plugins"
        success "Plugins instalados"
    else
        warn "TPM no encontrado, instala los plugins manualmente con Ctrl+a + I"
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

    # Binarios
    installed brew      && check "Homebrew"           "ok" || check "Homebrew"           "no encontrado"
    installed fish      && check "Fish"               "ok" || check "Fish"               "no encontrado"
    installed tmux      && check "Tmux"               "ok" || check "Tmux"               "no encontrado"
    installed starship  && check "Starship"           "ok" || check "Starship"           "no encontrado"
    installed eza       && check "eza"                "ok" || check "eza"                "no encontrado"
    installed fzf       && check "fzf"                "ok" || check "fzf"                "no encontrado"
    installed atuin     && check "atuin"              "ok" || check "atuin"              "no encontrado"
    installed zoxide    && check "zoxide"             "ok" || check "zoxide"             "no encontrado"
    installed fnm       && check "fnm"                "ok" || check "fnm"                "no encontrado"
    installed terminal-notifier && check "terminal-notifier" "ok" || check "terminal-notifier" "no encontrado"

    # Configs
    [[ -f ~/.config/ghostty/config ]]   && check "Config Ghostty"  "ok" || check "Config Ghostty"  "no encontrado en ~/.config/ghostty/config"
    [[ -f ~/.config/fish/config.fish ]] && check "Config Fish"     "ok" || check "Config Fish"     "no encontrado en ~/.config/fish/config.fish"
    [[ -f ~/.tmux.conf ]]               && check "Config Tmux"     "ok" || check "Config Tmux"     "no encontrado en ~/.tmux.conf"
    [[ -f ~/.config/starship.toml ]]    && check "Config Starship" "ok" || check "Config Starship" "no encontrado en ~/.config/starship.toml"

    # TPM y plugins
    [[ -d ~/.tmux/plugins/tpm ]]             && check "TPM"              "ok" || check "TPM"              "no encontrado en ~/.tmux/plugins/tpm"
    [[ -d ~/.tmux/plugins/tmux-yank ]]       && check "Plugin tmux-yank" "ok" || check "Plugin tmux-yank" "no instalado"
    [[ -d ~/.tmux/plugins/tmux-resurrect ]]  && check "Plugin tmux-resurrect" "ok" || check "Plugin tmux-resurrect" "no instalado"
    [[ -d ~/.tmux/plugins/tmux-ukiyo ]]      && check "Plugin tmux-ukiyo" "ok" || check "Plugin tmux-ukiyo" "no instalado"

    # Shell por defecto
    local fish_path
    [[ -f /opt/homebrew/bin/fish ]] && fish_path="/opt/homebrew/bin/fish" || fish_path="/usr/local/bin/fish"
    [[ "$SHELL" == "$fish_path" ]] && check "Fish como shell por defecto" "ok" || check "Fish como shell por defecto" "shell actual: $SHELL"

    if [[ "$ok" == true ]]; then
        echo -e "\n${GREEN}${BOLD}✓ Todo correcto${NC}"
    else
        echo -e "\n${YELLOW}${BOLD}! Algunos checks fallaron — revisa los errores arriba${NC}"
    fi
}

# --- MAIN ---
main() {
    if [[ "$1" == "--check" ]]; then
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
    setup_tpm
    copy_configs
    install_tmux_plugins
    healthcheck

    echo -e "\n${GREEN}${BOLD}✓ Instalación completada${NC}"
    echo -e "  Abre Ghostty para empezar.\n"
}

main "$@"
