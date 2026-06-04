# Dotfiles

Configuración personal para el entorno de terminal en macOS.

**Stack:** Ghostty + Fish + Tmux + Starship

## Requisitos previos

### 1. Homebrew

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

---

## Instalación

### 2. Terminal y Shell

```sh
brew install --cask ghostty
brew install fish
```

Establecer fish como shell por defecto:

```sh
echo /opt/homebrew/bin/fish | sudo tee -a /etc/shells
chsh -s /opt/homebrew/bin/fish
```

### 3. Tmux

```sh
brew install tmux
```

Instalar TPM (gestor de plugins de tmux):

```sh
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
```

Copiar la config de tmux:

```sh
cp tmux/.tmux.conf ~/.tmux.conf
```

Abrir tmux e instalar los plugins con `Ctrl+a` + `I`.

### 4. Starship

```sh
brew install starship
```

### 5. Fuente

```sh
brew install --cask font-jetbrains-mono-nerd-font
```

Seleccionar `JetBrainsMono Nerd Font Mono` en la config de Ghostty.

---

## Herramientas de shell

Todas usadas en la config de fish:

```sh
brew install eza          # ls moderno con iconos
brew install fzf          # búsqueda difusa
brew install atuin        # historial de comandos
brew install zoxide       # cd inteligente
brew install fnm          # gestor de versiones de Node
brew install terminal-notifier  # notificaciones macOS
```

### Opcional

```sh
brew install pnpm         # gestor de paquetes Node (abreviaciones configuradas)
brew install git          # control de versiones
```

---

## Copiar configuraciones

```sh
# Ghostty
cp ghostty/config ~/.config/ghostty/config

# Fish
cp fish/config.fish ~/.config/fish/config.fish

# Starship
cp starship/starship.toml ~/.config/starship.toml
```

---

## Plugins de Tmux

Se instalan automáticamente con TPM (`Ctrl+a` + `I`):

| Plugin | Función |
|---|---|
| tmux-yank | Copiar al portapapeles del sistema |
| vim-tmux-navigator | Navegación entre paneles tmux y vim |
| tmux-resurrect | Guardar y restaurar sesiones |
| tmux-which-key | Menú de atajos de teclado |
| tmux-ukiyo | Tema Catppuccin Mocha para la barra |
