# Dotfiles — entorno de terminal para macOS

Instala y configura un entorno de terminal basado en Ghostty, Fish, Herdr y Starship. El proceso es repetible y crea copias de seguridad versionadas antes de reemplazar configuraciones existentes.

## Responsabilidades

| Componente | Responsabilidad |
|---|---|
| Ghostty | Representar el terminal, aplicar fuente y tema, y reenviar atajos de macOS |
| Fish | Proporcionar el intérprete interactivo, abreviaciones e integración de herramientas |
| Herdr | Administrar Spaces, tabs, divisiones, procesos persistentes, agentes y notificaciones |
| Starship | Mostrar el indicador de comandos con estado de Git, duración y versiones de entornos |
| Herramientas | `eza`, `fzf`, `atuin`, `zoxide`, `fnm`, `git`, `pnpm` y `terminal-notifier` |

Ghostty inicia Herdr por su nombre en `PATH`. Si Herdr no está disponible, muestra un aviso y abre Fish para que la terminal siga siendo utilizable. Ghostty no administra tabs, divisiones ni restauración de estado: esas funciones pertenecen únicamente a Herdr.

## Requisitos

- macOS en Apple Silicon o Intel.
- Conexión a Internet.
- Una cuenta con permisos para usar `sudo` y cambiar el intérprete con `chsh`.
- Herramientas de línea de comandos de Xcode para `git`. macOS ofrece instalarlas cuando se ejecuta por primera vez.

El instalador añade Homebrew si no está disponible y detecta sus ubicaciones habituales en ambas arquitecturas.

## Camino rápido

Desde la raíz del repositorio:

```bash
cd dotfiles
./install.sh
```

Durante la ejecución pueden aparecer solicitudes de Homebrew, `sudo` o `chsh`. Al terminar:

1. Cierra las ventanas existentes de Ghostty.
2. Abre Ghostty de nuevo.
3. Comprueba que Herdr muestra el Space persistente y que sus paneles usan Fish.

Verifica toda la instalación en cualquier momento:

```bash
./install.sh --check
```

## Qué hace el instalador

| Orden | Acción | Comportamiento al repetirla |
|---:|---|---|
| 1 | Instala Homebrew | Se omite si ya existe |
| 2 | Instala aplicaciones, paquetes y fuente | Homebrew conserva lo que ya está instalado |
| 3 | Registra Fish en `/etc/shells` y lo configura como intérprete predeterminado | Solo cambia lo necesario |
| 4 | Valida y copia las cuatro configuraciones | Crea un backup versionado y reemplaza cada destino |
| 5 | Instala las integraciones de Herdr para OpenCode y Codex | Solo actúa cuando ya existe la carpeta de configuración del cliente |
| 6 | Ejecuta la comprobación de estado | Detecta binarios, fuente, archivos, sintaxis e integraciones desactualizadas |

### Paquetes instalados

