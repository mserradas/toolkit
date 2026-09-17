# ms-agent-kit

Configuración compartida de agentes, flujos de trabajo y habilidades reutilizables (`skills`) para OpenCode, Claude Code y Codex. El equipo clona este repositorio y ejecuta el instalador con `pnpm start`; no necesita instalar `ms-agent-kit` como comando global.

Una vez instalados los archivos, los agentes funcionan dentro de cada cliente sin ejecutar el instalador. Consulta la [instalación para el equipo](#instalación-para-el-equipo).

El instalador calcula un plan antes de escribir, conserva el estado de propiedad y crea copias de seguridad cuando adopta archivos existentes. No instala los clientes de IA, no configura cuentas y no guarda credenciales.

## Resultado

| Cliente | Componentes instalados | Integración principal |
|---|---|---|
| OpenCode | 12 agentes, 4 comandos `/ms-*` y 11 `skills` generales | Configuración, interfaz de terminal (`TUI`), Context7, Playwright MCP y permisos nativos |
| Claude Code | 12 agentes, 4 habilidades invocables (`slash skills`) `/ms-*` y 11 `skills` generales | Herramientas y permisos heredados |
| Codex | 11 agentes especialistas, 4 comandos como `skills` y 10 `skills` generales del kit | Modelos por agente, Context7, Playwright MCP y `$ms-architect` como orquestador padre |

El catálogo actual incluye 12 agentes, 4 comandos y 11 `skills` generales. En Codex, `ms-architect` se instala como `skill` de la tarea principal para que pueda delegar directamente en los 11 especialistas; `skill-creator` usa la versión nativa del cliente y no se copia desde el kit.

`agent-instructions-design` crea, edita y revisa `AGENTS.md`, `CLAUDE.md` o el archivo equivalente solicitado. `cognitive-doc-design` se ocupa de documentación para personas, incluido un README que explique esos archivos. Cada skill se selecciona por el entregable y su propósito; consulta los [casos de selección](assets/docs/agents.md#skills-generales-instaladas).

## Permisos nativos

El kit no añade políticas de permisos en ninguno de los tres clientes. Conserva los roles como instrucciones y hereda los controles del cliente. Se retiró la opción `--permission-profile`; elimina ese argumento de invocaciones antiguas.

Al actualizar se eliminan las políticas antiguas administradas y sin cambios locales. El instalador conserva configuraciones externas y protege archivos modificados como conflictos; revisa el plan antes de usar `--force`.

## Ciclo de trabajo

`ms-architect` conserva el único plan y delega misiones focales. Cada worker lee lo necesario, aplica un parche coherente si su rol escribe, realiza la comprobación focal que corresponda y devuelve evidencia compacta; no mantiene un `TODO` paralelo. El arquitecto nombra un solo `verification_owner`: `implementer | ms-tester | none`. Usa `implementer` para gates cubiertos por `ms-codex` o `ms-fastlane`, `ms-tester` si queda un gate independiente pendiente y `none` para tareas sin ejecución verificable. Cada gate tiene un propietario; reutilizar un `PASS` exige contrastar código, configuración, dependencias, entorno y archivos sin seguimiento. El commit por sí solo no acredita vigencia.

Las misiones tienen un alcance concreto y continúan mientras haya progreso hasta completar su resultado y verificación. El kit no fija `steps`, `maxTurns` ni contadores de ciclos en las instrucciones. Si aparece un bloqueo real o cambia el alcance, el agente conserva lo válido y devuelve el pendiente al arquitecto. Los límites nativos del cliente siguen vigentes.

Antes de delegar se contrastan comandos, directorio, efectos, servicios y permisos conocidos. El brief conserva evidencia, secciones afectadas y ausencias comprobadas; una sesión pertinente recibe solo el delta. Una denegación de política termina el intento con causa y siguiente acción, sin reformular el comando ni cambiar de intérprete o rol para eludirla. Cuando no condicionen la implementación, las actualizaciones documentales se agrupan al cierre por propietario.

`.agents/docs/` es memoria de trabajo versionada, con retención y disposición controladas; consulta [Artefactos del flujo](#artefactos-del-flujo).

## Entrega Git Y PR

La skill [`ms-git`](assets/skills/ms-git/SKILL.md) concentra el flujo de entrega. El arquitecto la carga bajo demanda; se instala en los tres clientes y también se puede pedir explícitamente:

```text
Usa ms-git para preparar el commit de este cambio, sin ejecutarlo.
Usa ms-git para hacer commit de este cambio.
Usa ms-git para abrir una PR de este cambio hacia develop.
Usa ms-git para abrir la PR de release de la versión 1.4.0.
```

La [convención compartida](assets/skills/ms-git/references/git-conventions.md) se distribuye con la skill: trabajos desde `develop` con PR a `develop`, y releases desde `develop` con PR a `master`. Tú eliges la versión y el tag lo crea GitHub Actions mediante la automatización existente del proyecto. Define también los mensajes de commit y la estrategia de integración. La skill la carga en cada entrega; las instrucciones explícitas del usuario y las excepciones del `AGENTS.md` del proyecto tienen prioridad, sin duplicar las reglas comunes.

Revisa el diff y los cambios ajenos antes de preparar rutas concretas. Para una PR, comprueba remoto, referencia de origen, base, commits y verificaciones; publica la rama y crea o actualiza la PR, sin duplicarla ni hacer merge. Una petición de PR autoriza sus pasos necesarios y no exige elegir un título o confirmar cada comando. La instalación del kit distribuye la convención; no crea ramas permanentes ni instala workflows de release en los proyectos.

Pedir solo implementación termina con cambios listos para revisar; pedir commit no incluye push; pedir push publica commits existentes. `work-unit-commits` define unidades de trabajo y `ms-git` ejecuta su entrega. La skill respeta los permisos del cliente: en el flujo `ms-*` corresponde al arquitecto dentro de los permisos efectivos del cliente.

## GitHub Y CI Con gh

La skill [`ms-github`](assets/skills/ms-github/SKILL.md) permite al arquitecto consultar issues, revisiones y Actions, y crear o editar issues cuando lo pidas. Requiere GitHub CLI instalado y acceso al repositorio; el kit no configura cuentas. La entrega de código sigue en `ms-git`.

```text
Usa ms-github para revisar los checks de la PR 42 en owner/repo.
Investiga el fallo de Actions de la PR 42 y explica la causa.
Crea una issue en owner/repo con el bug que acabamos de reproducir.
```

Dentro de su misión, architect, codex, fastlane, debugger, tester y scout consultan repositorios, issues, PRs, diffs y checks. Todos esos roles también leen ejecuciones, logs, workflows y releases; el arquitecto ejecuta la creación/edición de issues autorizada. Los workers usan su brief sin cargar `ms-github`. Las consultas pertinentes no requieren confirmación por comando.

Los tres clientes usan sus permisos nativos. El kit no añade listas de comandos ni bloqueos a `gh api`, Git o las herramientas de edición. Las modificaciones remotas siguen el alcance solicitado; el cliente decide si necesita aprobación.

Para leer comentarios de revisión puedes usar `gh api --paginate repos/<owner>/<repo>/pulls/<numero>/comments --jq '.[].body'`. Consulta la skill para distinguir lecturas y modificaciones.

## Idioma de la documentación

La instrucción vigente del usuario prevalece sobre `preferences.documentation.language`. Con `inherit` o sin preferencia, se conserva el idioma del documento existente. Para documentos nuevos se usa la convención del repositorio y, si falta, español neutro y profesional.

Una edición puntual no autoriza traducir todo un documento. Los literales técnicos —identificadores, rutas, comandos, APIs, campos, variables de entorno, logs, citas y tokens exigidos por el tooling— permanecen intactos.

## Requisitos

- Node.js 22 o superior.
- `pnpm` para instalar dependencias y trabajar desde el repositorio.
- Al menos uno de estos clientes ya instalado: OpenCode, Claude Code o Codex.
- Codex `0.138.0` o superior si se selecciona ese cliente.
- Conexión a Internet para instalar dependencias; el instalador opera después sobre el catálogo local.

`ms-agent-kit` configura clientes existentes. No instala sus binarios ni gestiona cuentas, proveedores o claves API.

## Instalación para el equipo

Comparte este repositorio. Cada persona lo clona y, desde el directorio `ms-agent-kit`, ejecuta:

```bash
pnpm install --frozen-lockfile
pnpm start
```

El asistente permite elegir clientes y alcance, muestra los cambios y conserva las configuraciones ajenas. Elige **Usuario** para tener los agentes disponibles en todos tus proyectos, o **Proyecto** para instalarlos en un repositorio concreto. Este alcance indica dónde guardar la configuración del cliente; no instala un programa global.

Después, abre el cliente y usa los agentes y skills. No hace falta ejecutar `pnpm start` en cada sesión, añadir el kit al `PATH` ni compilarlo.

### Actualizar

Desde la copia del kit, con tus cambios locales guardados:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm start
```

Selecciona los mismos clientes y alcance. El instalador aplica las diferencias y muestra los conflictos; si todo está actualizado, termina sin pedir confirmación. Abre una sesión nueva del cliente para cargar los cambios.

Los comandos de mantenimiento que siguen se ejecutan desde el directorio `ms-agent-kit`.

## Verificar la instalación

```bash
pnpm start doctor
pnpm start plan --target all --scope user
pnpm start status --target all --scope user
```

| Comando | Qué confirma |
|---|---|
| `doctor` | Integridad del catálogo y de la instalación, disponibilidad local y capacidades comprobables |
| `plan` | Cambios previstos sin escribir archivos |
| `status` | Archivos administrados presentes, modificados o ausentes |

Añade `--json` a cualquiera de ellos para obtener una salida apta para automatización.

`doctor` añade `capabilities` con `id`, `target`, `status`, `evidence` y `action`. Distingue `correcto`, `no disponible`, `incompatible` y `no comprobado`. Comprueba binarios y versiones con argumentos fijos, sin shell, con límite de tres segundos; evita ejecutar binarios del repositorio como diagnóstico implícito. Codex tiene una versión mínima comprobable; para otros clientes, observar una versión no acredita compatibilidad completa.

Un archivo instalado no acredita que el cliente lo haya reconocido. El reconocimiento real de agentes/skills, autenticación de Context7 y disponibilidad remota de modelos quedan `no comprobado` cuando falta evidencia. OpenCode y Codex reciben integración Context7 y Playwright MCP del kit; Claude no recibe ese registro. Los comandos del proyecto se contrastan con las políticas estáticas disponibles, sin ejecutarlos ni probar dependencias del proyecto.

El preflight de comandos cubre los tres clientes y separa la política estática (`policy.decision`), los efectos y el runtime, con fuente y `cwd`. Los efectos pendientes de una receta de Make, Compose, un script o un wrapper no cambian por sí solos una regla `allow` en `deny`. `unknown` señala información no comprobada: no autoriza ni obliga a detener una tarea. El arquitecto contrasta la operación con la revisión vigente, la autorización ya concedida y los límites del cliente; una verificación conocida y autorizada no requiere otra aprobación por ceremonia. Una denegación real conserva su causa y no se elude cambiando el comando o el agente.

`doctor --json` incluye `modelConfiguration` por cliente y rol: `declared` conserva valores y fuentes; `installed` solo se da por comprobado cuando coinciden plan, hashes y estado administrado; `effective` permanece `no comprobado` sin observación de sesión. En Codex, `ms-architect` es una skill de la tarea principal: `declared.appliesToAgent: false` indica que su configuración declarada no impone el modelo o esfuerzo de esa tarea.

El código de salida `1` indica problemas de integridad o fallos comprobados, como un cliente seleccionado ausente, versión Codex incompatible o contexto inválido. Un contexto `stale` requiere refresco y puede figurar como `incompatible` en ese diagnóstico, pero por sí solo no fuerza el código `1`. Los datos no comprobados aparecen como limitaciones y no son un PASS ni provocan por sí solos ese fallo.

### Validar resultados de workers

```bash
pnpm start result validate --file /ruta/respuesta.md --json
```

Valida una respuesta ya guardada con el título `Contrato para ms-architect` y un único bloque terminal `yaml` o `json`. El [contrato compartido](assets/docs/agents-shared.md#contrato-para-ms-architect) conserva los estados y campos anteriores y añade `verification`: cada gate declara propietario, obligatoriedad, comando, resultado, evidencia y contexto. `completed` exige evidencia, bloqueos/preguntas vacíos y `PASS` en los gates obligatorios declarados. Omitir `verification` sigue siendo compatible, pero no acredita cobertura; el padre contrasta los gates esperados.

El YAML cerrado admite campos planos y listas de textos; usa JSON completo o una lista JSON inline para gates anidados. Se rechazan duplicados, formatos ambiguos y entradas fuera de los límites: 65536 caracteres, 100 entradas por lista y 8 niveles JSON. El CLI lee archivos regulares, rechaza symlinks finales y rutas sensibles, y limita la lectura a 256 KiB. No ejecuta comandos del contrato ni acredita la veracidad de referencias. El código `0` indica coherencia y `2` rechazo del contrato o de sus argumentos; `--json` informa además si se declaró `verification`.

La validación desde el repositorio es manual y opcional en los tres clientes. Los workers conservan su contrato y el padre revisa la evidencia; el kit no instala hooks que bloqueen el cierre por formato. La [evaluación manual](assets/evaluations/README.md) compara tareas equivalentes con modelos constantes y métricas opcionales de delegaciones, denegaciones, cortes, duplicaciones y retrabajo. Un valor no observado es `null`; las mejoras de rendimiento requieren medición.

## Elegir el alcance

| Cliente | `--scope user` | `--scope project` |
|---|---|---|
| OpenCode | `~/.config/opencode` | `opencode.json` y `tui.json` en la raíz; artefactos en `.opencode/` |
| Claude Code | `~/.claude` | `<proyecto>/.claude` |
| Codex | `~/.codex` | `<proyecto>/.codex` y `<proyecto>/.agents/skills` |
| Estado del kit | `~/.ms-agent-kit` | `<proyecto>/.ms-agent-kit` |

El alcance de usuario deja la configuración disponible en cualquier espacio de trabajo. El alcance de proyecto la mantiene dentro de un repositorio concreto:

```bash
pnpm start install \
  --target opencode,claude,codex \
  --scope project \
  --project /ruta/al/repositorio
```

Si se omite `--project`, el directorio actual se usa como raíz del proyecto.

### Configurar verificaciones de un proyecto

Puedes conservar comandos revisados y directorios de resultados en `~/.ms-agent-kit/config.yaml`. Es información opcional para los roles `ms-codex`, `ms-fastlane` y `ms-tester`; no concede ni restringe permisos y no necesitas registrar cada comando para ejecutarlo.

```yaml
schemaVersion: 1
models: {}
verification:
  projects:
    - root: /ruta/al/proyecto
      commands:
        - make verify
        - docker compose -f compose.test.yml run --rm tests
      outputPaths:
        - coverage
        - test-results
```

El kit valida las formas de verificación y las rutas admitidas por este formato; no audita los efectos de scripts o servicios. La entrada se incorpora como instrucciones solo al instalar con `--scope project` en esa raíz exacta. `outputPaths` admite directorios convencionales de reportes/cachés, también bajo módulos, como `packages/web/coverage`.

```bash
pnpm start install --target all --scope project --project /ruta/al/proyecto
```

Los permisos efectivos y el aislamiento de subprocesos corresponden a la configuración de cada cliente.

## Contexto opcional de un proyecto

Los agentes leen manifests, scripts y documentación con las herramientas del cliente. `ms-project-init` prepara un snapshot conversacional y reutiliza `.agents/project.yaml` cuando existe; no exige crearlo ni ejecutar el instalador para empezar a trabajar.

Si quieres guardar contexto entre clientes, puedes generarlo manualmente desde el directorio del kit, indicando el repositorio de destino:

```bash
pnpm start project init --project /ruta/al/proyecto
pnpm start project inspect --project /ruta/al/proyecto --json
```

`init` crea `.agents/project.yaml`; repetirlo actualiza el contexto generado y conserva las preferencias y comentarios humanos. Si no cambia nada, conserva el archivo byte a byte. `inspect` solo lee y devuelve `missing`, `current` o `stale`, junto con `changedSources`; un YAML inválido produce un error explícito. Añade `--dry-run --json` a `project init` para revisar sin escribir.

La detección lee manifests y lockfiles de Node y Python, además de módulos inmediatos en `apps`, `packages` y `services`, con un máximo de 64 módulos. No ejecuta scripts ni instala dependencias. Un stack desconocido deja las listas correspondientes vacías; debe completarse la investigación de la tarea cuando haga falta. Un contexto `current` tampoco acredita que tests anteriores sigan vigentes.

Este ejemplo muestra el schema completo para un proyecto todavía sin manifest reconocido; solo `preferences` se edita a mano:

```yaml
schemaVersion: 1
preferences:
  documentation:
    language: inherit
    paths: [documentation/guides]
  technicalSkills: []
context:
  stack: []
  packageManager: null
  modules: []
  commands:
    test: []
    lint: []
    typecheck: []
    build: []
    format: []
  sources: []
```

Al detectar módulos, `modules` contiene objetos como `{path: apps/web, stack: [node]}`. Cada comando incluye `command`, `cwd` y `source`; por ejemplo, `pnpm run test`, `apps/web` y `apps/web/package.json`. Cada fuente contiene `path` y un `sha256` calculado por el kit. No inventes hashes ni edites esos hechos generados: cambia las fuentes y repite `project init`.

`documentation.paths` admite directorios relativos explícitos, sin globs, rutas absolutas, escapes ni directorios internos o secretos. Indica destinos documentales de `ms-writer` como instrucciones en los tres clientes, sin generar concesiones de acceso. Para incorporar esas rutas, instala con `--scope project` después de editarlas. La instalación `--scope user` permanece genérica. Los archivos humanos `AGENTS.md` y `CLAUDE.md` no se sobrescriben.

`technicalSkills` selecciona nombres o rutas relativas de skills técnicas existentes; también pueden indicarse como `skill_inputs` en el brief. `ms-codex`, `ms-fastlane` y `ms-tester` cargan solo las pertinentes mediante el catálogo nativo. La selección no instala skills ni dependencias, no habilita coordinación y no permite al tester escribir código. Los protocolos de coordinación quedan fuera de la misión de esos roles.

El schema es estricto: versiones, claves o tipos desconocidos, aliases YAML y archivos inseguros se rechazan conservando el contenido. Desinstalar el kit no elimina `.agents/project.yaml`.

## Elegir modelos por agente

La configuración personal opcional se lee desde `~/.ms-agent-kit/config.yaml` en ambos alcances. `--home` permite otra raíz. Por ejemplo:

```yaml
schemaVersion: 1
models:
  ms-codex:
    opencode:
      model: openai/gpt-5.6-sol
      reasoningEffort: high
    claude:
      model: sonnet
      reasoningEffort: medium
    codex:
      model: gpt-5.6-sol
      reasoningEffort: high
  ms-writer:
    codex:
      reasoningEffort: medium
  ms-fastlane:
    claude:
      model: haiku
      reasoningEffort: low
```

Cada clave de `models` es el nombre de un agente del kit, como `ms-codex`, `ms-writer` o `ms-fastlane`. Guarda solo los valores que quieras distinguir de los defaults; al omitirlos, seguirán los futuros cambios del catálogo. Cada override afecta solo al agente y cliente indicados; `model` y `reasoningEffort` son opcionales e independientes. Los defaults se definen por agente en [el catálogo](src/core/agent-catalog.ts). El esfuerzo admite únicamente `low`, `medium` o `high`. No guardes claves ni credenciales aquí.

`schemaVersion: 1` se conserva, pero las claves antiguas `strong`, `balanced`, `light` y `fast` ya no se admiten dentro de `models`: sustitúyelas manualmente por los nombres de los agentes que quieras configurar. Sin archivo o con `models: {}` se mantienen los defaults actuales.

`pnpm start plan --target all --json` añade `models[cliente][agente]` sin retirar `items` ni `statePath`. Cada entrada muestra modelo, esfuerzo y procedencia independiente: `default` del kit, `override` personal o `inherited` del cliente. `availability: unchecked` significa que no se verificó el acceso real al modelo. Sin override, Codex hereda modelo y configura esfuerzo; Claude hereda ambos salvo fastlane; OpenCode usa los defaults del kit. Un identificador inválido falla antes de instalar; el kit no sustituye silenciosamente un modelo ni elige proveedores automáticamente.

Los adaptadores generan `model`/`variant` en OpenCode, `model`/`effort` en Claude y `model`/`model_reasoning_effort` en los especialistas de Codex. Las skills principales de Codex, como `$ms-fastlane` y `$ms-architect`, heredan el modelo y esfuerzo de la tarea activa; la configuración del especialista no reconfigura esas skills. Reinstala el alcance correspondiente para aplicar un cambio personal; una menor intensidad de razonamiento no prueba por sí sola un menor coste.

## Artefactos del flujo

Versiona los artefactos activos que todavía explican una decisión o comportamiento vigente. `.agents/docs/` es memoria de trabajo, no un almacén permanente: al cerrar un flujo se conserva, promueve o propone retirar cada documento con una razón observable. La carpeta `docs/` queda reservada para documentación dirigida a usuarios y desarrolladores, como guías, API, changelog y notas de versión.

Un TDD `Implementado` no se carga ni entra automáticamente en `active_artifacts` solo porque coincidan una feature, una ruta amplia o una funcionalidad soportada. El agente consulta primero sus metadatos y solo lee el cuerpo por una ruta explícita del usuario/brief o una decisión o contrato concreto afectado, indicando la razón. Las specs vigentes `Implementado`/`Verificado` pueden seguir activas si describen comportamiento necesario; esta exclusión no se extiende a PRDs.

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
| TDD | Apoya una decisión concreta durante diseño e implementación | Compacta duplicados de README/spec/tests, planes ejecutados, bitácoras, logs y métricas por corrida. Conserva decisiones únicas con razón, consecuencia y enlaces; promueve conocimiento a documentación autorizada existente o mantiene una referencia mínima fuera de carga automática si falta destino |

En cada combinación de tipo + `Feature ID` + `Contexto` debe existir como máximo un artefacto activo. `Feature ID` usa un ticket o ID explícito si existe; si no, usa el slug canónico inicial y queda congelado para todas las fases. `Contexto` distingue `global`, `branch:<ref>` y `release:<versión>`, y puede omitirse solo para `global`. Los demás enlazan `Reemplazado por` o se reportan como candidatos de disposición. Todo artefacto mantenido usa estos metadatos mínimos:

- `Feature ID`, `Estado` y `Última revisión`.
- `Contexto` cuando no sea `global`.
- `Retención: Activa | Temporal | Histórica`.
- `Revisar cuando` para `Temporal` e `Histórica`, salvo retención legal indefinida justificada.
- `Ámbito afectado` cuando pueda vincularse con contratos, rutas o símbolos; un PRD no inventa internals.
- `Implementado en` y `Reemplazado por` solo cuando apliquen.
- Motivo de retención obligatorio cuando `Retención` es `Histórica`.

Al cerrar un flujo nivel 3–4, `ms-architect` informa una de cuatro clasificaciones: `mantener activo`, `promover`, `archivar propuesto` o `eliminar propuesto`, junto con razón y evidencia. Un TDD no se mantiene activo solo porque la implementación siga existiendo. Fastlane y nivel 2 claro no generan PRD, spec, TDD ni informes de cierre; en niveles 3–4 se crea únicamente el artefacto necesario, sin cadena documental obligatoria. Archivar, mover o eliminar siempre requiere autorización explícita; ningún agente lo ejecuta automáticamente.

### Casos de mantenimiento

| Situación | Acción |
|---|---|
| Trabajo pausado, cancelado, abandonado o reemplazado | Aplica el gate nivel 3–4; si continuará, mantiene `Temporal` con un evento observable |
| Ramas o releases divergentes | Separa por `Contexto` y reporta conflicto; no combina ni retira automáticamente |
| Drift posterior | Si se toca `Ámbito afectado` o se cumple `Revisar cuando`, exige revisión antes de reutilizar |
| Referencia o promoción | Comprueba destino, ciclos, identidad, evidencia y ausencia de duplicación activa |
| Mutación autorizada | Lista acciones/rutas exactas, obtiene autorización vigente, ejecuta un solo lote y revisa diff/referencias; cualquier cambio relevante invalida la autorización |
| PRD o discovery desactualizado | Emite `handoff_required`; el usuario ejecuta el handoff o acepta la deuda documental |

Para mantenimiento explícito, usa como argumento completo `/ms-status docs` o `/ms-status maintenance`: lista solo cabeceras, metadatos y enlaces, y lee cuerpos únicamente ante conflicto. Reporta TDDs implementados redundantes como candidatos cuando exista evidencia, sin convertirlos en activos. Otros argumentos, como `docs-api`, mantienen la inspección focal sin inventario previo ni lectura de todos los artefactos.

### Cómo selecciona los artefactos `ms-architect`

1. Si el usuario indica una ruta, `ms-architect` usa esa referencia. Si no existe, detiene el flujo y lo informa; no la sustituye silenciosamente.
2. Sin una ruta explícita, busca un candidato único por `feature slug` dentro del directorio canónico.
3. Si encuentra varios candidatos, usa estado y trazabilidad. No decide por fecha ni `mtime`.
4. Lee metadatos antes del cuerpo y aplica la selección de TDDs implementados descrita arriba. Consulta solo artefactos pertinentes y sus referencias directas, sin cargar todo `.agents/docs/` ni ejecutar `ms-project-init` para resolver una ruta ya conocida.
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

Después de actualizar estas fuentes, vuelve a instalar la configuración para que los clientes reciban los contratos nuevos y ejecuta `pnpm start doctor` para comprobar la instalación.

## Comandos

| Comando | Función |
|---|---|
| `pnpm start` | Abre el asistente interactivo |
| `pnpm start list` | Lista agentes, flujos de trabajo, `skills` y complementos incluidos |
| `pnpm start doctor` | Valida el catálogo y la instalación administrada |
| `pnpm start plan` | Clasifica los cambios sin aplicarlos |
| `pnpm start install` | Aplica el plan de forma transaccional |
| `pnpm start status` | Compara la instalación con el catálogo actual |
| `pnpm start uninstall` | Elimina archivos propios y restaura copias de seguridad válidas |
| `pnpm start project init` | Crea o refresca contexto, conservando preferencias |
| `pnpm start project inspect` | Compara fuentes del contexto sin escribir |
| `pnpm start result validate --file <respuesta.md>` | Comprueba coherencia del contrato de un worker sin ejecutar su contenido |

### Opciones comunes

| Opción | Uso |
|---|---|
| `--target opencode\|claude\|codex\|all` | Selecciona clientes; admite comas o repeticiones |
| `--scope user\|project` | Selecciona instalación global o local |
| `--project <ruta>` | Define la raíz para el alcance de proyecto |
| `--home <ruta>` | Usa un directorio personal alternativo, útil para pruebas o `dotfiles` |
| `--assets <ruta>` | Usa un catálogo de recursos (`assets`) alternativo |
| `--force` | Reemplaza conflictos elegibles; restaura solo bloques administrados inequívocos |
| `--yes` | Evita preguntas interactivas |
| `--dry-run` | Simula `install` o `project init` sin escrituras |
| `--json` | Devuelve salida estructurada |

Ejemplos habituales:

```bash
# Revisar antes de instalar
pnpm start plan --target all --scope user

# Instalar solo Claude Code y Codex
pnpm start install --target claude,codex --scope user

# Automatización sin interacción ni escrituras
pnpm start install --target all --scope user --yes --dry-run --json

# Desinstalar la configuración administrada de un proyecto
pnpm start uninstall --target all --scope project --project /ruta/al/repositorio
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

`install`, `uninstall` y `project init` adquieren un bloqueo exclusivo dentro de `.ms-agent-kit` para cada alcance; `project init` reutiliza internamente la etiqueta de operación `install`. Un segundo proceso falla sin escribir; un bloqueo bien formado de un proceso que ya no existe se recupera automáticamente. Si el bloqueo está corrupto, el kit lo conserva y solicita revisión manual en lugar de asumir su propiedad. `plan`, `status`, `doctor`, `project inspect` y las simulaciones siguen siendo operaciones de lectura y no adquieren el bloqueo.

La recuperación de un bloqueo abandonado usa el directorio exclusivo `.ms-agent-kit/operation.lock.recovery`. Bajo esa protección se vuelve a leer el dueño y se comprueba que siga siendo el proceso muerto observado. Si el marcador ya existe, el kit devuelve `OPERATION_LOCKED` sin sustituir el bloqueo principal. Un marcador abandonado requiere revisión manual: confirma que no hay una recuperación activa y revisa el bloqueo principal antes de retirar únicamente ese directorio vacío. El kit no intenta recuperar automáticamente un marcador de recuperación.

Al recibir `SIGINT` o `SIGTERM`, una mutación se detiene en el siguiente límite seguro, revierte los destinos ya modificados y libera el bloqueo antes de devolver el código de salida correspondiente. La reversión no se cancela a mitad de camino.

`project init` publica un único archivo de forma atómica, vuelve a comprobar su contenido antes de actualizar y limpia el temporal al cancelar antes de publicar. Una publicación ya completada deja un documento íntegro; no es la transacción multiartefacto de `install`.

## Uso por cliente

Los tres clientes comparten roles y contrato de evidencia, con modelos propios y controles nativos. Esta tabla muestra los defaults sin configuración personal:

| Cliente | `ms-fastlane` | Controles |
|---|---|---|
| OpenCode | `openai/gpt-5.6-luna`, `variant: low` | Permisos y límites nativos |
| Claude Code | Haiku, esfuerzo bajo | Herramientas, permisos y límites heredados |
| Codex | Especialista: modelo heredado y razonamiento bajo. `$ms-fastlane` principal: modelo y esfuerzo de la tarea activa | Configuración de la tarea padre |

Para cambios claros y de bajo riesgo, usa la entrada directa; para coordinación o decisiones persistentes, activa el arquitecto. Tres archivos y 120 LOC orientan la reevaluación, sin sustituir el criterio de riesgo.

| Acción | OpenCode | Claude Code | Codex |
|---|---|---|---|
| Cambio acotado | `/ms-fastlane <pedido>` | `/ms-fastlane <pedido>` | `$ms-fastlane <pedido>` |
| Nota de traspaso | `/ms-handoff <objetivo>` | `/ms-handoff <objetivo>` | `$ms-handoff <objetivo>` |

OpenCode usa el agente `ms-fastlane`; Claude ejecuta un fork del mismo rol, con contrato interno para el padre. Codex ejecuta la skill fastlane en la tarea principal. La entrada evita una consulta inicial al arquitecto y no habilita delegación desde fastlane.

`ms-handoff` entrega una nota en la conversación con objetivo, decisiones, archivos, Git observado, verificaciones y siguiente acción. Para guardarla, pide una ruta explícita dentro del proyecto: la tarea principal delega esa única escritura y no sobrescribe un destino existente ni sigue symlinks. En Claude, el fork devuelve la nota y el destino al padre, que coordina la persistencia; el fork no escribe ni crea subagentes anidados. El cliente receptor debe contrastar Git y fuentes antes de reutilizar evidencia; la nota no convierte una verificación antigua en un PASS actual.

### OpenCode

OpenCode conserva comandos y menciones de agentes:

```text
/ms-status mi-cambio
@ms-scout localiza el flujo de autenticación
```

La instalación global administra `opencode.json`, `tui.json`, agentes, comandos y `skills`. Desactiva las notificaciones propias de OpenCode y no declara `@mohak34/opencode-notifier`; no hay plugins TypeScript locales ni interceptores del ciclo de delegación.

Playwright MCP se registra como servidor local habilitado con `npx -y @playwright/mcp@latest`. Usa el Node.js y `npx` del entorno del cliente; el primer inicio puede descargar el paquete. El instalador no inicia el navegador ni comprueba la conexión. Esta configuración sigue la [documentación oficial de Playwright MCP](https://github.com/microsoft/playwright-mcp).

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

El kit genera `permission: {}` en `opencode.json` y en los 12 agentes `ms-*`, tanto en instalaciones de usuario como de proyecto. No añade reglas de comandos, secretos, edición, skills, delegación ni bucles repetidos.

Los permisos efectivos los decide OpenCode con sus valores nativos y cualquier configuración externa. Las instrucciones mantienen la misión y el alcance de cada rol; no constituyen bloqueos técnicos. El preflight muestra `unknown` para los permisos de cualquier cliente porque no inspecciona la sesión efectiva: no significa denegación ni obliga a pedir permiso por cada comando.

```bash
pnpm start install --target opencode --scope user
```

Las actualizaciones de instalaciones administradas sustituyen las reglas anteriores por el bloque vacío. Si se editaron archivos instalados, revisa el plan; `--force` guarda una copia de los conflictos antes de aplicar el contenido generado.

### Claude Code

Los flujos de trabajo se exponen como habilidades invocables (`slash skills`) y ejecutan el agente correspondiente en un contexto aislado:

```text
/ms-status mi-cambio
```

También se puede iniciar una sesión completa con el arquitecto:

```bash
claude --agent ms-architect
```

Los agentes heredan las herramientas y el modo de permisos de Claude Code: el kit omite `tools`, `disallowedTools` y `permissionMode`. No instala hooks `PreToolUse` ni modifica `settings.json`.

El kit no instala hooks de bloqueo ni `maxTurns`. Al actualizar retira `hooks/ms-agent-guard.mjs` y `hooks/ms-result-validator.mjs` si siguen administrados y sin cambios locales. El comando manual `result validate` permanece disponible.

### Codex

Codex ejecuta los flujos de trabajo como `skills` desde la tarea principal:

```text
$ms-architect implementa este cambio
$ms-status mi-cambio
```

Cada especialista conserva sus instrucciones, modelo y esfuerzo. El kit omite `default_permissions`, tablas `permissions`, `sandbox_mode`, `approval_policy` y `web_search`; los ajustes se heredan de la tarea padre. La actualización retira las antiguas reglas administradas `rules/ms-secrets.rules` si no tienen cambios locales.

`ms-agent-kit` registra Context7 como servidor MCP remoto y Playwright como servidor local mediante un bloque delimitado en `~/.codex/config.toml` o en `.codex/config.toml`, según el alcance. Codex solo carga la capa `.codex/config.toml` de proyecto cuando el repositorio está marcado como confiable; por eso `codex mcp get context7` o `codex mcp list` pueden no mostrarla dentro de un fixture o repositorio no confiable. El bloque referencia `CONTEXT7_API_KEY` por nombre en `env_http_headers`; nunca lee ni persiste su valor:

```toml
[mcp_servers.context7]
url = "https://mcp.context7.com/mcp"
env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }

[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]
```

Si ya existe una tabla externa equivalente de Context7 o Playwright, el instalador la respeta sin modificarla ni asumir propiedad, y añade únicamente el servidor que falte. Para Playwright reconoce `npx` con `@playwright/mcp@latest`, con o sin `-y`; las variantes no demostrablemente equivalentes se protegen como conflicto. El bloque conserva su identificador histórico `codex-context7` para actualizar instalaciones anteriores. Una tabla distinta o ambigua se protege como conflicto, incluso con `--force`. Al desinstalar, el kit retira únicamente su bloque y conserva byte a byte el resto de `config.toml`.

Para obtener la cuota autenticada, define `CONTEXT7_API_KEY` en el entorno de la aplicación que inicia Codex. Después de instalar o cambiar la variable, reinicia Codex o abre una tarea nueva y comprueba el registro con:

```bash
codex mcp get context7
codex mcp get playwright
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

Si necesitas volver a una versión anterior de `ms-agent-kit` después de instalar el bloque Context7, ejecuta primero `pnpm start uninstall --target codex` con la versión actual. Las versiones antiguas no reconocen el ownership limitado a bloques.

## Seguridad y límites

- El catálogo es cerrado y rechaza patrones comunes de identificadores secretos (`tokens`), claves privadas y credenciales.
- No se empaquetan `.env`, llaveros (`keychains`), cachés, archivos de bloqueo generados, sesiones ni `node_modules`.
- OpenCode recibe `permission: {}` en configuración y agentes; sus permisos efectivos dependen del cliente.
- Claude Code hereda herramientas, permisos y límites del cliente; el kit no instala hooks de bloqueo.
- Codex hereda los permisos de la tarea padre, sin perfiles ni reglas `execpolicy` del kit.
- El kit no instala ni actualiza OpenCode, Claude Code o Codex.
- Los paquetes externos declarados para OpenCode se descargan cuando el propio cliente arranca.

Para una política Codex no eludible hace falta una configuración administrada por el sistema. Las reglas incluidas cubren operaciones y lectores habituales, pero los permisos de la tarea padre y las restricciones globales siguen teniendo prioridad.

## Solución de problemas

### Una instrucción antigua pide el comando `ms-agent-kit`

Ejecuta el comando desde la copia del repositorio con `pnpm start`; por ejemplo:

```bash
pnpm start doctor
```

Si la instrucción aparece dentro de un agente, actualiza sus archivos con `pnpm start` y abre una sesión nueva del cliente. Los agentes actuales usan herramientas nativas y no dependen de ese comando global.

### La instalación se detiene por conflictos

Inspecciona el plan y el archivo señalado:

```bash
pnpm start plan --target all --scope user
```

Usa `--force` solo si aceptas reemplazarlo. El contenido anterior quedará asociado a una copia de seguridad.

### El proceso no dispone de TTY

Usa el modo no interactivo:

```bash
pnpm start install --target all --scope user --yes
```

### OpenCode muestra `skills` duplicadas o incompatibles

Define `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` y reinicia OpenCode. Esto desactiva importaciones externas; las `skills` administradas por `ms-agent-kit` permanecen en la raíz nativa de OpenCode.

### Context7 no autentica

Comprueba que `CONTEXT7_API_KEY` existe en el entorno de la aplicación desde la que se inicia OpenCode o Codex. Una terminal puede tener la variable mientras una aplicación gráfica no la hereda. No añadas la clave a `opencode.json`, `config.toml` ni al repositorio.

Después de corregir el entorno, reinicia el cliente o abre una tarea nueva. En Codex puedes comprobar que el servidor quedó registrado con `codex mcp get context7`; el valor de la clave no debe aparecer en su configuración.

### El cliente sigue solicitando permisos

El kit no añade restricciones, pero cada cliente conserva su configuración de permisos, reglas externas y sandbox. Revisa los ajustes de la sesión y del proyecto; quitar las políticas del kit no desactiva esos controles. Después de actualizar, abre una sesión nueva para cargar los artefactos actuales.

### El asistente no pide confirmación

Es el comportamiento esperado cuando el plan no contiene cambios. Usa `status` para comprobar que todo sigue actualizado.

## Desarrollo

### Evaluar calidad y coste observado

La [guía de evaluaciones](assets/evaluations/README.md) incluye cinco tareas manuales: bug, feature, investigación, documentación y cambio entre módulos. Cada una tiene fixture, criterios observables y una plantilla de resultados. Registra cliente, modelo, revisiones, resultado, tiempo, llamadas, reintentos, preguntas innecesarias y tokens cuando estén disponibles; un dato no observado es `null`.

Las pruebas automáticas del kit y las medidas de bytes/caracteres no acreditan ahorro real. Las ejecuciones LLM comparables y repetidas siguen pendientes. Consulta la guía para separar sesiones nuevas de reutilización de contexto y conservar evidencia de resultados correctos e incorrectos.

### Verificar cambios del kit

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
