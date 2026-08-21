# Dotfiles — entorno de terminal para macOS

Instala y configura un entorno de terminal completo basado en Ghostty, Fish, Tmux y Starship. El proceso es automático, repetible y crea copias de seguridad versionadas antes de reemplazar configuraciones existentes.

## Resultado

| Componente | Función |
|---|---|
| Ghostty | Emulador de terminal con tema GitHub Dark y fuente Geist Mono |
| Fish | Intérprete interactivo con abreviaciones e integración de herramientas |
| Tmux + TPM | Sesiones persistentes, divisiones, navegación, guardado automático y panel emergente |
| Starship | Indicador de comandos (`prompt`) con estado de Git, duración y versiones de entornos de ejecución |
| Herramientas | `eza`, `fzf`, `atuin`, `zoxide`, `fnm`, `git`, `pnpm` y `terminal-notifier` |

Ghostty arranca el intérprete configurado en `$SHELL` y abre o recupera automáticamente la sesión Tmux `work`. Si Tmux no está disponible, abre el intérprete directamente para no dejar la terminal inutilizable. Los atajos nativos que crean o reabren tabs y divisiones, junto con la restauración de estado de Ghostty, están desactivados: Tmux es el multiplexor y propietario de la persistencia.

## Requisitos

- macOS en Apple Silicon o Intel.
- Tmux 3.5 o posterior. El instalador actualiza una instalación anterior cuando es necesario.
- Conexión a Internet.
- Una cuenta con permisos para usar `sudo` y cambiar el intérprete con `chsh`.
- Herramientas de línea de comandos de Xcode para `git`. macOS ofrece instalarlas la primera vez que se ejecuta el comando.

El instalador añade Homebrew si no está disponible y detecta automáticamente sus rutas habituales en Apple Silicon (`/opt/homebrew`) e Intel (`/usr/local`).

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
| 2 | Instala aplicaciones, paquetes y fuente | Homebrew conserva lo instalado y actualiza Tmux si es anterior a 3.5 |
| 3 | Registra Fish en `/etc/shells` y lo configura como intérprete predeterminado | Solo cambia lo necesario |
| 4 | Instala TPM en `~/.tmux/plugins/tpm` | Conserva la instalación existente |
| 5 | Copia las configuraciones | Crea un backup versionado y reemplaza el destino |
| 6 | Instala los complementos de Tmux | Usa el instalador de TPM, incluso sin una sesión Tmux previa |
| 7 | Ejecuta la comprobación de estado | Detecta binarios, fuente, archivos, complementos o configuraciones desactualizadas |

### Paquetes instalados

```text
Aplicaciones: Ghostty
Fuente:       Geist Mono
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
| `ghostty/config` | `~/.config/ghostty/config` | `~/.config/ghostty/config.backup.<fecha>` |
| `fish/config.fish` | `~/.config/fish/config.fish` | `~/.config/fish/config.fish.backup.<fecha>` |
| `tmux/.tmux.conf` | `~/.tmux.conf` | `~/.tmux.conf.backup.<fecha>` |
| `starship/starship.toml` | `~/.config/starship.toml` | `~/.config/starship.toml.backup.<fecha>` |

Los backups usan el formato `.backup.YYYYMMDD-HHMMSS`; si dos ejecuciones coinciden en el mismo segundo, se añade un sufijo numérico. Las versiones anteriores se conservan.

## Mantener las configuraciones

El flujo recomendado es editar la configuración activa, sincronizarla al repositorio y revisar las diferencias (`diff`):

```bash
cd dotfiles
./sync.sh
git diff -- .
```

`sync.sh` copia hacia el repositorio las configuraciones actuales de Ghostty, Fish, Tmux y Starship. Antes de escribir, valida las cuatro fuentes y prepara todas las copias. Si una operación falla, restaura lo que ya hubiera cambiado.

Sin argumentos, la sincronización se detiene si cualquiera de los cuatro archivos del repositorio ya tiene cambios locales, evitando sobrescribir trabajo pendiente. Tras revisarlos, puedes conservarlos en Git o usar explícitamente el reemplazo deliberado:

```bash
./sync.sh --force
```

Las configuraciones usan `$HOME`, `#{HOME}`, `$SHELL` y detección de Homebrew para no guardar el nombre de usuario, la arquitectura o la ruta de un ordenador concreto.

Para aplicar en el usuario actual las configuraciones guardadas en el repositorio, usa el sentido contrario:

```bash
cd dotfiles
./sync.sh --apply
```

Este modo crea un backup versionado de cada configuración activa antes de reemplazarla. No instala paquetes: en un ordenador nuevo ejecuta primero `./install.sh`.

