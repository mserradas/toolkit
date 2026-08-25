# Agentes ms-*

> Actualizado: 2026-07-23

Este equipo separa producto, arquitectura, implementación, verificación y auditoría.

OpenCode asigna a cada rol un color semántico propio para distinguir agentes primarios, implementación, investigación, verificación, documentación y seguridad en la interfaz.

## Flujo base

```text
Idea -> ms-plan -> PRD -> el usuario decide el siguiente paso
Idea temprana -> ms-discovery -> experimentos -> el usuario decide/inicia ms-plan
PRD aprobado -> el usuario decide/inicia ms-architect -> ms-spec si aporta -> ms-designer -> TDD
Cambio acotado -> ms-architect -> ms-fastlane -> revisión/smoke -> cierre
Cambio con scope claro -> ms-architect -> ms-codex -> verificación si aplica -> cierre
TDD aprobado -> ms-architect -> work units -> verificación -> cierre de spec si aplica -> cierre
```

`ms-plan` y `ms-discovery` son agentes primarios: entregan directamente al usuario y no emiten `Contrato para ms-architect` ni esperan su aceptación. El contrato y su aceptación se reservan a workers o subagentes dentro de un flujo orquestado.

### Ciclo optimizado

1. `ms-architect` mantiene el único plan del flujo, asigna cada misión y nombra un solo `verification_owner`: `implementer | ms-tester | none`.
2. Cada worker ejecuta un inner loop focal: lee la evidencia mínima necesaria, aplica un parche coherente si su rol escribe, verifica lo que cambió y devuelve un handoff compacto con evidencia. Los workers no mantienen un `TODO` paralelo.
3. Las misiones se dimensionan para unas 8–12 iteraciones. Si el primer presupuesto se agota con trabajo pendiente, el arquitecto divide o reduce la misión en vez de encadenar extensiones.
4. Usa `implementer` cuando `ms-codex` o `ms-fastlane` cubre los gates, `ms-tester` cuando queda un gate independiente pendiente y `none` en tareas sin ejecución verificable. Un `PASS` vigente, ejecutado o reutilizado, cubre el gate mientras no haya escrituras posteriores que puedan invalidarlo.

## Comandos

| Comando | Uso |
|---|---|
| `/ms-status [objetivo]` | Estado de solo lectura de fase, artefactos, diff, verificación, riesgos y siguiente acción recomendada |
| `ms-doctor [full]` | Health check read-only adaptado al cliente actual: OpenCode, Claude Code o Codex |

## Mejoras inspiradas por Gentle AI

Se incorporan ideas útiles sin añadir una segunda familia de agentes:

- **Preflight nivel 4**: antes de programas grandes, `ms-architect` fija modo de ejecución, estrategia de entrega, presupuesto de revisión, persistencia/idioma de artefactos y comandos de verificación conocidos.
- **Carga de revisión**: 400 líneas cambiadas es una señal orientativa; `ms-architect` divide solo cuando mejora la revisión o la independencia de entrega.
- **Revisión proporcional**: `ms-architect` revisa el diff; activa `ms-security-auditor` u otro especialista solo cuando existe una señal real de riesgo.
- **Gatekeeper entre fases**: antes de avanzar, `ms-architect` valida contrato, existencia de artefactos, coherencia de rutas/comandos, drift contra la entrada y siguiente acción.
- **Contrato de idioma**: toda prosa humana de documentación nueva o actualizada se escribe en español neutro/profesional, aunque el repositorio use otro idioma. Identificadores, rutas, comandos, APIs, métodos/status HTTP, schemas/campos, variables de entorno, librerías, valores literales, logs, errores, citas, terminología técnica canónica del proyecto y tokens estructurales exigidos por formatos/tooling se conservan sin traducir. Al tocar un documento inglés, se normaliza al español toda su prosa humana. Ejemplo: `## Functional summary` pasa a `## Resumen funcional` y se escribe «Estado: Aprobada», pero `selected_status`, `POST /submissions`, `completed`, `feature`, `runtime`, `schema`, `endpoint`, `benchmark`, `[Unreleased]` y `Added` permanecen literales.
- **Test capabilities snapshot**: `ms-tester` reporta los comandos detectados/ejecutables para que el arquitecto los reutilice en verificaciones posteriores.
- **`ms-project-init`**: skill ligera para detectar stack, arquitectura, comandos de verificación y riesgos desconocidos antes de cambios grandes.
- **`work-unit-commits`**: skill para partir trabajo en unidades revisables con tests/docs acoplados al comportamiento que verifican.
- **`ms-spec`**: spec funcional ligera para cerrar comportamiento, reglas, criterios y contratos antes del TDD cuando el cambio lo justifica.
- **Cierre de spec**: modo de `ms-spec` inspirado en OpenSpec archive; actualiza estado, evidencia y drift para que la spec siga siendo útil.
- **Preguntas interactivas con `question`**: `ms-architect`, `ms-plan` y `ms-discovery` usan el selector nativo de OpenCode para decisiones bloqueantes, entrevistas de producto y pausas entre fases.
- **`ms-doctor`**: diagnóstico read-only específico del cliente; no mezcla configuración ni inventarios de skills entre OpenCode, Claude Code y Codex.
- **Context7 MCP**: documentación actual de librerías/frameworks/APIs desde `https://mcp.context7.com/mcp`, usada antes de `webfetch` cuando aplica.
- **Presupuesto de velocidad/contexto**: el orquestador se mantiene delgado, evita delegaciones duplicadas, agrupa estado por ola y usa modelos rápidos en agentes operativos sin bajar el modelo de juicio para diseño, implementación compleja o seguridad.