```text
Aplicaciones: Ghostty
Fuente:       Geist Mono
Intérprete:   fish
Terminal:     herdr, starship
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
| `herdr/config.toml` | `~/.config/herdr/config.toml` | `~/.config/herdr/config.toml.backup.<fecha>` |
| `starship/starship.toml` | `~/.config/starship.toml` | `~/.config/starship.toml.backup.<fecha>` |

Los backups usan el formato `.backup.YYYYMMDD-HHMMSS`. Si dos ejecuciones coinciden en el mismo segundo, se añade un sufijo numérico; las versiones anteriores se conservan.

## Mantener las configuraciones

El flujo recomendado es editar la configuración activa, sincronizarla al repositorio y revisar las diferencias:

```bash
cd dotfiles
./sync.sh
git diff -- .
```

`sync.sh` copia hacia el repositorio las configuraciones actuales de Ghostty, Fish, Herdr y Starship. Antes de escribir, valida las cuatro fuentes y prepara todas las copias. Si una operación falla, restaura lo que ya hubiera cambiado.

Sin argumentos, la sincronización se detiene si cualquiera de los cuatro archivos del repositorio ya tiene cambios locales. Para reemplazarlos deliberadamente:

```bash
./sync.sh --force
```

Para aplicar en el usuario actual las configuraciones guardadas en el repositorio:

```bash
./sync.sh --apply
```

Este modo crea un backup versionado de cada configuración activa antes de reemplazarla. No instala paquetes; en un ordenador nuevo ejecuta primero `./install.sh`.

## Ajustes locales por ordenador

Puedes añadir opciones que no deban viajar con el repositorio. Estos archivos son opcionales, se cargan después de la configuración compartida y `sync.sh` no los copia:

| Componente | Archivo local |
|---|---|
| Fish | `~/.config/fish/local.fish` |
| Ghostty | `~/.config/ghostty/local` |

Son apropiados para rutas, alias, variables o preferencias exclusivas de un equipo. Su contenido debe ser silencioso e idempotente. No guardes secretos en texto plano salvo que controles expresamente sus permisos y ciclo de vida.

## Atajos principales

### Ghostty

| Atajo | Acción |
|---|---|
| `Cmd+K` | Limpiar la pantalla |
| `Cmd+G` | Enviar `Ctrl+A`, `Alt+G` a Herdr para abrir el terminal emergente; repetirlo en el prompt lo cierra |
| `Shift+Enter` | Enviar una entrada distinguible a aplicaciones compatibles |

Los atajos nativos que crean tabs y divisiones de Ghostty están desactivados para evitar dos capas de organización.

### Herdr

Herdr conserva su mapa de atajos predeterminado; la única personalización general es usar `Ctrl+A` como prefijo. Los atajos con prefijo se ejecutan pulsando `Ctrl+A`, soltándolo y pulsando la segunda tecla.

| Atajo | Acción |
|---|---|
| `Ctrl+A`, `Shift+N` | Crear un Space |
| `Ctrl+A`, `w` | Abrir el selector de Spaces |
| `Ctrl+A`, `Shift+G` | Crear un Space asociado a un Git worktree |
| `Ctrl+A`, `c` | Crear una tab |
| `Ctrl+A`, `v` | Crear una división lateral |
| `Ctrl+A`, `-` | Crear una división inferior |
| `Ctrl+A`, `Shift+R` | Recargar la configuración |
| `Ctrl+A`, `r` | Entrar en el modo de redimensionado |
| `Alt+G` o `Cmd+G` | Abrir el terminal emergente; Ghostty añade el prefijo y repetirlo en el prompt lo cierra |
| `Ctrl+A`, `?` | Mostrar la ayuda de atajos |
| `Ctrl+A`, `q` | Separar el cliente sin detener los procesos |

El cierre mediante `Alt+G` o `Cmd+G` pertenece al Fish del popup. Si hay una aplicación en primer plano dentro del popup, sal primero de ella. Herdr conserva los procesos cuando se cierra la ventana. Al volver a abrir Ghostty, el cliente se conecta a la sesión persistente existente.

### Fish

La configuración inicializa Starship, Atuin, Zoxide y FNM solo en sesiones interactivas y únicamente cuando están disponibles. FZF permanece instalado como herramienta independiente. También define abreviaciones para Git, navegación, `eza`, pnpm y los clientes `claude` y `opencode`.

Consulta la lista completa en [`fish/config.fish`](./fish/config.fish).

## Integraciones de agentes

El instalador ejecuta de forma idempotente las integraciones oficiales de Herdr para:

- OpenCode, si existe `~/.config/opencode`.
- Codex, si existe `~/.codex`.

Si un cliente no está configurado, se omite sin considerar la instalación fallida. Las integraciones comunican a Herdr el estado y la sesión de cada agente; Herdr agrupa los agentes por Space y entrega notificaciones del sistema tras un segundo.

Después de instalar un cliente nuevo, vuelve a ejecutar `./install.sh` para añadir su integración. Comprueba el estado con:

```bash
herdr integration status
./install.sh --check
```

## Recuperación

Para localizar las copias de una configuración, de más reciente a más antigua:

```bash
ls -1t ~/.config/herdr/config.toml.backup.*
```

Revisa la versión elegida y cópiala sobre el archivo activo:

```bash
cp ~/.config/herdr/config.toml.backup.YYYYMMDD-HHMMSS ~/.config/herdr/config.toml
```

Aplica el mismo patrón a Ghostty, Fish o Starship. Después recarga Herdr con `Ctrl+A`, `Shift+R` o reinicia el servidor de manera controlada si fuera necesario. Los paquetes instalados con Homebrew se eliminan por separado mediante `brew uninstall` o `brew uninstall --cask`.

## Solución de problemas

### Ghostty abre Fish sin Herdr

Comprueba que el ejecutable está disponible en `PATH`:

```bash
command -v herdr
./install.sh --check
```

La configuración de Ghostty muestra un aviso antes de usar el intérprete como alternativa.

### Fish no es el intérprete activo

Abre una sesión nueva y comprueba:

```bash
echo "$SHELL"
./install.sh --check
```

La ruta exacta depende de la arquitectura y de la instalación de Homebrew.

### No llegan notificaciones

Autoriza Herdr en Ajustes del Sistema → Notificaciones y confirma que `delivery = "system"` permanece en `~/.config/herdr/config.toml`.

### No aparecen iconos

Comprueba que Ghostty usa `Geist Mono` y que la fuente aparece en `~/Library/Fonts` o `/Library/Fonts`. El paquete administrado por Homebrew es `font-geist-mono`.

## Compatibilidad y límites

- Los scripts detectan Homebrew en Apple Silicon e Intel.
- Ghostty y el popup de Herdr resuelven sus ejecutables mediante `PATH`; no guardan rutas ligadas a un usuario o arquitectura.
- El proyecto instala una configuración personal y reemplaza exactamente los cuatro archivos declarados.
- No gestiona secretos ni credenciales.
- No elimina automáticamente paquetes o configuraciones ajenas a esos cuatro archivos.
