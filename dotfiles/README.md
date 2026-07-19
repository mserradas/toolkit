# Dotfiles — entorno de terminal para macOS

Instala y configura un entorno de terminal completo basado en Ghostty, Fish, Tmux y Starship. El proceso es automático, repetible y crea copias de seguridad antes de reemplazar configuraciones existentes.

## Resultado

| Componente | Función |
|---|---|
| Ghostty | Emulador de terminal con tema Catppuccin Mocha, paneles divididos (`splits`) y fuente Nerd Font |
| Fish | Intérprete interactivo con abreviaciones e integración de herramientas |
| Tmux + TPM | Sesiones persistentes, complementos, navegación y panel emergente |
| Starship | Indicador de comandos (`prompt`) con estado de Git, duración y versiones de entornos de ejecución |
| Herramientas | `eza`, `fzf`, `atuin`, `zoxide`, `fnm`, `git`, `pnpm` y `terminal-notifier` |

Ghostty arranca Fish y abre o recupera automáticamente la sesión Tmux `work`.

## Requisitos

- macOS; la configuración incluida está optimizada para Apple Silicon.
- Conexión a Internet.
- Una cuenta con permisos para usar `sudo` y cambiar el intérprete con `chsh`.
- Herramientas de línea de comandos de Xcode para `git`. macOS ofrece instalarlas la primera vez que se ejecuta el comando.

