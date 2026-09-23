# Dotfiles — entorno de terminal para macOS

Instala y configura un entorno de terminal basado en Ghostty, Fish, Herdr, Starship y Atuin. El proceso es repetible y reemplaza configuraciones existentes sin crear backups.

## Responsabilidades

| Componente | Responsabilidad |
|---|---|
| Ghostty | Representar el terminal, aplicar fuente y tema, y reenviar atajos de macOS |
| Fish | Proporcionar el intérprete interactivo, abreviaciones e integración de herramientas |
| Herdr | Administrar Spaces, tabs, divisiones, procesos persistentes, agentes y notificaciones |
| Atuin | Buscar en el historial y aplicar sus colores y atajos |
| Starship | Mostrar el indicador de comandos con estado de Git, duración y versiones de entornos |
| Herramientas | `eza`, `fzf`, `fd`, `bat`, `zoxide`, `fnm`, `git`, `pnpm` y `terminal-notifier` |

Ghostty inicia Herdr mediante `fnm exec --using default herdr`, con las rutas de Homebrew en `PATH`. Así Radar recibe Node antes de que se abra Fish y no depende de la versión seleccionada por un proyecto. El instalador prepara Node LTS con fnm si no hay una versión predeterminada disponible. Ghostty administra la apariencia; Herdr administra Spaces, tabs, divisiones y procesos.

## Requisitos

- macOS en Apple Silicon o Intel.
- Conexión a Internet.
- Una cuenta con permisos para usar `sudo` y cambiar el intérprete con `chsh`.
- Herramientas de línea de comandos de Xcode para `git` y `python3` (comprobación del servidor). macOS ofrece instalarlas cuando se ejecuta por primera vez.

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

La comprobación del servidor usa `python3`. Ejecuta `--check` directamente en Fish dentro de Ghostty/Herdr para comprobar también los colores del panel actual. Fuera de Herdr, o si el servidor está detenido, informa de las comprobaciones pendientes.

## Qué hace el instalador

| Orden | Acción | Comportamiento al repetirla |
|---:|---|---|
| 1 | Instala Homebrew | Se omite si ya existe |
| 2 | Instala aplicaciones, paquetes y fuente | Homebrew conserva lo que ya está instalado |
| 3 | Registra Fish en `/etc/shells` y lo configura como intérprete predeterminado | Solo cambia lo necesario |
| 4 | Valida y copia las cinco configuraciones principales | Reemplaza cada destino sin crear backups |
| 5 | Instala Auto Title y Radar con sus preferencias y fuente | Conserva los commits fijados; añade Go o Node.js si faltan |
| 6 | Instala los plugins Fish declarados en `fish/plugins.list` | Añade solo los ausentes; conserva otros plugins y las versiones instaladas |
| 7 | Instala las integraciones de Herdr para OpenCode y Codex | Solo actúa cuando ya existe la carpeta de configuración del cliente |
| 8 | Ejecuta la comprobación de estado | Detecta binarios, fuente, archivos, sintaxis, plugins, integraciones, la versión activa de Herdr y colores desactivados en el panel actual |

### Paquetes instalados

```text
Aplicaciones: Ghostty
Fuente:       JetBrains Mono
Intérprete:   fish
Terminal:     herdr, starship
Navegación:   eza, fzf, fd, bat, zoxide
Historial:    atuin
Entornos:     fnm
Utilidades:   git, pnpm, terminal-notifier
Pestañas:     kryptamine/herdr-auto-title v0.6.2
Agentes:      hhdebb/herdr-radar v1.3.12
Iconos:       Herdr Agent Icons Max (incluida en Radar)
Plugins:      Go para compilar Auto Title; Node.js >=18 en `fnm default` para Radar
```

## Archivos administrados

| Fuente del repositorio | Destino |
|---|---|
| `ghostty/config` | `~/.config/ghostty/config` |
| `fish/config.fish` | `~/.config/fish/config.fish` |
| `herdr/config.toml` | `~/.config/herdr/config.toml` |
| `starship/starship.toml` | `~/.config/starship.toml` |
| `atuin/config.toml` | `~/.config/atuin/config.toml` |
| `herdr/radar.toml` | `~/.config/herdr/plugins/config/hhdebb.herdr-radar/config.toml` |
| `herdr/auto-title.env` | `~/Library/Application Support/herdr-auto-title/config.env` |

`install.sh` y `sync.sh` reemplazan los destinos sin crear backups ni copias para deshacer cambios.

## Mantener las configuraciones

El flujo recomendado es editar la configuración activa, sincronizarla al repositorio y revisar las diferencias:

```bash
cd dotfiles
./sync.sh
git diff -- .
```