## Skills Generales Instaladas

| Skill | Uso |
|---|---|
| `cognitive-doc-design` | Docs, guías, READMEs, RFCs y notas de revisión con baja carga cognitiva |
| `work-unit-commits` | Partir cambios en unidades revisables con tests/docs acoplados |
| `judgment-day` | Doble juez ciego bajo petición explícita del usuario |
| `delegation-brief` | Preparar tareas autosuficientes para subagentes con contexto, límites, DoD y evidencia esperada |
| `ms-project-init` | Crear un snapshot operativo mínimo de stack, arquitectura, verificación y riesgos antes de nivel 4 o repos desconocidos |
| `skill-creator` | Crear nuevas skills concisas y reutilizables; Codex usa su skill nativa equivalente |
| `skill-improver` | Auditar y mejorar skills existentes |
 
Con el perfil `balanced`, cada agente conserva `skill` y `lsp` según el permiso estrecho de su rol. El perfil `strict` conserva la política cerrada definida por cada rol.

## Niveles de orquestación

| Nivel | Uso | Flujo esperado |
|---|---|---|
| 0 | No modifica repo | Respuesta directa, sin subagentes |
| 1 | Cambio acotado de bajo riesgo | Una tarea a `ms-fastlane`, revisión de diff, smoke y cierre |
| 2 | Cambio claro que no califica como fastlane | Una tarea a `ms-codex`, verificación solo si aplica |
| 3 | Varias piezas coordinadas | Spec ligera si hay ambigüedad funcional, plan compacto por paquetes, integración y verificación |
| 4 | Alto impacto o diseño persistente | Spec si aporta, TDD, aprobación humana y ejecución por paquetes |

## Agentes

| Agente | Perfil OpenCode | Presupuesto | Uso principal | Toca archivos |
|---|---|---:|---|---|
| `ms-plan` | `openai/gpt-5.6-sol`, `variant: high` | — | Hace preguntas y crea PRDs | Solo `docs/prd/**` |
| `ms-discovery` | `openai/gpt-5.6-sol`, `variant: high` | — | Debate ideas tempranas, clasifica inconvenientes y propone experimentos | Solo `docs/discovery/**` si el usuario pide guardar |
| `ms-architect` | `openai/gpt-5.6-sol`, `variant: high` | — | Orquesta el flujo técnico, inspecciona en solo lectura y decide fastlane/spec/TDD | No |
| `ms-spec` | `openai/gpt-5.6-sol`, `variant: high` | 20 | Crea specs funcionales verificables y cierra specs tras implementación verificada | Solo `docs/spec/**` |
| `ms-designer` | `openai/gpt-5.6-sol`, `variant: high` | 20 | Crea TDDs desde PRDs/specs aprobados | Solo `docs/design/**` |
| `ms-fastlane` | `openai/gpt-5.6-luna`, `variant: low` | 12 | Ejecuta cambios acotados sin cadena de subagentes | Sí, scope limitado |
| `ms-codex` | `openai/gpt-5.6-sol`, `variant: high` | 20 | Implementa código con scope cerrado | Sí |
| `ms-tester` | `openai/gpt-5.6-luna`, `variant: low` | 16 | Corre tests, lint, type-check y format-check | No |
| `ms-scout` | `openai/gpt-5.6-luna`, `variant: low` | 12 | Explora código y determina blast radius | No |
| `ms-debugger` | `openai/gpt-5.6-sol`, `variant: high` | 20 | Reproduce bugs y encuentra causa raíz | No |
| `ms-writer` | `openai/gpt-5.6-sol`, `variant: medium` | 20 | Actualiza docs de usuario, README, changelog | Solo docs de usuario |
| `ms-security-auditor` | `openai/gpt-5.6-sol`, `variant: high` | 20 | Audita seguridad con evidencia | No |

