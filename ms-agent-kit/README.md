# ms-agent-kit

Instalador de consola para distribuir una configuración reproducible de agentes, flujos de trabajo, habilidades reutilizables (`skills`) y permisos en OpenCode, Claude Code y Codex.

El instalador calcula un plan antes de escribir, conserva el estado de propiedad y crea copias de seguridad cuando adopta archivos existentes. No instala los clientes de IA, no configura cuentas y no guarda credenciales.

## Resultado

| Cliente | Componentes instalados | Integración principal |
|---|---|---|
| OpenCode | 12 agentes, 2 comandos `/ms-*` y 7 `skills` generales | Configuración, interfaz de terminal (`TUI`), Context7, statusline de subagentes y permisos por agente |
| Claude Code | 12 subagentes, 2 habilidades invocables (`slash skills`) `/ms-*` y 7 `skills` generales | Límites de herramientas y protección compartida `PreToolUse` |
| Codex | 11 agentes especialistas, 2 comandos como `skills` y 7 `skills` generales | Perfiles, reglas de seguridad, Context7 y `$ms-architect` como orquestador padre |

El catálogo actual incluye 12 agentes, 2 comandos y 7 `skills` generales. En Codex, `ms-architect` se instala como `skill` de la tarea principal para que pueda delegar directamente en los 11 especialistas.

## Ciclo de trabajo

`ms-architect` conserva el único plan y delega misiones focales. Cada worker lee lo necesario, aplica un parche coherente si su rol escribe, realiza la comprobación focal que corresponda y devuelve evidencia compacta; no mantiene un `TODO` paralelo. El arquitecto nombra un solo `verification_owner`: `implementer | ms-tester | none`. Usa `implementer` para gates cubiertos por `ms-codex` o `ms-fastlane`, `ms-tester` si queda un gate independiente pendiente y `none` para tareas sin ejecución verificable. Un `PASS` vigente puede ser ejecutado o reutilizado mientras ninguna escritura posterior lo invalide.

Las misiones se preparan para unas 8–12 iteraciones. Si el primer presupuesto se agota, se divide o reduce el trabajo pendiente en lugar de repetir la misma delegación. Los presupuestos especiales son: `ms-fastlane` 12, `ms-scout` 12 y `ms-tester` 16; los demás subagentes usan 20.

