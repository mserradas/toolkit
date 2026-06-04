#!/bin/bash

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log()     { echo -e "\n${BLUE}${BOLD}==> $1${NC}"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }

echo -e "\n${BOLD}toolkit/dotfiles — sync${NC}"
echo "----------------------------------------"

log "Copiando configs al repo"

cp ~/.config/ghostty/config     "$DOTFILES_DIR/ghostty/config"  && success "ghostty/config"
cp ~/.config/fish/config.fish   "$DOTFILES_DIR/fish/config.fish" && success "fish/config.fish"
cp ~/.tmux.conf                 "$DOTFILES_DIR/tmux/.tmux.conf"  && success "tmux/.tmux.conf"
cp ~/.config/starship.toml      "$DOTFILES_DIR/starship/starship.toml" && success "starship/starship.toml"

echo -e "\n${GREEN}${BOLD}✓ Sync completado${NC}"
echo -e "  Revisa los cambios con: git diff\n"