`sync.sh` copia hacia el repositorio las configuraciones actuales de Ghostty, Fish, Herdr, Starship y Atuin, más las preferencias de Auto Title y Radar. Normaliza la ruta generada de la barra de Radar para resolverla mediante `XDG_STATE_HOME` o `$HOME` en cada equipo. Incluye también la función Fish `md`. Antes de escribir, comprueba las ocho fuentes y prepara todas las copias. Si falla el reemplazo de un destino, los archivos ya reemplazados conservan los cambios.

Sin argumentos, la sincronización se detiene si cualquiera de los siete archivos del repositorio ya tiene cambios locales. Para reemplazarlos deliberadamente:

```bash
./sync.sh --force
```

Para aplicar en el usuario actual las configuraciones guardadas en el repositorio:

```bash
./sync.sh --apply
```

Este modo reemplaza cada configuración activa sin crear backups. No instala paquetes; en un ordenador nuevo ejecuta primero `./install.sh`.

## Ajustes locales por ordenador

Puedes añadir opciones que no deban viajar con el repositorio. Estos archivos son opcionales, se cargan después de la configuración compartida y `sync.sh` no los copia:

| Componente | Archivo local |
|---|---|
| Fish | `~/.config/fish/local.fish` |
| Ghostty | `~/.config/ghostty/local` |

Son apropiados para rutas, alias, variables o preferencias exclusivas de un equipo. Su contenido debe ser silencioso e idempotente. Guarda credenciales en el llavero del sistema o en el almacén de autenticación de cada herramienta; evita exportarlas como variables universales de Fish.

## Atajos principales

### Ghostty

| Atajo | Acción |
|---|---|
| `Cmd+K` | Limpiar la pantalla |
| `Cmd+G` | Enviar `Ctrl+A`, `Alt+G` a Herdr para abrir el terminal emergente; repetirlo en el prompt lo cierra |
| `Cmd+Alt+←/→` | Pestaña anterior/siguiente de Herdr; reenvía sus atajos existentes `Ctrl+A`, `p/n` |
| `Shift+Enter` | Enviar una entrada distinguible a aplicaciones compatibles |

Los atajos nativos que crean tabs y divisiones de Ghostty están desactivados para evitar dos capas de organización.

### Herdr

Herdr conserva su mapa de atajos predeterminado; la única personalización general es usar `Ctrl+A` como prefijo. Ghostty añade el acceso directo a pestañas con `Cmd+Alt+←/→`. Los atajos con prefijo se ejecutan pulsando `Ctrl+A`, soltándolo y pulsando la segunda tecla.

| Atajo | Acción |
|---|---|
| `Ctrl+A`, `Shift+N` | Crear un Space |
| `Ctrl+A`, `w` | Abrir el selector de Spaces |
| `Ctrl+A`, `Shift+G` | Crear un Space asociado a un Git worktree |
| `Ctrl+A`, `c` | Crear una tab sin preguntar su nombre |
| `Ctrl+A`, `p/n` | Pestaña anterior/siguiente |
| `Ctrl+A`, `v` | Crear una división lateral |
| `Ctrl+A`, `-` | Crear una división inferior |
| `Ctrl+A`, `Shift+R` | Recargar la configuración |
| `Ctrl+A`, `r` | Entrar en el modo de redimensionado |
| `Alt+G` o `Cmd+G` | Abrir el terminal emergente; Ghostty añade el prefijo y repetirlo en el prompt lo cierra |
| `Ctrl+A`, `?` | Mostrar la ayuda de atajos |
| `Ctrl+A`, `q` | Separar el cliente sin detener los procesos |

El cierre mediante `Alt+G` o `Cmd+G` pertenece al Fish del popup. Si hay una aplicación en primer plano dentro del popup, sal primero de ella. Herdr conserva los procesos cuando se cierra la ventana. Al volver a abrir Ghostty, el cliente se conecta a la sesión persistente existente.

La barra lateral muestra los agentes con su estado, Space y título del terminal. La primera fila de cada Space muestra solo su nombre, sin indicador ni separador delante; los logos de agentes pueden ocupar una segunda fila. La esquina derecha de la barra de pestañas queda vacía (`tab_bar_right = []`). Los paneles comparten divisores, sin espacios adicionales. El aviso de copia al portapapeles está desactivado; la copia automática al seleccionar sigue disponible.