El instalador añade Homebrew si no está disponible. La configuración incluida está optimizada para Apple Silicon y usa `/opt/homebrew`; en Macs Intel hay que ajustar las rutas indicadas en [Compatibilidad](#compatibilidad).

## Camino rápido

Desde la raíz del repositorio:

```bash
cd dotfiles
./install.sh
```

Durante la ejecución pueden aparecer solicitudes de Homebrew, `sudo` o `chsh`. Al terminar:

1. Cierra la terminal actual.
2. Abre Ghostty.
3. Comprueba que Fish y la sesión Tmux `work` se inician correctamente.

Verifica toda la instalación en cualquier momento:

```bash
./install.sh --check
```

## Qué hace el instalador

| Orden | Acción | Comportamiento al repetirla |
|---:|---|---|
| 1 | Instala Homebrew | Se omite si ya existe |
| 2 | Instala aplicaciones, paquetes y fuente | Homebrew omite lo que ya está instalado |
| 3 | Registra Fish en `/etc/shells` y lo configura como intérprete predeterminado | Solo cambia lo necesario |
| 4 | Instala TPM en `~/.tmux/plugins/tpm` | Conserva la instalación existente |
| 5 | Copia las configuraciones | Crea un `.backup` y reemplaza el destino |
| 6 | Instala los complementos de Tmux | Usa el instalador de TPM, incluso sin una sesión Tmux previa |
| 7 | Ejecuta la comprobación de estado | Informa de binarios, archivos o complementos ausentes |

### Paquetes instalados

```text
Aplicaciones: Ghostty
Fuente:       JetBrainsMono Nerd Font Mono
Intérprete:   fish
Terminal:     tmux, starship
Navegación:   eza, fzf, zoxide
Historial:    atuin
Entornos:     fnm
Utilidades:   git, pnpm, terminal-notifier
```

## Archivos administrados

| Fuente del repositorio | Destino | Copia de seguridad previa |
|---|---|---|
| `ghostty/config` | `~/.config/ghostty/config` | `~/.config/ghostty/config.backup` |
| `fish/config.fish` | `~/.config/fish/config.fish` | `~/.config/fish/config.fish.backup` |
| `tmux/.tmux.conf` | `~/.tmux.conf` | `~/.tmux.conf.backup` |
| `starship/starship.toml` | `~/.config/starship.toml` | `~/.config/starship.toml.backup` |

Cada ejecución actualiza la copia de seguridad única del destino antes de copiar la nueva configuración. Si necesitas conservar varias versiones históricas, guárdalas fuera de esas rutas antes de reinstalar.

## Mantener las configuraciones

El flujo recomendado es editar la configuración activa, sincronizarla al repositorio y revisar las diferencias (`diff`):

```bash
cd dotfiles
./sync.sh
git diff -- .
```

`sync.sh` copia hacia el repositorio las configuraciones actuales de Ghostty, Fish, Tmux y Starship. No crea copias de seguridad dentro del repositorio; revisa siempre las diferencias antes de crear una confirmación (`commit`).

## Atajos principales

### Ghostty

| Atajo | Acción |
|---|---|
| `Alt+V` | Crear un panel a la derecha |
| `Alt+D` | Crear un panel debajo |
| `Alt+H/J/K/L` | Navegar entre paneles |
| `Ctrl+Shift+H/J/K/L` | Redimensionar paneles |
| `Cmd+K` | Limpiar pantalla |

### Tmux

| Atajo | Acción |
|---|---|
| `Ctrl+A` | Prefijo de Tmux |
| `Ctrl+A`, `V` | División horizontal conservando el directorio actual |
| `Ctrl+A`, `D` | División vertical conservando el directorio actual |
| `Alt+G` | Abrir o cerrar la sesión flotante `scratch` |
| `Ctrl+A`, `I` | Instalar complementos manualmente con TPM |
| `Ctrl+A`, `K` | Cerrar las demás sesiones tras confirmación |

### Fish

La configuración inicializa Starship, FZF, Atuin, Zoxide y FNM solo en sesiones interactivas. También define abreviaciones para Git, navegación, `eza`, pnpm y los clientes `claude` y `opencode`.

Consulta la lista completa en [`fish/config.fish`](./fish/config.fish).

## Recuperación

No existe un desinstalador automático. Para recuperar una configuración anterior:

```bash
cp ~/.config/fish/config.fish.backup ~/.config/fish/config.fish
cp ~/.config/ghostty/config.backup ~/.config/ghostty/config
cp ~/.tmux.conf.backup ~/.tmux.conf
cp ~/.config/starship.toml.backup ~/.config/starship.toml
```

Restaura únicamente las copias de seguridad que existan y que hayas revisado. Los paquetes instalados con Homebrew se eliminan por separado mediante `brew uninstall` o `brew uninstall --cask`.

## Solución de problemas

### `git` abre el instalador de Xcode

Acepta la instalación de las herramientas de línea de comandos, espera a que termine y vuelve a ejecutar el comando inicial.

### Fish no es el intérprete activo

Abre una sesión nueva y comprueba:

```bash
echo "$SHELL"
./install.sh --check
```

En Apple Silicon debe mostrar `/opt/homebrew/bin/fish`.

### Faltan complementos de Tmux

Abre Tmux y ejecuta `Ctrl+A`, seguido de `I`. Después repite la comprobación de estado.

### No aparecen iconos

Comprueba que Ghostty usa `JetBrainsMono Nerd Font Mono` y que la fuente aparece en `~/Library/Fonts` o `/Library/Fonts`.

### No llegan notificaciones

Autoriza a `terminal-notifier` o Ghostty en Ajustes del Sistema → Notificaciones.

## Compatibilidad

- `install.sh` detecta Homebrew en `/opt/homebrew` y `/usr/local`.
- `fish/config.fish` y la orden de inicio de Ghostty usan `/opt/homebrew`, por lo que una Mac Intel requiere sustituir esa ruta por `/usr/local`.
- La copia al portapapeles de Tmux usa `pbcopy` en macOS y `clip` fuera de macOS, pero el instalador completo está diseñado para macOS.

## Límites

- El proyecto instala una configuración personal y reemplaza los cuatro archivos declarados.
- No gestiona secretos ni credenciales.
- No elimina automáticamente paquetes, complementos o configuraciones.
- `sync.sh` asume que todos los archivos de destino existen.