OpenCode y Claude Code materializan `toolCycleBudget` para limitar cada misión. En Codex, estos valores son solo una política de prompt y no un límite duro de turnos.

## Cuando usar cada uno

- Usa `ms-plan` cuando todavía no está claro qué construir.
- Usa `ms-discovery` cuando la idea aún está en fase de oportunidad, debate, validación o decisión de si merece PRD.
- Usa `ms-architect` cuando hay que modificar el repo o coordinar subagentes.
- Usa `ms-spec` cuando hay que cerrar comportamiento, reglas, criterios de aceptación o impacto funcional antes del TDD, o cuando hay que cerrar una spec tras implementación verificada.
- Usa `ms-designer` cuando un cambio necesita TDD.
- Usa `ms-fastlane` para cambios acotados, claros y seguros.
- Usa `ms-codex` para escribir código con scope cerrado.
- Usa `ms-tester` para verificar con comandos.
- Usa `ms-scout` para entender un área transversal o determinar blast radius incierto.
- Usa `ms-debugger` para investigar bugs antes de arreglarlos.
- Usa `ms-writer` para documentación visible al consumidor.
- Usa `ms-security-auditor` si toca auth, permisos, secretos, datos sensibles, input externo, dependencias o infra expuesta.

## Reglas clave

- `ms-plan` pregunta antes de escribir PRD. No inventa contexto. Tras aprobarlo, el usuario decide e inicia el paso a `ms-architect`; `ms-plan` no lo invoca.
- `ms-plan`, `ms-discovery` y `ms-architect` usan `question` para input bloqueante del usuario. Los subagentes devuelven `needs_user_input` y no preguntan directamente.
- `ms-discovery` no crea PRDs, TDDs ni implementación. Clasifica inconvenientes, supuestos, riesgos y experimentos; si la idea madura, recomienda pasar a `ms-plan`, pero el usuario controla e inicia ese handoff.
- `ms-architect` no edita. Puede usar bash solo para inspección de solo lectura acotada (`pwd`, `ls`, `wc`, `file`, `stat`, `rg`, `grep`, `git status`, `git diff`, `git show`, `git log`, `git rev-parse` y las variantes exactas `git branch`, `git branch --show-current`, `git branch --list`, `git branch -a` y `git branch -r`).
- `ms-architect` enruta el diagnóstico operativo de solo lectura sobre procesos, contenedores, servicios o CI a `ms-debugger`; tests/lint/typecheck/build a `ms-tester`; y una operación mutante explícitamente autorizada a `ms-codex`. No prueba primero comandos operativos bloqueados por su rol.
- `ms-architect` delega tests, linters, formatters, servidores, instalaciones, migraciones, commits, pushes y cualquier comando con efectos secundarios.
- `ms-architect` elige primero un nivel de orquestación; no decide agentes por inercia.
- `ms-architect` es el único propietario del plan y del `TODO`; los workers ejecutan la misión recibida y entregan evidencia, sin crear un plan paralelo.
- `ms-architect` exige `Contrato para ms-architect` a todo worker o subagente de su flujo antes de aceptar resultados; esta regla no aplica a los primarios `ms-plan` y `ms-discovery`.
- `ms-architect` no invoca más de 3 subagentes por ola salvo justificación explícita, compacta cada ola en máximo 10 bullets y acepta contratos completos sin reanalizar reportes enteros.
- `ms-architect` mantiene log de lanzamientos para no invocar dos veces la misma huella `(subagente, objetivo, artefactos clave)` en la misma fase.
- `ms-architect` asigna un solo `verification_owner` final (`implementer | ms-tester | none`): `implementer` para `ms-codex` o `ms-fastlane`, `ms-tester` solo si queda un gate independiente pendiente y `none` cuando no hay ejecución verificable. Reutiliza cualquier `PASS` vigente si no hubo escrituras posteriores y evita duplicar verificaciones sin una causa concreta.
- `ms-architect` delega exploración cuando el área es transversal, el blast radius es incierto o una síntesis reduce materialmente el contexto; no usa contadores rígidos de archivos o herramientas.
- `ms-architect` ejecuta siempre un Security Smoke Gate tras cambios de `ms-codex` o `ms-fastlane`; si el diff contiene señales reales de secretos/config sensible o lógica de seguridad, invoca `ms-security-auditor` en modo ligero. Una ruta sensible con cambios solo visuales no basta para escalar.
- `ms-architect` aplica Gatekeeper de Fases antes de avanzar entre spec, TDD, implementación, verificación, documentación y cierre.
- `ms-architect` considera tamaño, riesgo e independencia en cambios nivel 3-4; superar 400 líneas sugiere revisar la partición, no la impone.
- `ms-architect` carga la skill `ms-project-init` cuando no hay snapshot confiable de stack/comandos o antes de un nivel 4.
- `ms-architect` carga `work-unit-commits` para partir nivel 3-4 por comportamiento entregable, no por tipo de archivo.
- `ms-architect` usa `ms-spec` solo para cambios nivel 3-4, features ambiguas, contratos públicos, datos, seguridad, migraciones o decisiones irreversibles; no lo usa en fastlane ni nivel 2 claro.
- `ms-architect` delega el modo de cierre de `ms-spec` antes del cierre final si una implementación nivel 3-4 tuvo spec funcional y el resultado afecta comportamiento observable. La spec se marca `Implementado`, `Verificado`, `Archivado` o `Reemplazado` con evidencia; no se borra.
- `ms-architect` usa `judgment-day` únicamente cuando el usuario pide doble juez o revisión adversarial.
- `ms-architect` usa `delegation-brief` antes de delegar paquetes nivel 3-4, TDD/spec, bugs, reviews, auditorías, verificaciones o retries; fastlane y nivel 2 trivial pueden usar brief corto.
- `/ms-status` informa el estado observable desde el contexto actual, Git y artefactos durables sin continuar ni persistir trabajo.
- `ms-spec` no diseña arquitectura técnica ni implementación; produce comportamiento, reglas, casos borde y criterios verificables en `docs/spec/**`, y al cierre registra evidencia, estado final y drift.
- `ms-designer` no asigna ejecutores; solo diseña el TDD.
- `ms-designer` incluye previsión de revisión en la sección de paquetes del TDD.
- `ms-fastlane` se bloquea si el cambio no califica como acotado: máximo 3 archivos totales, <=120 LOC estimadas, sin contrato público, datos persistidos, seguridad, infra, CI/CD, dependencias, ambigüedad de producto ni decisión irreversible.
- `ms-codex` no rediseña ni amplía scope.
- `ms-codex` agrupa lectura, edición y verificación; continúa mientras haya progreso observable y devuelve `partial` o `blocked` si repite el mismo fallo sin nueva evidencia. Ejecuta una sola operación de shell por llamada. Sus permisos Bash bloquean la composición con `&`, `&&`, `;`, pipes y shells envolventes; la sustitución de comandos con `$()` o backticks; la sustitución de procesos con `<()` o `>()`; las redirecciones shell con `<` o `>`; y los comandos multilínea. Respeta el timeout documentado por el repositorio; si no existe, usa 300 segundos para un comando focal y 900 segundos para la suite completa. Un timeout se reporta y no se reintenta automáticamente.
- `ms-tester` no modifica archivos. Puede ejecutar sin confirmación scripts convencionales de verificación (`test`, `lint`, `typecheck`, `check`, `build`, `validate`, `verify`, `ci`, `quality`); entre los candidatos rutinarios también están `pnpm build`, `pnpm exec ng test`, checks de Prettier con `--check` y las consultas `alembic heads`/`alembic history`. Usa un gate agregado solo si cubre exactamente los gates pendientes y no repite un `PASS` vigente reutilizable. El cierre acepta cobertura vigente ejecutada o reutilizada; scripts desconocidos siguen bloqueados. Los timeouts de fallback son 300 segundos para comandos focales y 900 segundos para la suite completa, salvo que el repositorio documente explícitamente una duración mayor.
- `ms-scout` solo ejecuta comandos de inspección de solo lectura: lectura, búsqueda, listados y git read-only.
- `ms-scout` no revisa diffs terminados: mapea código y blast radius. La revisión general corresponde a `ms-architect`; seguridad profunda a `ms-security-auditor`.
- `ms-debugger` no arregla bugs; solo reporta causa raíz.
- `ms-writer` no toca PRDs ni TDDs.
- `ms-security-auditor` no escribe fixes.
- `ms-architect` usa el camino mínimo para cambios de bajo riesgo: no invoca scout, spec, TDD, writer, auditoría ni tester por prudencia genérica si no se activan disparadores explícitos.
- Todo subagente que no orquesta declara `task: deny` explícito.
- El perfil predeterminado `balanced` reserva `todowrite` para `ms-architect`, permite `lsp` y skills generales donde corresponde y usa allowlists silenciosas para roles acotados. Los workers no mantienen listas `TODO`. Solo `ms-codex` pregunta por comandos desconocidos o dependencias; `ms-debugger` conserva el fallback `deny` y solo pide confirmación para comandos sensibles con una regla `ask` explícita. Push, SSH, gestores del sistema, destrucción y secretos se bloquean. `strict` restaura la política cerrada y `trusted` reduce confirmaciones sin levantar denegaciones explícitas.
- OpenCode usa una única definición de secretos para lectura directa y comandos evidentes: `.env`, entornos reales, `.ssh`, credenciales, llaves y `secrets/**`; `.env.example` sigue permitido. El instalador la escribe globalmente y al final de cada frontmatter `ms-*`, después de los permisos del rol, para que las denegaciones prevalezcan en el orden efectivo.
- La lectura genérica vía bash (`cat`, `head`, `tail`, `tree`, `rg`, `grep`) queda permitida en agentes operativos de lectura/código/verificación (`ms-codex`, `ms-tester`, `ms-debugger`, `ms-security-auditor`, `ms-scout`) para reducir fricción; `find` no forma parte de este permiso genérico. Las denegaciones añadidas al generar el agente se evalúan después de esos permisos.
- OpenCode limita `git branch` a las variantes de lectura exactas documentadas arriba. `ms-spec` y `ms-designer` solo reciben `git status` y `git diff` exactos para autoverificación, sin variantes amplias.
- `ms-debugger` tiene `env` y `printenv*` en `deny` para evitar exposición accidental de secretos.
- `ms-codex` permite sin confirmación los comandos exactos `pnpm build`, `pnpm run build`, `pnpm build:staging`, `pnpm run build:staging` y `pnpm exec ng build --configuration development`, además de `pnpm exec ng test`, Prettier con `--check` y las consultas `uv run alembic heads`/`uv run alembic history`. Mantiene en `ask` instalaciones, comandos desconocidos, flags largos `--write` o flags cortos de Prettier que contengan `w`, y `uv run alembic upgrade`/`downgrade`/`revision`/`stamp`. `git push`, `ssh`, `scp`, `nc`, Netcat y los comandos destructivos de git/filesystem están en `deny`.
- `ms-debugger` permite verificaciones seguras concretas (`test`, `lint`, `typecheck`, `check`) para reproducir bugs sin fricción y conserva `"*": "deny"` como fallback: los scripts y comandos desconocidos quedan bloqueados, no entran en `ask`. Docker `logs`/`inspect` y Kubernetes `get`/`describe`/`logs` tienen reglas sensibles explícitas en `ask`.
- Los agentes de solo lectura bloquean flags mutantes como `--fix`, `--autofix`, `--write` y actualizaciones de snapshots; logs/inspect sensibles de Docker/Kubernetes quedan en `ask`.