Las pestañas usan [Herdr Auto Title](https://github.com/kryptamine/herdr-auto-title) 0.6.2. Las preferencias compartidas desactivan el prefijo numérico, el renombrado de paneles, la rama y el nombre del agente; limitan el título a 32 columnas. [Herdr Radar](https://github.com/hhdebb/herdr-radar) 1.3.12 muestra los agentes y sus estados con iconos y colores, sin separación entre grupos.

### Plugins de Herdr

`herdr/plugins.list` fija el repositorio, la versión y el commit de cada plugin. El instalador descarga esas revisiones; el repositorio guarda las preferencias, sin copiar código de terceros, binarios, sesiones, logs ni cachés.

| Plugin | Preferencias compartidas | Efecto |
|---|---|---|
| `herdr.auto-title` | `herdr/auto-title.env` | Sin números, rama ni nombre de agente; máximo 32 columnas; conserva los nombres de paneles |
| `hhdebb.herdr-radar` | `herdr/radar.toml` | `group_gap = false` |

Para preparar una instalación existente:

```bash
cd dotfiles
./sync.sh --apply
bash herdr/install-plugins.sh
bash herdr/install-plugins.sh --check
```

El instalador guarda las preferencias antes de instalar o habilitar los plugins, e instala la fuente de Radar y su mapa de caracteres en Ghostty. Repetirlo conserva las versiones instaladas si coinciden con los commits fijados. Reemplaza las preferencias existentes sin crear backups. `--check` solo comprueba los plugins, sus revisiones, las preferencias, Node.js predeterminado de fnm y la fuente.

Auto Title lee `~/Library/Application Support/herdr-auto-title/config.env` en macOS, **no** el directorio que muestra `herdr plugin config-dir`. Lee las preferencias al arrancar; cambiar el archivo de un plugin ya activo no reinicia sus procesos. Node.js >=18 debe estar disponible en el `PATH` del servidor Herdr para ejecutar Radar.

Después de editar preferencias locales, `./sync.sh` también las trae al repositorio. Las revisiones de `plugins.list` se actualizan por separado cuando decidas cambiar la versión compartida. Auto Title es el único gestor de títulos incluido. Si otro equipo conserva `aarsh21.tab-title`, detén su watcher con `herdr plugin action invoke aarsh21.tab-title.stop` y elimínalo con `herdr plugin uninstall aarsh21.tab-title`. El instalador no elimina otros plugins, como `herdr-focus-notify`.

### Fish

La configuración inicializa Starship, Atuin y Zoxide solo en sesiones interactivas y únicamente cuando están disponibles. Atuin administra el historial (`Ctrl+R` y flecha arriba); el plugin `fzf.fish` conserva las búsquedas de archivos, Git, procesos y variables. `fd` y `bat` permiten buscar archivos y previsualizarlos. También hay abreviaciones para Git, navegación, `eza`, pnpm y los clientes `claude` y `opencode`.

FNM selecciona Node: las sesiones interactivas habilitan el cambio de versión al cambiar de directorio; los scripts hijos conservan la selección heredada. Un Fish no interactivo con entorno independiente usa la versión predeterminada de FNM. Puedes elegirla con `fnm default <versión-instalada>`; los scripts que necesiten otra versión de proyecto deben seleccionarla explícitamente. La configuración no instala versiones de Node automáticamente.

Los plugins compartidos son Fisher, `fzf.fish` y `done`, declarados en `fish/plugins.list`. El instalador añade los ausentes sin sustituir tu lista personal `~/.config/fish/fish_plugins`; `sync.sh` sincroniza las configuraciones principales, las preferencias de los dos plugins de Herdr, la función `md`. Para añadir los plugins compartidos a una instalación existente:

```bash
fish fish/install-plugins.fish
```

Herdr administra los avisos de agentes y `done` avisa de comandos largos cuando cambias de aplicación. `done` no distingue cambios entre paneles de Herdr. `terminal-notifier` se conserva para estas funciones de Fish.

Consulta la lista completa en [`fish/config.fish`](./fish/config.fish).

### Atuin

`Ctrl+R` y flecha arriba abren el historial. Dentro del buscador, `Ctrl+X` borra la entrada seleccionada y `Option derecho+A` abre las acciones con prefijo de Atuin; `Ctrl+A` permanece reservado para Herdr. Los modos Emacs, Vim insert y Vim normal permiten borrar con `Ctrl+X`, al igual que el inspector.

La configuración mantiene el resaltado de sintaxis y desactiva la sincronización automática de Atuin con `auto_sync = false`: cada ordenador conserva su historial local. `sync.sh` copia únicamente `config.toml`; las bases de datos, las sesiones y las claves de cifrado quedan fuera del repositorio. Atuin lee los cambios al abrir el buscador.

Las rutas de datos de Atuin se resuelven con sus valores predeterminados en cada equipo; no se guarda ninguna ruta personal en esta configuración. En un ordenador que ya estuviera conectado a una cuenta de Atuin, ejecuta `atuin logout` para desvincularlo y evitar también una sincronización manual accidental. El archivo compartido no elimina entradas que ya se hubieran descargado anteriormente.

Si ese equipo ya ejecutaba un daemon de Atuin, detén la instancia anterior tras aplicar la configuración con `atuin daemon stop`. Si estaba registrado como servicio de Homebrew, usa también `brew services stop atuin`. La configuración compartida desactiva el daemon y su inicio automático.

## Integraciones de agentes

El instalador ejecuta de forma idempotente las integraciones oficiales de Herdr para:

- OpenCode, si existe `~/.config/opencode`.
- Codex, si existe `~/.codex`.

Si un cliente no está configurado, se omite sin considerar la instalación fallida. Las integraciones comunican a Herdr el estado y la sesión de cada agente; Herdr agrupa los agentes por Space y el plugin gestiona las notificaciones.

Después de instalar un cliente nuevo, vuelve a ejecutar `./install.sh` para añadir su integración. Comprueba el estado con:

```bash
herdr integration status
./install.sh --check
```

## Notificaciones de agentes

La configuración actual usa las notificaciones nativas de Herdr. Radar aporta la representación visual de los estados de los agentes; Auto Title administra los títulos. El instalador ya no instala `herdr-focus-notify` ni `alerter`.

Los permisos de notificación de macOS son locales y no se sincronizan. Tras instalar la fuente de Radar, reinicia Ghostty para cargarla.

## Recuperación

Para recuperar una configuración anterior, consulta su historial en Git y restaura la versión deseada en el repositorio. Después ejecuta `./sync.sh --apply` para aplicarla.

Recarga Herdr con `Ctrl+A`, `Shift+R` o reinicia el servidor de manera controlada si fuera necesario. Los paquetes instalados con Homebrew se eliminan por separado mediante `brew uninstall` o `brew uninstall --cask`.

## Solución de problemas

### Atuin pierde los colores o Herdr sigue usando una versión anterior

Ejecuta `./install.sh --check` directamente desde Fish dentro de Ghostty/Herdr. La comprobación contrasta el cliente con el servidor activo y consulta únicamente `NO_COLOR` y `TERM` del entorno heredado de ese panel. No lee el entorno de otros procesos ni verifica otros paneles.

El healthcheck también revisa los fallos de ejecución de Node registrados por Radar en el servidor. Comprobar Node desde Fish no valida el entorno del servidor.

Cerrar Ghostty solo desconecta el cliente: el servidor y los paneles pueden seguir vivos. Si el diagnóstico requiere un reinicio, termina primero el trabajo de los paneles y reinicia Herdr desde una sesión de terminal con los colores habilitados. No exportes `NO_COLOR` globalmente para toda la sesión.

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

Revisa los permisos de Herdr en Ajustes del Sistema → Notificaciones y el modo de concentración. La configuración compartida ya no desactiva las notificaciones nativas.

### No aparecen iconos

Comprueba que Ghostty usa `JetBrains Mono` y que la fuente aparece en `~/Library/Fonts` o `/Library/Fonts`. El paquete administrado por Homebrew es `font-jetbrains-mono`.

## Compatibilidad y límites

- Los scripts detectan Homebrew en Apple Silicon e Intel.
- Ghostty y el popup de Herdr resuelven sus ejecutables mediante `PATH`; no guardan rutas ligadas a un usuario o arquitectura.
- El proyecto instala una configuración personal y administra los siete archivos de configuración declarados.
- No gestiona secretos ni credenciales.
- No elimina automáticamente paquetes o configuraciones ajenas a esos archivos.

## Apariencia compartida

Ghostty mantiene Material Ocean, fondo `#111522` y texto `#eeeeee`. `title = " "` oculta el texto de la barra superior; `macos-titlebar-style = transparent` conserva los botones. Herdr usa Catppuccin con fondo y acento explícitos para mejorar el contraste de la pestaña activa.

Starship muestra el directorio compacto, la rama violeta y Node verde. La duración aparece desde 2 segundos, sin milisegundos. `md README.md` usa `bat` para leer Markdown con resaltado, paginación y un ancho máximo de 100 columnas (no renderiza Markdown).

La configuración visual y el tema de OpenCode se administran desde `../ms-agent-kit`, no desde dotfiles.

Archivos adicionales administrados por `install.sh` y `sync.sh`:

| Repositorio | Destino |
| --- | --- |
| `fish/functions/md.fish` | `~/.config/fish/functions/md.fish` |

Auto Title necesita reiniciar su proceso para leer sus preferencias; no basta con recargar la configuración de Herdr. Termina el trabajo activo antes de reiniciar el servidor.
