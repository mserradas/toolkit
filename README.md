# Toolkit

Dos instaladores complementarios para reproducir un entorno de trabajo: uno prepara la terminal de macOS y otro configura agentes, skills y workflows para clientes de IA.

## Qué contiene

| Proyecto | Resultado | Plataformas objetivo | Documentación |
|---|---|---|---|
| `dotfiles` | Ghostty, Fish, Tmux, Starship y herramientas de shell | macOS | [Guía de dotfiles](./dotfiles/README.md) |
| `ms-agent-kit` | Agentes `ms-*`, workflows, skills, permisos y configuración portable | OpenCode, Claude Code y Codex | [Guía de ms-agent-kit](./ms-agent-kit/README.md) |

Los proyectos pueden usarse por separado. En una Mac nueva, el orden recomendado es `dotfiles` primero y `ms-agent-kit` después.

## Camino rápido

### 1. Clonar el repositorio

```bash
git clone https://github.com/mserradas/toolkit.git
cd toolkit
```

Si macOS solicita instalar las Xcode Command Line Tools al ejecutar `git`, completa esa instalación antes de continuar.

### 2. Preparar la terminal

```bash
cd dotfiles
./install.sh
```

El instalador añade Homebrew si falta, instala el stack de terminal, configura Fish como shell predeterminado y copia las configuraciones con backup. Al terminar, abre una nueva ventana de Ghostty.

Verifica el resultado:

```bash
./install.sh --check
```

### 3. Preparar Node.js 24

El setup de shell instala `fnm` y `pnpm`. Desde una nueva sesión de Fish:

```bash
fnm install 24
fnm default 24
node --version
```

`ms-agent-kit` requiere Node.js 24 o superior.

### 4. Configurar los clientes de IA

```bash
cd ../ms-agent-kit
pnpm install
pnpm start
```

El asistente permite seleccionar cualquier combinación de OpenCode, Claude Code y Codex, elegir instalación global o por proyecto y revisar el plan antes de escribir.

Para disponer del comando `ms-agent-kit` en cualquier directorio:

```bash
pnpm build
pnpm add -g .
ms-agent-kit
```

Si pnpm indica que su directorio global no está en `PATH`, ejecuta `pnpm setup`, abre una terminal nueva y repite los dos últimos comandos.

## Cómo verificar el workspace

| Componente | Comando | Resultado esperado |
|---|---|---|
| Shell | `dotfiles/install.sh --check` | Binarios, configuraciones, plugins y shell marcados como correctos |
| Catálogo de IA | `ms-agent-kit doctor` | Catálogo y políticas válidos, sin errores |
| Instalación de IA | `ms-agent-kit status --target all --scope user` | Archivos administrados presentes y sin modificaciones |
| Desarrollo de IA | `pnpm --dir ms-agent-kit test` | Suite completa en verde |

## Seguridad y recuperación

Los dos instaladores preservan el estado anterior, pero utilizan mecanismos distintos:

| Proyecto | Protección | Recuperación |
|---|---|---|
| `dotfiles` | Copia cada configuración existente como `<archivo>.backup` antes de reemplazarla | Restauración manual desde el archivo `.backup` |
| `ms-agent-kit` | Mantiene estado de propiedad y backups con permisos `0600` en `.ms-agent-kit` | `uninstall` restaura archivos originales si no fueron modificados después |

Revisa siempre el diff o el plan antes de forzar reemplazos. Ningún proyecto está diseñado para almacenar credenciales, claves API o archivos `.env`.

## Mantenimiento

### Configuración de shell

Después de cambiar una configuración instalada:

```bash
cd dotfiles
./sync.sh
git diff -- .
```

### Configuración de IA

Después de cambiar el catálogo, adaptadores o CLI:

```bash
cd ms-agent-kit
pnpm run check
pnpm test
pnpm build
```

Si el paquete está instalado globalmente desde este repositorio, vuelve a ejecutar `pnpm add -g .` para actualizar el comando.

## Estructura

```text
toolkit/
├── dotfiles/       # Instalador y configuración del entorno de terminal
├── ms-agent-kit/   # Instalador de agentes y configuración de clientes de IA
└── README.md       # Punto de entrada y orden recomendado
```

Para requisitos, operaciones de recuperación y troubleshooting, consulta el README específico de cada proyecto.