`.agents/docs/` es memoria de trabajo versionada, con retención y disposición controladas; consulta [Artefactos del flujo](#artefactos-del-flujo).

## Idioma de la documentación

Los agentes ms-* escriben en español neutro y profesional toda la prosa humana de documentos nuevos o actualizados, aunque el repositorio use otro idioma. Esto incluye títulos, metadatos, explicaciones, requisitos, decisiones, criterios de aceptación, tablas, changelog y notas de publicación.

Los literales técnicos permanecen intactos: identificadores, rutas, comandos, APIs, métodos y status HTTP, schemas/campos, variables de entorno, librerías, valores de enum o estado, logs, errores, citas textuales, terminología técnica canónica del proyecto y tokens estructurales exigidos por formatos o tooling. Por ejemplo, `## Functional summary` se convierte en `## Resumen funcional` y se escribe «Estado: Aprobada», mientras `selected_status`, `POST /submissions`, `completed`, `feature`, `runtime`, `schema`, `endpoint`, `benchmark` y encabezados canónicos como `[Unreleased]` o `Added` permanecen literales. Al tocar un documento existente en inglés, el agente normaliza al español toda su prosa humana para evitar secciones mezcladas.

## Requisitos

- Node.js 22 o superior.
- `pnpm` para instalar dependencias y trabajar desde el repositorio.
- Al menos uno de estos clientes ya instalado: OpenCode, Claude Code o Codex.
- Codex `0.138.0` o superior si se selecciona ese cliente.
- Conexión a Internet para instalar dependencias; la interfaz de consola (`CLI`) no la necesita para operar sobre el catálogo local.

`ms-agent-kit` configura clientes existentes. No instala sus binarios ni gestiona cuentas, proveedores o claves API.

## Camino rápido

Desde este directorio:

```bash
pnpm install
pnpm start
```

El asistente guía el proceso:

1. Selecciona uno o varios clientes.
2. Elige instalación global o de proyecto.
3. Revisa un resumen vertical de clientes, alcance, cambios, conflictos y estado.
4. Confirma únicamente si hay cambios que aplicar.
5. Resuelve cada conflicto conservando, reemplazando con copia de seguridad u omitiendo el archivo.

Si todo está actualizado, el asistente termina sin pedir una confirmación innecesaria.

### Instalarlo como aplicación de consola

Para ejecutar `ms-agent-kit` desde cualquier directorio sin depender de `pnpm start`:

```bash
pnpm build
pnpm add --global .
ms-agent-kit
```

Cuando cambie el código de la interfaz de consola, repite `pnpm build` y `pnpm add --global .` para actualizar la instalación global.

## Verificar la instalación

```bash
ms-agent-kit doctor
ms-agent-kit plan --target all --scope user
ms-agent-kit status --target all --scope user
```

| Comando | Qué confirma |
|---|---|
| `doctor` | Catálogo, políticas, duplicados y reglas de secretos válidos |
| `plan` | Cambios previstos sin escribir archivos |
| `status` | Archivos administrados presentes, modificados o ausentes |

Añade `--json` a cualquiera de ellos para obtener una salida apta para automatización.

## Elegir el alcance

| Cliente | `--scope user` | `--scope project` |
|---|---|---|
| OpenCode | `~/.config/opencode` | `opencode.json` y `tui.json` en la raíz; artefactos en `.opencode/` |
| Claude Code | `~/.claude` | `<proyecto>/.claude` |
| Codex | `~/.codex` | `<proyecto>/.codex` y `<proyecto>/.agents/skills` |
| Estado del kit | `~/.ms-agent-kit` | `<proyecto>/.ms-agent-kit` |

El alcance de usuario deja la configuración disponible en cualquier espacio de trabajo. El alcance de proyecto la mantiene dentro de un repositorio concreto:

```bash
ms-agent-kit install \
  --target opencode,claude,codex \
  --scope project \
  --project /ruta/al/repositorio
```

Si se omite `--project`, el directorio actual se usa como raíz del proyecto.

## Artefactos del flujo

Versiona los artefactos activos que todavía explican una decisión o comportamiento vigente. `.agents/docs/` es memoria de trabajo, no un almacén permanente: al cerrar un flujo se conserva, promueve o propone retirar cada documento con una razón observable. La carpeta `docs/` queda reservada para documentación dirigida a usuarios y desarrolladores, como guías, API, changelog y notas de versión.

| Artefacto | Ruta canónica | Uso |
|---|---|---|
| Discovery | `.agents/docs/discovery/` | Notas tempranas, supuestos y experimentos |
| PRD | `.agents/docs/prd/` | Problema, alcance y requisitos de producto |
| Spec | `.agents/docs/spec/` | Comportamiento observable y criterios verificables |
| TDD | `.agents/docs/design/` | Decisiones y diseño técnico |
| Histórico | `.agents/docs/archive/` | Trazabilidad justificada; no es una fuente activa ni un vertedero |

### Ciclo de vida práctico

| Tipo | Mientras aporta | Al dejar de aportar |
|---|---|---|
| Discovery | Temporal; conserva supuestos y evidencia aún no absorbida | Sintetiza lo útil en el PRD y propone eliminar la nota, salvo evidencia única |
| PRD | Activo mientras siga vigente la decisión de producto | Conserva solo el rationale útil; propone archivo únicamente con razón histórica |
| Spec | Activa y actualizada mientras describa comportamiento soportado | Propone archivo o eliminación según la trazabilidad necesaria |
| TDD | Activo durante diseño e implementación | Promueve decisiones duraderas a la convención existente y propone eliminarlo; si no hay destino autorizado, lo compacta y reporta el gap |

En cada combinación de tipo + `Feature ID` + `Contexto` debe existir como máximo un artefacto activo. `Feature ID` usa un ticket o ID explícito si existe; si no, usa el slug canónico inicial y queda congelado para todas las fases. `Contexto` distingue `global`, `branch:<ref>` y `release:<versión>`, y puede omitirse solo para `global`. Los demás enlazan `Reemplazado por` o se reportan como candidatos de disposición. Todo artefacto mantenido usa estos metadatos mínimos:

- `Feature ID`, `Estado` y `Última revisión`.
- `Contexto` cuando no sea `global`.
- `Retención: Activa | Temporal | Histórica`.
- `Revisar cuando` para `Temporal` e `Histórica`, salvo retención legal indefinida justificada.
- `Ámbito afectado` cuando pueda vincularse con contratos, rutas o símbolos; un PRD no inventa internals.
- `Implementado en` y `Reemplazado por` solo cuando apliquen.
- Motivo de retención obligatorio cuando `Retención` es `Histórica`.

Al cerrar un flujo nivel 3–4, `ms-architect` informa una de cuatro clasificaciones: `mantener activo`, `promover`, `archivar propuesto` o `eliminar propuesto`, junto con razón y evidencia. Fastlane y nivel 2 claro no crean un subflujo documental. Archivar, mover o eliminar siempre requiere autorización explícita; ningún agente lo ejecuta automáticamente.

### Casos de mantenimiento

| Situación | Acción |
|---|---|
| Trabajo pausado, cancelado, abandonado o reemplazado | Aplica el gate nivel 3–4; si continuará, mantiene `Temporal` con un evento observable |
| Ramas o releases divergentes | Separa por `Contexto` y reporta conflicto; no combina ni retira automáticamente |
| Drift posterior | Si se toca `Ámbito afectado` o se cumple `Revisar cuando`, exige revisión antes de reutilizar |
| Referencia o promoción | Comprueba destino, ciclos, identidad, evidencia y ausencia de duplicación activa |
| Mutación autorizada | Lista acciones/rutas exactas, obtiene autorización vigente, ejecuta un solo lote y revisa diff/referencias; cualquier cambio relevante invalida la autorización |
| PRD o discovery desactualizado | Emite `handoff_required`; el usuario ejecuta el handoff o acepta la deuda documental |

Para mantenimiento explícito, usa como argumento completo `/ms-status docs` o `/ms-status maintenance`: lista solo cabeceras, metadatos y enlaces, y lee cuerpos únicamente ante conflicto. Otros argumentos, como `docs-api`, mantienen la inspección focal.

### Cómo selecciona los artefactos `ms-architect`

1. Si el usuario indica una ruta, `ms-architect` usa esa referencia. Si no existe, detiene el flujo y lo informa; no la sustituye silenciosamente.
2. Sin una ruta explícita, busca un candidato único por `feature slug` dentro del directorio canónico.
3. Si encuentra varios candidatos, usa estado y trazabilidad. No decide por fecha ni `mtime`.
4. Lee solo el artefacto activo y sus referencias directas. No carga todo `.agents/docs/` ni ejecuta `ms-project-init` para resolver una ruta ya conocida.
5. Si la petición vigente, el PRD, la spec o el TDD se contradicen, reporta el drift antes de avanzar.

Un PRD con estado `Borrador` o `En revisión` no autoriza una implementación. Los artefactos con `Retención: Histórica`, estado `Archivado` o `Reemplazado`, o guardados en `.agents/docs/archive/`, no se usan como entrada activa.

Cuando una delegación depende de estos documentos, recibe las rutas ya resueltas para evitar búsquedas repetidas:

```yaml
artifact_inputs:
  feature_id: "feature-id-estable"
  context: "global"
  prd: ".agents/docs/prd/feature-2026-09-01.md"
  spec: ".agents/docs/spec/feature.md"
  design: null
```

### Proyectos con rutas anteriores

Las carpetas `docs/discovery`, `docs/prd`, `docs/spec`, `docs/design` y `docs/archive` se consideran legacy. El kit no las mueve automáticamente ni escribe nuevos artefactos en ellas.

Antes de migrarlas:

1. Comprueba si ya existe un documento equivalente en `.agents/docs/`.
2. Conserva un único artefacto activo por objetivo y actualiza sus referencias.
3. Propón mover a `.agents/docs/archive/` solo los documentos con valor histórico explícito y motivo de retención.
4. Mueve o elimina únicamente después de obtener autorización explícita y revisar el diff.

Después de actualizar estas fuentes, vuelve a instalar la configuración para que los clientes reciban los contratos nuevos y ejecuta `ms-agent-kit doctor` para comprobar la instalación.

## Comandos

| Comando | Función |
|---|---|
| `ms-agent-kit` | Abre el asistente interactivo |
| `ms-agent-kit list` | Lista agentes, flujos de trabajo, `skills` y complementos incluidos |
| `ms-agent-kit doctor` | Valida el catálogo y la instalación administrada |
| `ms-agent-kit plan` | Clasifica los cambios sin aplicarlos |
| `ms-agent-kit install` | Aplica el plan de forma transaccional |
| `ms-agent-kit status` | Compara la instalación con el catálogo actual |
| `ms-agent-kit uninstall` | Elimina archivos propios y restaura copias de seguridad válidas |

### Opciones comunes

| Opción | Uso |
|---|---|
| `--target opencode\|claude\|codex\|all` | Selecciona clientes; admite comas o repeticiones |
| `--scope user\|project` | Selecciona instalación global o local |
| `--permission-profile balanced\|strict\|trusted` | Selecciona la política de permisos de OpenCode; `balanced` es la predeterminada |
| `--project <ruta>` | Define la raíz para el alcance de proyecto |
| `--home <ruta>` | Usa un directorio personal alternativo, útil para pruebas o `dotfiles` |
| `--assets <ruta>` | Usa un catálogo de recursos (`assets`) alternativo |
| `--force` | Reemplaza conflictos elegibles; restaura solo bloques administrados inequívocos |
| `--yes` | Evita preguntas interactivas |
| `--dry-run` | Convierte `install` en una inspección sin escrituras |
| `--json` | Devuelve salida estructurada |

Ejemplos habituales:

```bash
# Revisar antes de instalar
ms-agent-kit plan --target all --scope user

# Instalar solo Claude Code y Codex
ms-agent-kit install --target claude,codex --scope user

# Automatización sin interacción ni escrituras
ms-agent-kit install --target all --scope user --yes --dry-run --json

# Desinstalar la configuración administrada de un proyecto
ms-agent-kit uninstall --target all --scope project --project /ruta/al/repositorio
```

### Contrato para automatización

Con `--json`, los resultados correctos se escriben en `stdout`. Los errores se escriben en `stderr` con una forma estable:

```json
{
  "ok": false,
  "code": "OPERATION_LOCKED",
  "message": "Ya hay una operación install en curso (PID 1234)",
  "details": {}
}
```

`details` solo aparece cuando existe contexto estructurado adicional. Los códigos de salida son:

| Código | Significado |
|---:|---|
| `0` | Operación completada |
| `1` | Fallo operativo no clasificado o diagnóstico con problemas |
| `2` | Argumentos inválidos o interacción requerida |
| `3` | Conflicto de instalación u otra operación posee el bloqueo |
| `4` | Estado persistido incompatible o inseguro |
| `130` | Operación interrumpida por `SIGINT` |
| `143` | Operación terminada por `SIGTERM` |

`install` y `uninstall` adquieren un bloqueo exclusivo dentro de `.ms-agent-kit` para cada alcance. Un segundo proceso falla sin escribir; un bloqueo bien formado de un proceso que ya no existe se recupera automáticamente. Si el bloqueo está corrupto, el kit lo conserva y solicita revisión manual en lugar de asumir su propiedad. `plan`, `status`, `doctor` y `install --dry-run` siguen siendo operaciones de lectura y no adquieren el bloqueo.

Al recibir `SIGINT` o `SIGTERM`, una mutación se detiene en el siguiente límite seguro, revierte los destinos ya modificados y libera el bloqueo antes de devolver el código de salida correspondiente. La reversión no se cancela a mitad de camino.

## Uso por cliente

Los tres clientes comparten el contrato de roles y evidencia, pero materializan modelos, presupuestos y permisos de forma distinta:

| Cliente | `ms-fastlane` | Presupuesto de misión | Permisos |
|---|---|---|---|
| OpenCode | `openai/gpt-5.6-luna`, `variant: low` | Materializado por el cliente | Perfiles `balanced`, `strict` y `trusted` con permisos granulares por rol |
| Claude Code | Haiku, esfuerzo bajo | `toolCycleBudget` materializado | Límites de herramientas y protección compartida `PreToolUse` |
| Codex | Modelo heredado, razonamiento bajo | Política de prompt; actualmente no hay hard turn budget | Perfiles y reglas que pueden quedar subordinados a la tarea padre o a la configuración global |

### OpenCode

OpenCode conserva comandos y menciones de agentes:

```text
/ms-status mi-cambio
@ms-scout localiza el flujo de autenticación
```

La instalación global administra `opencode.json`, `tui.json`, agentes, comandos y `skills`. Conserva `opencode-subagent-statusline` como complemento de la TUI, desactiva las notificaciones propias de OpenCode y no declara `@mohak34/opencode-notifier`; no hay plugins TypeScript locales ni interceptores del ciclo de delegación.

Context7 lee la clave desde el entorno y no la persiste en el catálogo:

```bash
# Bash o Zsh
export CONTEXT7_API_KEY="tu-clave"

# Fish, persistente para el usuario
set -Ux CONTEXT7_API_KEY "tu-clave"
```

Cuando OpenCode convive con Codex o Claude Code, evita que cargue adaptaciones externas incompatibles:

```bash
# Bash o Zsh
export OPENCODE_DISABLE_EXTERNAL_SKILLS=1

# Fish, persistente para el usuario
set -Ux OPENCODE_DISABLE_EXTERNAL_SKILLS 1
```

Esta variable evita importar adaptaciones externas incompatibles. Las `skills` administradas por `ms-agent-kit` se instalan directamente en la raíz nativa de OpenCode y no dependen de un plugin local.

OpenCode admite tres perfiles de permisos. `balanced` reserva el plan y `todowrite` para `ms-architect`; los workers no mantienen listas `TODO`. Usa allowlists silenciosas para roles acotados; solo `ms-codex` pregunta por comandos locales desconocidos o cambios de dependencias, y `ms-debugger` por logs potencialmente sensibles. Operaciones destructivas, push, SSH y gestores del sistema se bloquean directamente. `strict` conserva la política cerrada sin herramientas cognitivas adicionales. `trusted` reduce confirmaciones para comandos, pero mantiene los bloqueos explícitos de secretos, destrucción, publicación y límites de escritura. Por ejemplo:

```bash
ms-agent-kit install --target opencode --scope user --permission-profile balanced
```

Las restricciones comunes de secretos tienen una única definición en el código. El instalador las escribe en `opencode.json` para agentes externos y también al final de cada frontmatter `ms-*`, después de los permisos funcionales del rol. Así, las reglas `deny` prevalecen sobre permisos amplios como `cat *` según el orden efectivo de OpenCode.

### Claude Code

Los flujos de trabajo se exponen como habilidades invocables (`slash skills`) y ejecutan el agente correspondiente en un contexto aislado:

```text
/ms-status mi-cambio
```

También se puede iniciar una sesión completa con el arquitecto:

```bash
claude --agent ms-architect
```

Los ganchos (`hooks`) se aplican a los agentes `ms-*` y sus flujos de trabajo. En ese contexto, la configuración compartible del proyecto en `<project>/.claude/settings.json` sigue disponible por esta capa; en cambio, se deniega el acceso a cualquier `.claude/settings.local.json`, a `~/.claude/settings.json` y a cualquier `.git/config`. También se deniega toda invocación de `git config`, incluso para lectura.

Estos ganchos administrados no alteran las sesiones normales de Claude, que conservan la configuración del usuario.

### Codex

Codex ejecuta los flujos de trabajo como `skills` desde la tarea principal:

```text
$ms-architect implementa este cambio
$ms-status mi-cambio
```

Cada especialista recibe un perfil de sistema de archivos, razonamiento y búsqueda web. Una configuración global de `sandbox_mode` o los permisos de la tarea principal pueden prevalecer sobre esos perfiles.

`ms-agent-kit` registra Context7 como servidor MCP remoto mediante un bloque delimitado en `~/.codex/config.toml` o en `.codex/config.toml`, según el alcance. Codex solo carga la capa `.codex/config.toml` de proyecto cuando el repositorio está marcado como confiable; por eso `codex mcp get context7` o `codex mcp list` pueden no mostrarla dentro de un fixture o repositorio no confiable. El bloque referencia `CONTEXT7_API_KEY` por nombre en `env_http_headers`; nunca lee ni persiste su valor:

```toml
[mcp_servers.context7]
url = "https://mcp.context7.com/mcp"
env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }
```

Si ya existe una tabla Context7 externa equivalente, el instalador la respeta sin modificarla ni asumir propiedad. Una tabla distinta o ambigua se protege como conflicto, incluso con `--force`. Al desinstalar, el kit retira únicamente su bloque y conserva byte a byte el resto de `config.toml`.

Para obtener la cuota autenticada, define `CONTEXT7_API_KEY` en el entorno de la aplicación que inicia Codex. Después de instalar o cambiar la variable, reinicia Codex o abre una tarea nueva y comprueba el registro con:

```bash
codex mcp get context7
```

## Plan, conflictos y copias de seguridad

El plan clasifica cada destino antes de escribir:

| Estado | Significado |
|---|---|
| Crear | El archivo no existe y se puede instalar |
| Actualizar | El archivo pertenece al kit y cambió el catálogo |
| Adoptar | El contenido coincide, pero todavía no tiene propiedad registrada |
| Sin cambios | El archivo ya está actualizado |
| Conflicto | Existe contenido ajeno o modificado; requiere una decisión explícita |

Durante actualizaciones también puede proponer eliminar, restaurar, desvincular u omitir artefactos obsoletos.

### ¿Se usa `~/.ms-agent-kit/backups`?

Sí. Es almacenamiento operativo del instalador, no una copia decorativa. Cuando se reemplaza un archivo con `--force` o desde el asistente, el estado guarda la referencia a la copia de seguridad para que `uninstall` pueda restaurar el contenido anterior.

Los bloques administrados dentro de archivos compartidos, como Context7 en `config.toml`, son la excepción: el kit posee solo el rango delimitado y no guarda una copia completa del archivo. `uninstall` retira ese rango únicamente si sigue intacto.

No borres manualmente `~/.ms-agent-kit` mientras existan instalaciones administradas. Si necesitas liberar copias de seguridad, desinstala primero los clientes correspondientes y revisa el resultado.

El mecanismo de seguridad incluye:

- Estado y copias de seguridad con permisos `0600`.
- Validación completa del estado al cargarlo: schema, tipos, hashes, rutas, ownership y campos admitidos.
- Escrituras temporales seguidas de `rename` atómico.
- Reversión (`rollback`) si una operación falla a mitad del plan.
- Bloqueo exclusivo de operaciones mutables con recuperación conservadora de locks obsoletos.
- Rechazo de destinos y copias de seguridad que atraviesen enlaces simbólicos (`symlinks`) no permitidos.
- Preservación de archivos modificados después de la instalación.
- Restauración durante `uninstall` solo cuando el destino sigue siendo seguro.

Ejecuta siempre `plan` antes de usar `--force`.

Si necesitas volver a una versión anterior de `ms-agent-kit` después de instalar el bloque Context7, ejecuta primero `ms-agent-kit uninstall --target codex` con la versión actual. Las versiones antiguas no reconocen el ownership limitado a bloques.

## Seguridad y límites

- El catálogo es cerrado y rechaza patrones comunes de identificadores secretos (`tokens`), claves privadas y credenciales.
- No se empaquetan `.env`, llaveros (`keychains`), cachés, archivos de bloqueo generados, sesiones ni `node_modules`.
- OpenCode recibe permisos granulares por agente y denegaciones para secretos.
- Claude Code recibe límites de herramientas y una protección `PreToolUse` para los componentes `ms-*`.
- Codex recibe perfiles y reglas `execpolicy` de defensa práctica; no sustituyen un entorno aislado (`sandbox`) administrado.
- El kit no instala ni actualiza OpenCode, Claude Code o Codex.
- Los paquetes externos declarados para OpenCode se descargan cuando el propio cliente arranca.

Para una política Codex no eludible hace falta una configuración administrada por el sistema. Las reglas incluidas cubren operaciones y lectores habituales, pero los permisos de la tarea padre y las restricciones globales siguen teniendo prioridad.

## Solución de problemas

### `ms-agent-kit`: comando no encontrado

Si pnpm informa de que el directorio global no está en `PATH`, configura primero el intérprete de comandos:

```bash
pnpm setup
```

Abre una terminal nueva, vuelve al directorio `ms-agent-kit` y ejecuta:

```bash
pnpm build
pnpm add --global .
pnpm bin --global
ms-agent-kit --help
```

Asegúrate de que la ruta mostrada está incluida en `PATH` y abre una terminal nueva.

### La instalación se detiene por conflictos

Inspecciona el plan y el archivo señalado:

```bash
ms-agent-kit plan --target all --scope user
```

Usa `--force` solo si aceptas reemplazarlo. El contenido anterior quedará asociado a una copia de seguridad.

### El proceso no dispone de TTY

Usa el modo no interactivo:

```bash
ms-agent-kit install --target all --scope user --yes
```

### OpenCode muestra `skills` duplicadas o incompatibles

Define `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` y reinicia OpenCode. Esto desactiva importaciones externas; las `skills` administradas por `ms-agent-kit` permanecen en la raíz nativa de OpenCode.

### Context7 no autentica

Comprueba que `CONTEXT7_API_KEY` existe en el entorno de la aplicación desde la que se inicia OpenCode o Codex. Una terminal puede tener la variable mientras una aplicación gráfica no la hereda. No añadas la clave a `opencode.json`, `config.toml` ni al repositorio.

Después de corregir el entorno, reinicia el cliente o abre una tarea nueva. En Codex puedes comprobar que el servidor quedó registrado con `codex mcp get context7`; el valor de la clave no debe aparecer en su configuración.

### Codex no aplica el perfil esperado

Revisa si `~/.codex/config.toml` define un `sandbox_mode` global. Codex puede priorizarlo sobre `default_permissions` y los perfiles instalados.

### El asistente no pide confirmación

Es el comportamiento esperado cuando el plan no contiene cambios. Usa `status` para comprobar que todo sigue actualizado.

## Desarrollo

```bash
pnpm install
pnpm run check
pnpm test
pnpm build
node dist/cli.js doctor
```

Durante el desarrollo, `pnpm start` ejecuta directamente `src/cli.ts`. Después de compilar, los mismos comandos se pueden probar con `node dist/cli.js`.

```text
ms-agent-kit/
├── assets/          # Fuente portable de agentes, flujos de trabajo, skills y reglas
├── src/adapters/    # Materialización específica de cada cliente
├── src/core/        # Catálogo, planificación, estado, permisos e instalación
├── src/interactive/ # Asistente y presentación del plan
├── tests/           # Pruebas unitarias, de integración y capturas de referencia
└── docs/            # Decisiones y documentación técnica complementaria
```

## Referencias

- [Agentes de OpenCode](https://opencode.ai/docs/agents/)
- [Permisos de OpenCode](https://opencode.ai/docs/permissions/)
- [Habilidades (`skills`) de OpenCode](https://opencode.ai/docs/skills)
- [Subagentes de Claude Code](https://code.claude.com/docs/en/sub-agents)
- [Configuración de Claude Code](https://code.claude.com/docs/en/settings)
- [Personalización de Codex](https://learn.chatgpt.com/docs/customization/overview)
- [Subagentes de Codex](https://learn.chatgpt.com/docs/agent-configuration/subagents)