## Runtime compartido

OpenCode no carga `agents-shared.md` globalmente. El instalador embebe esas reglas una sola vez en cada agente generado y conserva [agents-shared.md](agents-shared.md) como referencia humana.

El ciclo de sesiones y delegaciones queda bajo control del usuario y de las instrucciones de los agentes; no hay plugins que intercepten `task`.

## Diferencias De Runtime

| Cliente | Ejecución | Perfil económico de `ms-fastlane` | Enforcement relevante |
|---|---|---|---|
| OpenCode | Delegación nativa | `openai/gpt-5.6-luna`, `variant: low` | Permisos por rol y presupuesto materializado |
| Claude Code | Agent nativo | Haiku, esfuerzo bajo | Permisos por rol y límite de turnos cuando el cliente lo permite |
| Codex | Subagente nativo | Modelo heredado, razonamiento bajo | Contrato y política de prompt; no recibe actualmente un hard turn budget |

OpenCode carga MCPs desde `opencode.json` y complementos de la TUI desde `tui.json`. La configuración declara Context7; su clave se resuelve exclusivamente desde `CONTEXT7_API_KEY`, nunca desde el catálogo. Los agentes con acceso a documentación deben preferir Context7 antes de `webfetch` cuando aplique.

OpenCode instala automáticamente los plugins npm declarados en su configuración. El kit no distribuye plugins TypeScript locales, `node_modules`, locks ni cachés.

La TUI carga las preferencias portables desde `tui.json`, incluido `opencode-subagent-statusline`. El estado y cache del plugin se generan localmente y no se distribuyen. El kit no declara `@mohak34/opencode-notifier` y mantiene desactivadas las notificaciones propias de OpenCode para que el entorno anfitrión pueda centralizarlas.

Este documento queda como documentación humana del sistema: mapa de agentes, flujo recomendado y reglas de alto nivel. Si cambias el contrato operativo, actualiza `agents-shared.md` y las referencias de los subagentes que lo usan.