## Ajustes locales por ordenador

Puedes añadir opciones que no deban viajar con el repositorio. Estos archivos son opcionales, se cargan después de la configuración compartida y `sync.sh` no los copia:

| Componente | Archivo local |
|---|---|
| Fish | `~/.config/fish/local.fish` |
| Ghostty | `~/.config/ghostty/local` |
| Tmux | `~/.tmux.local.conf` |

Son apropiados para rutas, alias, variables o preferencias exclusivas de un equipo. Fish puede leer `local.fish` durante la preparación de Tmux y de nuevo al abrir el intérprete interactivo, así que su contenido debe ser silencioso e idempotente. No guardes secretos en texto plano salvo que controles expresamente sus permisos y ciclo de vida.

## Atajos principales

### Ghostty

| Atajo | Acción |
|---|---|
| `Cmd+K` | Limpiar pantalla |
| `Cmd+G` | Abrir o cerrar la sesión flotante `scratch` mediante Tmux |
| `Shift+Enter` | Enviar una entrada distinguible a aplicaciones compatibles |

Los atajos nativos que crean o reabren tabs y divisiones de Ghostty están desactivados. Usa las ventanas y divisiones de Tmux para evitar dos capas de multiplexación.

### Tmux

| Atajo | Acción |
|---|---|
| `Ctrl+A` | Prefijo de Tmux |
| `Ctrl+A`, `c` | Crear una ventana en el directorio personal |
| `Ctrl+A`, `v` | División horizontal conservando el directorio actual |
| `Ctrl+A`, `d` | División vertical conservando el directorio actual |
| `Ctrl+A`, `r` | Recargar la configuración |
| `Ctrl+A`, `<` / `>` | Mover la ventana hacia atrás o adelante |
| `Alt+G` | Abrir o cerrar la sesión flotante `scratch` |
| `Ctrl+A`, `I` | Instalar complementos manualmente con TPM |
| `Ctrl+A`, `K` | Cerrar las demás sesiones tras confirmación |

### Fish

La configuración inicializa Starship, Atuin, Zoxide y FNM solo en sesiones interactivas y únicamente cuando están disponibles. FZF permanece instalado como herramienta independiente. También define abreviaciones para Git, navegación, `eza`, pnpm y los clientes `claude` y `opencode`.

Consulta la lista completa en [`fish/config.fish`](./fish/config.fish).

## Recuperación

No existe un desinstalador automático. Para localizar las copias de una configuración, de más reciente a más antigua:

```bash
ls -1t ~/.config/fish/config.fish.backup.*
```

Revisa la versión elegida y cópiala sobre el archivo activo:

```bash
cp ~/.config/fish/config.fish.backup.YYYYMMDD-HHMMSS ~/.config/fish/config.fish
```

Aplica el mismo patrón a Ghostty, Tmux o Starship. Los paquetes instalados con Homebrew se eliminan por separado mediante `brew uninstall` o `brew uninstall --cask`.

## Solución de problemas

### `git` abre el instalador de Xcode

Acepta la instalación de las herramientas de línea de comandos, espera a que termine y vuelve a ejecutar el comando inicial.

### Fish no es el intérprete activo

Abre una sesión nueva y comprueba:

```bash
echo "$SHELL"
./install.sh --check
```

En Apple Silicon suele mostrar `/opt/homebrew/bin/fish`; en Intel, `/usr/local/bin/fish`.

### Faltan complementos de Tmux

Abre Tmux y ejecuta `Ctrl+A`, seguido de `I`. Después repite la comprobación de estado.

### No aparecen iconos

Comprueba que Ghostty usa `Geist Mono` y que la fuente aparece en `~/Library/Fonts` o `/Library/Fonts`. El paquete administrado por Homebrew es `font-geist-mono`.

### No llegan notificaciones

Autoriza a `terminal-notifier` o Ghostty en Ajustes del Sistema → Notificaciones.

## Compatibilidad

- `install.sh` detecta Homebrew en `/opt/homebrew` y `/usr/local`.
- Fish detecta Homebrew en ambas ubicaciones y Ghostty usa el intérprete registrado en `$SHELL`; no hay rutas ligadas a un usuario o arquitectura concretos.
- `tmux-yank` gestiona la integración con el portapapeles del sistema; el instalador completo sigue diseñado para macOS.

## Límites

- El proyecto instala una configuración personal y reemplaza los cuatro archivos declarados.
- No gestiona secretos ni credenciales.
- No elimina automáticamente paquetes, complementos o configuraciones.
- La configuración compartida administra cuatro archivos completos; usa los archivos locales opcionales para diferencias específicas de cada ordenador.
