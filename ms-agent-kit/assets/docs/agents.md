# Agentes ms-*

> Actualizado: 2026-09-11

Este equipo separa producto, arquitectura, implementación, verificación y auditoría.

OpenCode asigna a cada rol un color semántico propio para distinguir agentes primarios, implementación, investigación, verificación, documentación y seguridad en la interfaz.

El kit genera `permission: {}` en la configuración y en todos los agentes de OpenCode, con cualquier perfil. Las misiones y límites de rol de esta guía son instrucciones de trabajo, no restricciones técnicas impuestas por el kit. OpenCode conserva sus valores nativos y las reglas externas que configure el usuario.

## Flujo base

```text
Idea -> ms-plan -> PRD -> el usuario decide el siguiente paso
Idea temprana -> ms-discovery -> experimentos -> el usuario decide/inicia ms-plan
PRD aprobado -> el usuario decide/inicia ms-architect -> spec/TDD solo si resuelven una necesidad
Cambio acotado -> ms-architect -> ms-fastlane -> revisión/smoke -> cierre
Cambio con scope claro -> ms-architect -> ms-codex -> verificación si aplica -> cierre
TDD aprobado -> ms-architect -> work units -> verificación -> cierre de spec si aplica -> cierre
```

`ms-plan` y `ms-discovery` son agentes primarios: entregan directamente al usuario y no emiten `Contrato para ms-architect` ni esperan su aceptación. El contrato y su aceptación se reservan a workers de flujos orquestados y forks nativos de comandos ms-*. En invocación directa como agentes primarios, `ms-codex`, `ms-fastlane` y `ms-tester` responden al usuario sin ese contrato.

### Ciclo optimizado

1. `ms-architect` mantiene el único plan del flujo, asigna cada misión y nombra un solo `verification_owner`: `implementer | ms-tester | none`.
2. Cada worker ejecuta un inner loop focal: lee la evidencia mínima necesaria, aplica un parche coherente si su rol escribe, verifica lo que cambió y devuelve un handoff compacto con evidencia. Los workers no mantienen un `TODO` paralelo.
3. Las misiones tienen un resultado verificable y continúan mientras haya progreso dentro del alcance. Se dividen ante un bloqueo real o complejidad adicional, sin cortes por contador de ciclos.
4. Usa `implementer` cuando `ms-codex` o `ms-fastlane` cubre los gates, `ms-tester` cuando queda un gate independiente pendiente y `none` en tareas sin ejecución verificable. Cada gate tiene un propietario. Reutiliza un `PASS` contrastando código, configuración, dependencias, entorno y archivos sin seguimiento; el commit por sí solo no acredita vigencia.

Antes de delegar, el brief recoge comando, `cwd`, política `allow | ask | deny | unknown`, efectos de escritura, servicios/runtime y sus fuentes por separado. El preflight de `doctor` no ejecuta comandos. `unknown` expresa información pendiente, no una denegación ni una autorización: el arquitecto resuelve lo necesario con la revisión vigente, la autorización existente y los límites del cliente. Una verificación conocida y autorizada no requiere otra aprobación por ceremonia. Make, Compose o scripts llamados `test` no reciben autorización por su nombre; si cambian recetas, scripts o configuración, se revisan otra vez.

La sección «Configurar verificaciones de un proyecto» del README explica cómo conservar comandos revisados y directorios de resultados. Solo se incorporan como instrucciones con `scope: project` y raíz exacta. Estos datos no generan permisos; el kit no audita los efectos de scripts o servicios. El tester conserva su misión de verificar sin editar código.

Una denegación de política termina el intento con operación, causa y siguiente acción. No se reformula, ofusca, cambia de intérprete ni traspasa a otro rol para eludirla; se distingue de errores de entorno. El brief reutiliza secciones/símbolos, evidencia y búsquedas negativas con su contexto; una sesión pertinente recibe el delta. El cierre documental se agrupa por propietario cuando no condiciona la implementación, sin añadir procesos a cambios simples.

### Aceptación del resultado

El [contrato compartido](agents-shared.md#contrato-para-ms-architect) conserva sus estados y añade `verification` por gate: propietario, obligatoriedad, comando, `PASS | FAIL | TIMEOUT | NOT_RUN`, evidencia y workspace. `completed` exige evidencia, bloqueos/preguntas vacíos y PASS en todos los gates obligatorios declarados. `partial`, `blocked` y `failed` requieren causa y siguiente acción. Una investigación puede completarse al demostrar un fallo, sin presentarlo como gate obligatorio aprobado.

Desde el repositorio del kit, `pnpm start result validate --file /ruta/respuesta.md [--json]` comprueba la coherencia de una respuesta guardada. El formato es un título exacto `Contrato para ms-architect` y un único bloque terminal: JSON completo o YAML cerrado de campos planos/listas de textos, con `verification` como lista JSON inline. Se conservan contratos anteriores sin `verification`; su omisión no demuestra cobertura. El padre valida los gates esperados y la vigencia de las referencias. El validador rechaza duplicados, ambigüedades y límites excedidos; no ejecuta el contenido. El CLI exige archivo regular, rechaza symlinks finales/rutas sensibles y limita la lectura. La utilidad es opcional y los agentes funcionan sin ella; el padre conserva la aceptación de la evidencia y el kit no instala hooks de bloqueo de salida.

### Resolución de artefactos

Los artefactos operativos viven en `.agents/docs/{discovery,prd,spec,design}` y su histórico en `.agents/docs/archive`; `docs/` se reserva para documentación pública. `ms-architect` prioriza una ruta explícita del usuario: si no existe en disco, la reporta como input inválido y bloqueante, sin sustituirla silenciosamente. Solo en ausencia de ruta explícita usa el candidato único por feature slug. Nunca desempata por fecha o `mtime`: usa trazabilidad y estado, reporta drift entre petición, PRD, spec y TDD respetando el ámbito de cada uno, y pide decisión solo cuando cambie el resultado.

Un PRD `Borrador` o `En revisión` no autoriza implementación; los artefactos con `Retención: Histórica`, estado `Archivado` o `Reemplazado`, o ubicados en `.agents/docs/archive/**`, no son fuentes activas. Las rutas legacy `docs/{discovery,prd,spec,design,archive}` solo se reportan para migración o confirmación y no reciben escrituras nuevas. Las delegaciones dependientes reciben un bloque `artifact_inputs` con las rutas resueltas, y `ms-project-init` refleja el root canónico, directorios, artefactos activos y rutas legacy sin escanear ampliamente el árbol.

Se leen metadatos antes del cuerpo. Un TDD `Implementado` queda fuera de `active_artifacts` y de la carga automática salvo ruta explícita del usuario/brief o decisión o contrato concreto afectado, cuya relevancia se indica. Coincidir en feature o ruta amplia, o mantener soportada la funcionalidad, no basta. Las specs `Implementado`/`Verificado` vigentes pueden seguir activas cuando describen comportamiento necesario; la regla no excluye PRDs.

### Ciclo de vida

`.agents/docs` es memoria de trabajo versionada. El happy path es conservar como máximo un artefacto activo por tipo y feature, actualizar sus metadatos y revisar su utilidad al cerrar un flujo nivel 3–4. `.agents/docs/archive` no es una fuente activa ni un vertedero.

| Artefacto | Regla de retención |
|---|---|
| Discovery | Temporal por defecto; al pasar a PRD se absorbe la evidencia útil y se propone eliminar la nota salvo evidencia única |
| PRD | Activo mientras la decisión siga vigente; después solo se conserva el rationale útil |
| Spec | Activa y actualizada mientras el comportamiento siga soportado |
| TDD | Al implementar, compacta duplicados, planes ejecutados, bitácoras, logs y métricas por corrida; conserva decisiones únicas con razón, consecuencia y enlaces. Promueve conocimiento a documentación autorizada existente; si falta destino, mantiene referencia mínima fuera de carga automática |

Los metadatos mínimos son `Feature ID`, `Estado`, `Última revisión` y `Retención: Activa | Temporal | Histórica`; `Contexto: global | branch:<ref> | release:<versión>` puede omitirse solo para `global`. `Feature ID` usa un ticket o ID explícito cuando existe; en otro caso usa el slug canónico inicial y queda congelado para todas las fases. `Revisar cuando` es obligatorio para `Temporal` e `Histórica`, salvo retención legal indefinida justificada; `Ámbito afectado`, `Implementado en` y `Reemplazado por` se añaden solo cuando aplican. `Histórica` exige un motivo de retención concreto. La unicidad se evalúa por tipo + `Feature ID` + `Contexto`, no por título o slug.

En el cierre, `ms-architect` reporta por artefacto `mantener activo`, `promover`, `archivar propuesto` o `eliminar propuesto`, con razón y evidencia. Un TDD no se mantiene activo solo porque su implementación exista. El archivo solo se propone por auditoría, compliance, una decisión mayor o petición del usuario; Git conserva el historial de material puramente operativo. Archivar, mover o eliminar requiere autorización explícita y nunca se ejecuta automáticamente. Fastlane y nivel 2 claro no generan PRD, spec, TDD ni informes de cierre; niveles 3–4 crean solo el artefacto que resuelve una necesidad, sin cadena obligatoria.

La fuente normativa del ciclo de vida es la skill `ms-artifact-lifecycle`, cargada bajo demanda. El prompt principal conserva selección de activos y gates esenciales.

#### Casos de mantenimiento

| Caso | Regla operativa |
|---|---|
| Pausa, cancelación o reemplazo nivel 3–4 | Ejecuta el gate; si continuará, conserva `Temporal` y fija un evento observable en `Revisar cuando` |
| Rama o versión divergente | Separa por `Contexto`; no combina ni dispone automáticamente |
| Cambio posterior | Para un artefacto seleccionado por relevancia, revisa `Ámbito afectado` y `Revisar cuando` antes de reutilizar; una ruta amplia no activa un TDD implementado |
| Referencias | Valida existencia, ciclos, identidad/contexto e `Implementado en`; referencias externas quedan no verificadas sin búsqueda automática |
| Promoción | Comprueba destino, contenido duradero, referencias actualizadas y que no haya duplicación activa antes de retirar el origen |
| Disposición autorizada | Muestra lote exacto, obtiene autorización, delega una única mutación a `ms-codex` y revisa diff/referencias; cualquier cambio relevante invalida la autorización |
| PRD o discovery pendiente | Emite `handoff_required` para el usuario; spec y TDD se actualizan por sus agentes dentro de sus límites |

Cuando el argumento normalizado completo sea `/ms-status docs` o `/ms-status maintenance`, lista solo cabeceras, metadatos y enlaces; lee cuerpos solo para resolver conflictos. Los TDDs implementados redundantes se reportan como candidatos con evidencia, no como activos. El modo normal —incluido un objetivo como `docs-api`— sigue focal, sin inventario previo ni lectura de todos los artefactos.

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
- **Contrato de idioma**: `preferences.documentation.language` respeta la petición vigente del usuario. Con `inherit` o sin preferencia conserva el idioma del documento; los documentos nuevos siguen la convención del proyecto, con español como fallback. Una edición puntual no autoriza traducir el documento completo. `preferences.documentation.paths` define directorios relativos documentales dentro de los permisos efectivos. Identificadores, citas, contratos y términos técnicos como `selected_status`, `POST /submissions`, `completed`, `feature`, `runtime`, `schema`, `endpoint`, `benchmark`, `[Unreleased]` y `Added` permanecen literales.
- **Test capabilities snapshot**: `ms-tester` reporta los comandos detectados/ejecutables para que el arquitecto los reutilice en verificaciones posteriores.
- **`ms-project-init`**: lee las fuentes del repositorio con herramientas nativas, contrasta `.agents/project.yaml` si existe y devuelve un snapshot conversacional. No exige el instalador ni crea contexto persistente automáticamente. El contexto es datos, no autorización para ejecutar scripts.
- **`work-unit-commits`**: skill para partir trabajo en unidades revisables con tests/docs acoplados al comportamiento que verifican.
- **`ms-spec`**: spec funcional ligera para cerrar comportamiento, reglas, criterios y contratos antes del TDD cuando el cambio lo justifica.
- **Cierre de spec**: `ms-spec` actualiza estado, retención, evidencia y drift; propone disposición sin borrar ni mover.
- **Preguntas interactivas con `question`**: `ms-architect`, `ms-plan` y `ms-discovery` usan el selector nativo de OpenCode para decisiones bloqueantes, entrevistas de producto y pausas entre fases.
- **`ms-doctor`**: diagnóstico read-only específico del cliente; no mezcla configuración ni inventarios de skills entre OpenCode, Claude Code y Codex.
- **Playwright MCP**: automatización e inspección del navegador mediante `npx -y @playwright/mcp@latest`, registrado para OpenCode y Codex.
- **Context7 MCP**: documentación actual de librerías/frameworks/APIs desde `https://mcp.context7.com/mcp`, usada antes de `webfetch` cuando aplica.
- **Presupuesto de velocidad/contexto**: el orquestador se mantiene delgado, evita delegaciones duplicadas, agrupa estado por ola y usa modelos rápidos en agentes operativos sin bajar el modelo de juicio para diseño, implementación compleja o seguridad.

## Skills Generales Instaladas

| Skill | Uso |
|---|---|
| `cognitive-doc-design` | Documentación para personas: guías, READMEs, RFCs y notas de revisión con baja carga cognitiva |
| `agent-instructions-design` | Crear, editar y revisar `AGENTS.md`, `CLAUDE.md` o equivalentes con reglas comprobables del proyecto |
| `work-unit-commits` | Partir cambios en unidades revisables con tests/docs acoplados |
| `ms-git` | Preparar commits, push, PRs y releases autorizados con una convención compartida y excepciones por proyecto |
| `ms-github` | Consultar issues, revisiones y Actions; crear o editar issues solicitadas desde el arquitecto |
| `judgment-day` | Doble juez ciego bajo petición explícita del usuario |
| `delegation-brief` | Preparar tareas autosuficientes para subagentes con contexto, límites, DoD y evidencia esperada |
| `ms-project-init` | Leer fuentes y contexto opcional para preparar un snapshot conversacional |
| `ms-artifact-lifecycle` | Identidad, vigencia y disposición documental bajo demanda para artefactos de nivel 3–4 o mantenimiento |
| `skill-creator` | Crear nuevas skills concisas y reutilizables; Codex usa su skill nativa equivalente |
| `skill-improver` | Auditar y mejorar skills existentes |

La selección depende del entregable y su propósito. `agent-instructions-design` es autónoma y no carga `cognitive-doc-design` automáticamente; conserva las decisiones del usuario y respeta las diferencias de alcance y carga de cada cliente. La selección explícita del usuario prevalece.

`ms-git` carga `references/git-conventions.md` desde su directorio instalado. Allí se mantienen ramas, destinos, mensajes e integración, con prioridad para la petición explícita del usuario y las excepciones del `AGENTS.md` aplicable. La instalación distribuye esa única definición a todos los clientes; cada repositorio conserva su propia automatización de releases.

`ms-github` complementa esa entrega con consultas de GitHub y creación/edición de issues solicitadas. Dentro de su misión, architect, codex, fastlane, debugger, tester y scout pueden leer repositorios, issues, PRs, diffs y checks; esos roles también leen ejecuciones, logs, workflows y releases. El arquitecto conserva las modificaciones remotas. Los workers consultan desde su brief sin cargar la skill. Los tres clientes aplican sus permisos nativos. El kit no añade listas de subcomandos ni bloqueos de `gh api`; las modificaciones remotas adicionales requieren una petición que las incluya.

Los roles de consulta pueden leer recursos REST con `gh api` sin lista de endpoints. GET, paginación, query strings y filtros se usan dentro de la tarea autorizada; payloads, métodos de escritura y cambios de host requieren autorización de la tarea y pueden activar aprobación del cliente. Un ejemplo es `gh api --paginate repos/<owner>/<repo>/pulls/<numero>/comments`.

| Petición | Selección esperada |
|---|---|
| «Crea AGENTS.md con las convenciones de este repositorio» | `agent-instructions-design` |
| «Revisa CLAUDE.md y señala contradicciones» | `agent-instructions-design`; revisión sin edición |
| «Crea instructions.md como instrucciones para los agentes» | `agent-instructions-design`; conserva el destino pedido y comprueba cómo lo carga el cliente |
| «Explica AGENTS.md en el README» | `cognitive-doc-design` |
| «Mejora la guía de onboarding de agentes» | `cognitive-doc-design` si está dirigida a personas |
| «Crea una skill para revisar migraciones» | `skill-creator` |
| «Mejora los triggers de esta skill» | `skill-improver` |
| «Haz commit de este cambio» o «Abre una PR» | `ms-git`; en un flujo `ms-*`, la ejecuta `ms-architect` |
| «Revisa los checks de la PR» o «Crea una issue con este bug» | `ms-github`; el arquitecto delega una investigación de CI cuando haga falta |
| «Divide esta feature en varias entregas» | `work-unit-commits`; la publicación se solicita por separado |
| «Corrige el bug siguiendo AGENTS.md» | Seguir las instrucciones existentes; estas skills documentales no se activan por esa mención |
| «Actualiza AGENTS.md y documenta su uso en el README» | Cada skill trabaja sobre su propio entregable |

`ms-codex`, `ms-fastlane` y `ms-tester` pueden cargar skills técnicas pertinentes seleccionadas por tarea, `skill_inputs` o `preferences.technicalSkills`; no protocolos de orquestación ni permisos adicionales. Las herramientas disponibles dependen del cliente; el kit no añade restricciones. OpenCode recibe `permission: {}`, Claude hereda herramientas y permisos, y Codex hereda los ajustes de la tarea padre.

## Niveles de orquestación

| Nivel | Uso | Flujo esperado |
|---|---|---|
| 0 | No modifica repo | Respuesta directa, sin subagentes |
| 1 | Cambio acotado de bajo riesgo | Una tarea a `ms-fastlane`, revisión de diff, smoke y cierre |
| 2 | Cambio claro que no califica como fastlane | Una tarea a `ms-codex`, verificación solo si aplica |
| 3 | Varias piezas coordinadas | Spec ligera si hay ambigüedad funcional, plan compacto por paquetes, integración y verificación |
| 4 | Alto impacto o diseño persistente | Spec si aporta, TDD, aprobación humana y ejecución por paquetes |

## Agentes

| Agente | Modelo OpenCode | Uso principal | Toca archivos |
|---|---|---|---|
| `ms-plan` | `openai/gpt-5.6-sol`, `variant: high` | Hace preguntas y crea PRDs | Solo `.agents/docs/prd/**` |
| `ms-discovery` | `openai/gpt-5.6-sol`, `variant: high` | Debate ideas tempranas, clasifica inconvenientes y propone experimentos | Solo `.agents/docs/discovery/**` si el usuario pide guardar |
| `ms-architect` | `openai/gpt-5.6-sol`, `variant: high` | Orquesta el flujo técnico, decide fastlane/spec/TDD y gestiona la entrega Git/PR autorizada | No |
| `ms-spec` | `openai/gpt-5.6-sol`, `variant: high` | Crea specs funcionales verificables y cierra specs tras implementación verificada | Solo `.agents/docs/spec/**` |
| `ms-designer` | `openai/gpt-5.6-sol`, `variant: high` | Crea TDDs desde PRDs/specs aprobados | Solo `.agents/docs/design/**` |
| `ms-fastlane` | `openai/gpt-5.6-luna`, `variant: low` | Ejecuta cambios acotados sin cadena de subagentes | Sí, scope limitado |
| `ms-codex` | `openai/gpt-5.6-sol`, `variant: high` | Implementa código con scope cerrado | Sí |
| `ms-tester` | `openai/gpt-5.6-luna`, `variant: low` | Corre tests, lint, type-check y format-check | No |
| `ms-scout` | `openai/gpt-5.6-luna`, `variant: low` | Explora código y determina blast radius | No |
| `ms-debugger` | `openai/gpt-5.6-sol`, `variant: high` | Reproduce bugs y encuentra causa raíz | No |
| `ms-writer` | `openai/gpt-5.6-sol`, `variant: medium` | Actualiza docs de usuario, README, changelog | Solo docs de usuario |
| `ms-security-auditor` | `openai/gpt-5.6-sol`, `variant: high` | Audita seguridad con evidencia | No |

El kit no establece `steps`, `maxTurns` ni límites de ciclos por instrucciones. Se conservan modelos, esfuerzos y responsabilidades por agente; los límites efectivos pertenecen al cliente.

`doctor --json` muestra `modelConfiguration`: configuración `declared` con fuentes, `installed` comprobada solo mediante coincidencia de plan/hashes/estado administrado y `effective` como `no comprobado` sin observar la sesión. `ms-architect` en Codex se instala como skill de la tarea principal; `declared.appliesToAgent: false` evita atribuirle un perfil de agente efectivo.

La evaluación manual descrita en `assets/evaluations/README.md` del paquete conserva registros anteriores y añade métricas opcionales `delegations`, `policy_denials`, `budget_exhaustions`, `duplicate_verifications` y `rework`. Los valores no observados son `null`, no cero. La comparación mantiene modelos constantes por cliente y conserva resultados incompletos o bloqueados; pasar tests estáticos no demuestra mejoras de rendimiento.

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
- `ms-architect` no edita. Puede usar bash para inspección acotada (`pwd`, `ls`, `wc`, `file`, `stat`, `rg`, `grep`, `git status`, `git diff`, `git show`, `git log`, `git rev-parse` y las variantes exactas `git branch`, `git branch --show-current`, `git branch --list`, `git branch -a` y `git branch -r`).
- `ms-architect` enruta el diagnóstico operativo de solo lectura sobre procesos, contenedores, servicios o CI a `ms-debugger`; tests/lint/typecheck/build a `ms-tester`; y una operación mutante explícitamente autorizada a `ms-codex`. No prueba primero comandos operativos bloqueados por su rol.
- `ms-architect` delega implementación, tests, linters, formatters, servidores, instalaciones y migraciones. Para entrega carga `ms-git`: prepara y ejecuta directamente commits, push y PRs autorizados dentro de los permisos efectivos del cliente. Pedir implementación termina con cambios revisables; pedir commit no publica, y pedir PR cubre sus pasos necesarios sin reconfirmación por comando. `work-unit-commits` define unidades; `ms-git` ejecuta su entrega, preserva cambios ajenos y comprueba las publicaciones antes de reintentar.
- `ms-architect` elige primero un nivel de orquestación; no decide agentes por inercia.
- `ms-architect` selecciona artefactos por relevancia antes de decidir spec/TDD o delegar; consulta metadatos antes del cuerpo y aplica la excepción explícita de los TDDs implementados descrita arriba, sin cargar todo `.agents/docs`.
- `ms-architect` es el único propietario del plan y del `TODO`; los workers ejecutan la misión recibida y entregan evidencia, sin crear un plan paralelo.
- `ms-architect` exige `Contrato para ms-architect` a todo worker o subagente de su flujo antes de aceptar resultados; esta regla no aplica a los primarios `ms-plan` y `ms-discovery`.
- `ms-architect` no invoca más de 3 subagentes por ola salvo justificación explícita, compacta cada ola en máximo 10 bullets y acepta contratos completos sin reanalizar reportes enteros.
- `ms-architect` mantiene log de lanzamientos para no invocar dos veces la misma huella `(subagente, objetivo, artefactos clave)` en la misma fase.
- `ms-architect` asigna un solo `verification_owner` final (`implementer | ms-tester | none`): `implementer` para `ms-codex` o `ms-fastlane`, `ms-tester` solo si queda un gate independiente pendiente y `none` cuando no hay ejecución verificable. Reutiliza cualquier `PASS` vigente tras contrastar cambios relevantes de código, configuración, dependencias, entorno y archivos sin seguimiento; evita duplicar verificaciones sin una causa concreta.
- `ms-architect` delega exploración cuando el área es transversal, el blast radius es incierto o una síntesis reduce materialmente el contexto; no usa contadores rígidos de archivos o herramientas.
- `ms-architect` ejecuta siempre un Security Smoke Gate tras cambios de `ms-codex` o `ms-fastlane`; si el diff contiene señales reales de secretos/config sensible o lógica de seguridad, invoca `ms-security-auditor` en modo ligero. Una ruta sensible con cambios solo visuales no basta para escalar.
- `ms-architect` aplica Gatekeeper de Fases antes de avanzar entre spec, TDD, implementación, verificación, documentación y cierre.
- `ms-architect` considera tamaño, riesgo e independencia en cambios nivel 3-4; superar 400 líneas sugiere revisar la partición, no la impone.
- `ms-architect` carga la skill `ms-project-init` cuando no hay snapshot confiable de stack/comandos o antes de un nivel 4.
- `ms-architect` carga `work-unit-commits` para partir nivel 3-4 por comportamiento entregable, no por tipo de archivo.
- `ms-architect` usa `ms-spec` solo para cambios nivel 3-4, features ambiguas, contratos públicos, datos, seguridad, migraciones o decisiones irreversibles; no lo usa en fastlane ni nivel 2 claro.
- `ms-architect` delega el modo de cierre de `ms-spec` antes del cierre final si una implementación nivel 3-4 tuvo spec funcional y el resultado afecta comportamiento observable. La spec registra `Implementado` o `Verificado` y evidencia; `Reemplazado` enlaza la spec vigente. `Archivado`, mover o eliminar se proponen según trazabilidad y requieren autorización explícita.
- `ms-architect` usa `judgment-day` únicamente cuando el usuario pide doble juez o revisión adversarial.
- `ms-architect` usa `delegation-brief` antes de delegar paquetes nivel 3-4, TDD/spec, bugs, reviews, auditorías, verificaciones o retries; fastlane y nivel 2 trivial pueden usar brief corto.
- `/ms-status` informa en solo lectura el estado observable, `Estado`/`Retención` de artefactos activos y candidatos de disposición con evidencia; no continúa el trabajo ni decide borrados.
- `ms-spec` no diseña arquitectura técnica ni implementación; produce comportamiento, reglas, casos borde y criterios verificables en `.agents/docs/spec/**`, y al cierre registra evidencia, estado final y drift.
- `ms-designer` no asigna ejecutores; diseña el TDD y, en modo cierre, solo actualiza su propio artefacto con evidencia suministrada y propone promoción o disposición.
- `ms-designer` incluye previsión de revisión en la sección de paquetes del TDD.
- `/ms-fastlane` entra directamente al ejecutor para una unidad coherente y verificable de bajo riesgo. Tres archivos y 120 LOC son señales orientativas, no límites obligatorios. Mantiene exclusiones por contrato público, datos persistidos, seguridad, infra, CI/CD, dependencias, ambigüedad de producto o decisión irreversible. Si necesita coordinación, devuelve el control sin iniciar subagentes.
- `/ms-handoff` entrega una nota Markdown en la conversación con objetivo, decisiones, archivos, Git observado, vigencia de verificación y siguiente acción. Solo persiste por petición con ruta explícita, mediante una delegación acotada autorizada; no sobrescribe archivos existentes ni sustituye la comprobación del estado real al retomar.
- `ms-codex` no rediseña ni amplía scope.
- `ms-codex` agrupa lectura, edición y verificación; continúa mientras haya progreso observable y devuelve `partial` o `blocked` si repite el mismo fallo sin nueva evidencia. Puede combinar operaciones permitidas con `&&`, `||`, `;` o pipes; cada operación conserva sus permisos y requiere evidencia de ejecución. Los scripts, intérpretes y redirecciones locales siguen el alcance autorizado; la ejecución confía en el código del proyecto. Respeta el timeout documentado por el repositorio; si no existe, usa 300 segundos para un comando focal y 900 segundos para la suite completa. Un timeout se reporta y no se reintenta automáticamente.
- `ms-tester` no edita código. Las cachés y artefactos de verificación requieren rutas acotadas y autorización vigente, reutilizable sin pedirla de nuevo; el nombre del script no acredita sus efectos. La verificación puede usar candidatos convencionales (`test`, `lint`, `typecheck`, `check`, `build`, `validate`, `verify`, `ci`, `quality`), además de `pnpm build`, `pnpm exec ng test`, checks de Prettier con `--check` y las consultas `alembic heads`/`alembic history`, sujetos a revisión y permisos efectivos. Usa un gate agregado solo si cubre exactamente los gates pendientes y no repite un `PASS` vigente reutilizable. El cierre acepta cobertura vigente ejecutada o reutilizada; una denegación del rol se reporta con su causa y la falta de información no se presenta como esa denegación. Los timeouts de fallback son 300 segundos para comandos focales y 900 segundos para la suite completa, salvo que el repositorio documente explícitamente una duración mayor.
- `ms-scout` solo ejecuta comandos de inspección de solo lectura: lectura, búsqueda, listados y git read-only.
- `ms-scout` no revisa diffs terminados: mapea código y blast radius. La revisión general corresponde a `ms-architect`; seguridad profunda a `ms-security-auditor`.
- `ms-debugger` no arregla bugs; solo reporta causa raíz.
- `ms-writer` no toca PRDs ni TDDs.
- `ms-security-auditor` no escribe fixes.
- `ms-architect` usa el camino mínimo para cambios de bajo riesgo: no invoca scout, spec, TDD, writer, auditoría ni tester por prudencia genérica si no se activan disparadores explícitos.
- Los subagentes que no orquestan devuelven al arquitecto cualquier necesidad de delegación.
- El kit no añade políticas de permisos en ningún cliente. OpenCode recibe `permission: {}` en configuración y agentes. La opción antigua `--permission-profile` se ha retirado; los controles efectivos corresponden al cliente.
- La inspección común de `ms-spec` y `ms-designer` se limita a `git status --short` y `git --no-pager diff --no-ext-diff --no-textconv --stat -- <directorio propio>` o su variante `--name-only`, desde la raíz del proyecto. No habilita patches, `--check` ni shell general; Codex expresa el límite por instrucciones.
- Los roles mantienen sus responsabilidades; el tester ejecuta verificaciones sin editar código ni snapshots. Los workers no mantienen listas `TODO` ni coordinan agentes.

## Runtime compartido

OpenCode no carga `agents-shared.md` globalmente. El instalador embebe esas reglas una sola vez en cada agente generado y conserva [agents-shared.md](agents-shared.md) como referencia humana.

El ciclo de sesiones y delegaciones queda bajo control del usuario y de las instrucciones de los agentes; no hay plugins que intercepten `task`.

## Diferencias De Runtime

| Cliente | Ejecución | Perfil económico de `ms-fastlane` | Enforcement relevante |
|---|---|---|---|
| OpenCode | Delegación nativa | `openai/gpt-5.6-luna`, `variant: low` | Permisos y límites nativos |
| Claude Code | Agent nativo | Haiku, esfuerzo bajo | Herramientas, permisos y límites heredados |
| Codex | Subagente nativo | Modelo heredado, razonamiento bajo | Contrato de resultado y configuración de la tarea padre |

OpenCode carga MCPs desde `opencode.json` y complementos de la TUI desde `tui.json`. La configuración declara Playwright MCP como servidor local y Context7 como servidor remoto; su clave se resuelve exclusivamente desde `CONTEXT7_API_KEY`, nunca desde el catálogo. Los agentes con acceso a documentación deben preferir Context7 antes de `webfetch` cuando aplique.

OpenCode instala automáticamente los plugins npm declarados en su configuración. El kit no distribuye plugins TypeScript locales, `node_modules`, locks ni cachés.

La TUI carga las preferencias portables desde `tui.json`. El kit no declara `@mohak34/opencode-notifier` y mantiene desactivadas las notificaciones propias de OpenCode para que el entorno anfitrión pueda centralizarlas.

Este documento queda como documentación humana del sistema: mapa de agentes, flujo recomendado y reglas de alto nivel. Si cambias el contrato operativo, actualiza `agents-shared.md` y las referencias de los subagentes que lo usan.

Si el cliente ejecuta una invocación directa como worker o fork (por ejemplo `context: fork` de Claude), conserva el contrato interno; el padre resume al usuario. La ausencia de un arquitecto inicial no convierte ese worker en agente primario.
