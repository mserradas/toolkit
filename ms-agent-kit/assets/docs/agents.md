# Agentes opencode

> Actualizado: 2026-07-13

Este equipo separa producto, arquitectura, implementación, verificación y auditoría.

## Flujo base

```text
Idea -> ms-plan -> PRD
Idea temprana -> ms-discovery -> experimentos / decisión de PRD
PRD aprobado -> ms-architect -> ms-spec si aporta -> ms-designer -> TDD
Cambio acotado -> ms-architect -> ms-fastlane -> revisión/smoke -> cierre
Cambio con scope claro -> ms-architect -> ms-codex -> verificación si aplica -> cierre
TDD aprobado -> ms-architect -> work units -> ms-progress -> verificación -> cierre de spec si aplica -> cierre
Retomar trabajo -> /ms-continue <slug> -> lee docs/status/** -> ejecuta una siguiente acción clara
```

## Comandos

| Comando | Uso |
|---|---|
| `/ms-status [objetivo]` | Estado de solo lectura de fase, artefactos, diff, verificación, riesgos y siguiente acción recomendada |
| `/ms-continue [slug|ruta]` | Retoma un workflow desde `docs/status/**`, valida recibos de revisión y ejecuta solo la próxima acción clara |
| `/ms-models [filtro]` | Diagnóstico de solo lectura de modelos, variante activa, variantes disponibles y recomendaciones para agentes `ms-*` |
| `/ms-doctor [full]` | Health check read-only de OpenCode, agentes `ms-*`, comandos, skills, plugins, cache y permisos de secretos |
| `/ms-skills [refresh|check|list]` | Refresca o revisa `.atl/skill-registry.md`, índice común de skills instaladas en roots estándar |

## Mejoras inspiradas por Gentle AI

Se incorporan ideas útiles sin añadir una segunda familia de agentes:

- **Preflight nivel 4**: antes de programas grandes, `ms-architect` fija modo de ejecución, estrategia de entrega, presupuesto de revisión, persistencia/idioma de artefactos y comandos de verificación conocidos.
- **Guard de carga de revisión**: el TDD estima tamaño y riesgo de revisión; si un paquete supera el presupuesto (400 líneas por defecto), `ms-architect` divide, pide excepción explícita o cambia estrategia de entrega.
- **Lentes 4R con agentes existentes**: `ms-security-auditor` cubre Risk; `ms-scout` cubre Readability, Reliability y Resilience en modo revisión dirigida.
- **Gatekeeper entre fases**: antes de avanzar, `ms-architect` valida contrato, existencia de artefactos, coherencia de rutas/comandos, drift contra la entrada y siguiente acción.
- **Contrato de idioma**: conversación en el idioma del usuario; artefactos persistentes en el idioma del repo o inglés técnico por defecto.
- **Test capabilities snapshot**: `ms-tester` reporta los comandos detectados/ejecutables para que el arquitecto los reutilice en verificaciones posteriores.
- **`ms-project-init`**: skill ligera para detectar stack, arquitectura, comandos de verificación y riesgos desconocidos antes de cambios grandes.
- **`work-unit-commits`**: skill para partir trabajo en unidades revisables con tests/docs acoplados al comportamiento que verifican.
- **`ms-spec`**: spec funcional ligera para cerrar comportamiento, reglas, criterios y contratos antes del TDD cuando el cambio lo justifica.
- **Cierre de spec**: modo de `ms-spec` inspirado en OpenSpec archive; actualiza estado, evidencia y drift para que la spec siga siendo útil.
- **`ms-progress/v1`**: ledger estructurado en `docs/status/**` para retomar paquetes y fases en otra ventana sin usar el TDD como tracker.
- **`/ms-continue`**: comando para retomar desde `docs/status/**`; la utilidad `workflow next` valida el esquema y devuelve una sola siguiente acción o se detiene.
- **Recibos de revisión**: `ms-progress` registra revisiones aceptadas con alcance, huella y evidencia; `review fingerprint` calcula una huella reproducible del worktree o staged sin exponer el diff.
- **Preguntas interactivas con `question`**: `ms-architect`, `ms-plan` y `ms-discovery` usan el selector nativo de OpenCode para decisiones bloqueantes, entrevistas de producto y pausas entre fases.
- **`ms-doctor`**: comando de diagnóstico read-only para validar configuración, permisos, agentes, comandos, skills, plugins y cache.
- **`ms-skills` / skill registry**: un índice común, como Gentle AI, para que `ms-architect` encuentre skills globales y de proyecto instaladas en roots estándar sin duplicar artefactos por cliente.
- **Context7 MCP**: documentación actual de librerías/frameworks/APIs desde `https://mcp.context7.com/mcp`, usada antes de `webfetch` cuando aplica.
- **`ms-model-variants`**: plugin local inspirado en Gentle AI que cachea modelos/variantes en `~/.config/opencode/cache/model-variants.json`; `/ms-models` lo usa para revisar asignaciones sin cambiar agentes automáticamente.
- **Presupuesto de velocidad/contexto**: el orquestador se mantiene delgado, evita delegaciones duplicadas, agrupa estado por ola y usa modelos rápidos en agentes operativos sin bajar el modelo de juicio para diseño, implementación compleja o seguridad.

## Skills Generales Instaladas

| Skill | Uso |
|---|---|
| `cognitive-doc-design` | Docs, guías, READMEs, RFCs y notas de revisión con baja carga cognitiva |
| `comment-writer` | Comentarios de PR/issues, feedback y respuestas de mantenimiento |
| `work-unit-commits` | Partir cambios en unidades revisables con tests/docs acoplados |
| `chained-pr` | Diseñar PRs encadenados/stacked cuando se supera el presupuesto de revisión |
| `judgment-day` | Doble juez ciego para revisar diffs, specs, TDDs o slices de alto riesgo |
| `delegation-brief` | Preparar tareas autosuficientes para subagentes con contexto, límites, DoD y evidencia esperada |
| `ms-project-init` | Crear un snapshot operativo mínimo de stack, arquitectura, verificación y riesgos antes de nivel 4 o repos desconocidos |
| `skill-creator` | Crear nuevas skills concisas y reutilizables |
| `skill-improver` | Auditar y mejorar skills existentes |
| `skill-registry` | Indexar skills por trigger, scope y ruta exacta en `.atl/skill-registry.md` |
 
Solo `ms-architect`, `ms-spec`, `ms-designer` y `ms-writer` tienen `skill: allow` para estas skills generales. Los agentes ejecutores y de solo lectura mantienen `skill: deny` salvo cambio explícito.

## Niveles de orquestación

| Nivel | Uso | Flujo esperado |
|---|---|---|
| 0 | No modifica repo | Respuesta directa, sin subagentes |
| 1 | Cambio acotado de bajo riesgo | Una tarea a `ms-fastlane`, revisión de diff, smoke y cierre |
| 2 | Cambio claro que no califica como fastlane | Una tarea a `ms-codex`, verificación solo si aplica |
| 3 | Varias piezas coordinadas | Spec ligera si hay ambigüedad funcional, plan compacto por paquetes, integración y verificación |
| 4 | Alto impacto o diseño persistente | Spec si aporta, TDD, aprobación humana y ejecución por paquetes |

## Agentes

| Agente | Modelo | Uso principal | Toca archivos |
|---|---|---|---|
| `ms-plan` | `openai/gpt-5.6-sol`, `variant: high` | Hace preguntas y crea PRDs | Solo `docs/prd/**` |
| `ms-discovery` | `openai/gpt-5.6-sol`, `variant: high` | Debate ideas tempranas, clasifica inconvenientes y propone experimentos | Solo `docs/discovery/**` si el usuario pide guardar |
| `ms-architect` | `openai/gpt-5.6-sol`, `variant: high` | Orquesta el flujo técnico, inspecciona en solo lectura y decide fastlane/spec/TDD | No |
| `ms-spec` | `openai/gpt-5.6-sol`, `variant: high` | Crea specs funcionales verificables y cierra specs tras implementación verificada | Solo `docs/spec/**` |
| `ms-designer` | `openai/gpt-5.6-sol`, `variant: high` | Crea TDDs desde PRDs/specs aprobados | Solo `docs/design/**` |
| `ms-progress` | `openai/gpt-5.6-luna`, `variant: low` | Registra progreso operativo, paquetes, evidencia, verificación y próxima acción | Solo `docs/status/**` |
| `ms-fastlane` | `openai/gpt-5.6-sol`, `variant: medium` | Ejecuta cambios acotados sin cadena de subagentes | Sí, scope limitado |
| `ms-codex` | `openai/gpt-5.6-sol`, `variant: high` | Implementa código con scope cerrado | Sí |
| `ms-tester` | `openai/gpt-5.6-luna`, `variant: low` | Corre tests, lint, type-check y format-check | No |
| `ms-scout` | `openai/gpt-5.6-luna`, `variant: low` | Explora codigo y revisa diffs en solo lectura | No |
| `ms-debugger` | `openai/gpt-5.6-sol`, `variant: high` | Reproduce bugs y encuentra causa raíz | No |
| `ms-writer` | `openai/gpt-5.6-sol`, `variant: medium` | Actualiza docs de usuario, README, changelog | Solo docs de usuario |
| `ms-security-auditor` | `openai/gpt-5.6-sol`, `variant: high` | Audita seguridad con evidencia | No |

## Cuando usar cada uno

- Usa `ms-plan` cuando todavía no está claro qué construir.
- Usa `ms-discovery` cuando la idea aún está en fase de oportunidad, debate, validación o decisión de si merece PRD.
- Usa `ms-architect` cuando hay que modificar el repo o coordinar subagentes.
- Usa `ms-spec` cuando hay que cerrar comportamiento, reglas, criterios de aceptación o impacto funcional antes del TDD, o cuando hay que cerrar una spec tras implementación verificada.
- Usa `ms-designer` cuando un cambio necesita TDD.
- Usa `ms-progress` para registrar o retomar progreso persistente de paquetes nivel 3-4.
- Usa `ms-fastlane` para cambios acotados, claros y seguros.
- Usa `ms-codex` para escribir código con scope cerrado.
- Usa `ms-tester` para verificar con comandos.
- Usa `ms-scout` para entender un modulo o revisar un diff grande.
- Usa `ms-debugger` para investigar bugs antes de arreglarlos.
- Usa `ms-writer` para documentación visible al consumidor.
- Usa `ms-security-auditor` si toca auth, permisos, secretos, datos sensibles, input externo, dependencias o infra expuesta.

## Reglas clave

- `ms-plan` pregunta antes de escribir PRD. No inventa contexto.
- `ms-plan`, `ms-discovery` y `ms-architect` usan `question` para input bloqueante del usuario. Los subagentes devuelven `needs_user_input` y no preguntan directamente salvo invocación directa.
- `ms-discovery` no crea PRDs, TDDs ni implementación. Clasifica inconvenientes, supuestos, riesgos y experimentos; si la idea madura, recomienda pasar a `ms-plan`.
- `ms-architect` no edita. Puede usar bash solo para inspección de solo lectura acotada (`pwd`, `ls`, `wc`, `file`, `stat`, `rg`, `grep`, `git status`, `git diff`, `git show`, `git log`, `git branch`, `git rev-parse`).
- `ms-architect` delega tests, linters, formatters, servidores, instalaciones, migraciones, commits, pushes y cualquier comando con efectos secundarios.
- `ms-architect` elige primero un nivel de orquestación; no decide agentes por inercia.
- `ms-architect` exige `Contrato para ms-architect` a todo subagente antes de aceptar resultados.
- `ms-architect` no invoca más de 3 subagentes por ola salvo justificación explícita, compacta cada ola en máximo 10 bullets y aplica Aceptación Rápida sin reanalizar reportes completos.
- `ms-architect` mantiene log de lanzamientos para no invocar dos veces la misma huella `(subagente, objetivo, artefactos clave)` en la misma fase.
- `ms-architect` consulta `Recibos De Revisión` antes de relanzar `ms-scout` modo revisión, `ms-security-auditor` o `judgment-day`; si la huella sigue vigente, reutiliza la evidencia.
- `ms-architect` detiene expansión tras 20 herramientas directas, 5 lecturas exploratorias o 3 olas dentro de una solicitud; compacta estado, registra progreso si aplica y continúa solo con una siguiente acción concreta.
- `ms-architect` ejecuta siempre un Security Smoke Gate tras cambios de `ms-codex` o `ms-fastlane`; si el diff contiene señales reales de secretos/config sensible o lógica de seguridad, invoca `ms-security-auditor` en modo ligero. Una ruta sensible con cambios solo visuales no basta para escalar.
- `ms-architect` aplica Gatekeeper de Fases antes de avanzar entre spec, TDD, implementación, verificación, documentación y cierre.
- `ms-architect` aplica el guard de carga de revisión en cambios nivel 3-4: presupuesto por defecto 400 líneas cambiadas por paquete/PR; si se excede, divide o pide excepción explícita.
- `ms-architect` carga la skill `ms-project-init` cuando no hay snapshot confiable de stack/comandos o antes de un nivel 4.
- `ms-architect` carga `work-unit-commits` para partir nivel 3-4 por comportamiento entregable, no por tipo de archivo.
- `ms-architect` usa `ms-spec` solo para cambios nivel 3-4, features ambiguas, contratos públicos, datos, seguridad, migraciones o decisiones irreversibles; no lo usa en fastlane ni nivel 2 claro.
- `ms-architect` delega el modo de cierre de `ms-spec` antes del cierre final si una implementación nivel 3-4 tuvo spec funcional y el resultado afecta comportamiento observable. La spec se marca `Implementado`, `Verificado`, `Archivado` o `Reemplazado` con evidencia; no se borra.
- `ms-architect` usa `judgment-day` cuando el usuario pide doble juez/revisión adversarial o cuando un diff/TDD/spec de alto riesgo necesita confirmación independiente; no aplica a fastlane ni cambios triviales.
- `ms-architect` usa `delegation-brief` antes de delegar paquetes nivel 3-4, TDD/spec, bugs, reviews, auditorías, verificaciones o retries; fastlane y nivel 2 trivial pueden usar brief corto.
- `ms-architect` usa `.atl/skill-registry.md` para decidir qué skill cargar o pasar a un subagente. Si falta o cambió el set de skills, recomienda `/ms-skills refresh`.
- `ms-architect` usa `ms-progress` después de aceptar paquetes, verificaciones, revisiones, bloqueos o cierres de fase en nivel 3-4. `/ms-status` lee `docs/status/**` como fuente primaria de progreso si existe; `/ms-continue` lo usa para ejecutar la próxima acción.
- `ms-spec` no diseña arquitectura técnica ni implementación; produce comportamiento, reglas, casos borde y criterios verificables en `docs/spec/**`, y al cierre registra evidencia, estado final y drift.
- `ms-designer` no asigna ejecutores; solo diseña el TDD.
- `ms-progress` no diseña ni implementa; solo actualiza `docs/status/**` con evidencia aceptada, incluyendo recibos de revisión cuando aplica.
- `ms-designer` incluye previsión de revisión en la sección de paquetes del TDD.
- `ms-fastlane` se bloquea si el cambio no califica como acotado: máximo 3 archivos totales, <=120 LOC estimadas, sin contrato público, datos persistidos, seguridad, infra, CI/CD, dependencias, ambigüedad de producto ni decisión irreversible.
- `ms-codex` no rediseña ni amplía scope.
- `ms-codex` agrupa lectura, edición y verificación; si no converge tras 12 herramientas, 3 ciclos edit/test o 2 intentos de corrección, devuelve `partial` o `blocked` con evidencia en vez de seguir en bucle.
- `ms-tester` no modifica archivos.
- `ms-scout` solo ejecuta comandos de inspección de solo lectura: lectura, búsqueda, listados y git read-only.
- `ms-scout` puede revisar diffs con lentes `Readability`, `Reliability` y `Resilience`; seguridad profunda sigue siendo de `ms-security-auditor`.
- `ms-debugger` no arregla bugs; solo reporta causa raíz.
- `ms-writer` no toca PRDs ni TDDs.
- `ms-security-auditor` no escribe fixes.
- `ms-architect` usa el camino mínimo para cambios de bajo riesgo: no invoca scout, spec, TDD, writer, auditoría ni tester por prudencia genérica si no se activan disparadores explícitos.
- Todo subagente que no orquesta declara `task: deny` explícito.
- Los agentes `ms-*` declaran `websearch`, `todowrite` y `lsp` en `deny`. `skill` queda permitido solo en `ms-architect`, `ms-spec`, `ms-designer` y `ms-writer` para skills generales; ejecutores y agentes de solo lectura lo mantienen en `deny`.
- Los artefactos instalados incorporan una denylist de secretos por agente para lectura directa y comandos evidentes: `.env`, `.env.local`, entornos reales (`production`, `staging`, `test`, `development`), `.ssh`, `.aws/credentials`, `credentials.json`, `.npmrc`, `.netrc`, `.kube/config`, llaves `*.pem`/`*.key` y `secrets/**`. Es una red práctica de protección, no una política de bloqueo general; `.env.example` sigue permitido.
- La lectura genérica vía bash (`cat`, `head`, `tail`, `find`, `tree`, `rg`, `grep`) queda permitida en agentes operativos de lectura/código/verificación (`ms-codex`, `ms-tester`, `ms-debugger`, `ms-security-auditor`, `ms-scout`) para reducir fricción. Las denegaciones añadidas al generar el agente se evalúan después de esos permisos.
- `ms-debugger` tiene `env` y `printenv*` en `deny` para evitar exposición accidental de secretos.
- `ms-codex` deja en `ask` instalaciones, publicación/red (`git push`, `ssh`, `scp`, `nc`) y comandos desconocidos; comandos destructivos de git/filesystem quedan en `deny` directamente.
- `ms-debugger` permite verificaciones seguras concretas (`test`, `lint`, `typecheck`, `check`) para reproducir bugs sin fricción, pero mantiene scripts no clasificados, Docker/Kubernetes logs/inspect y comandos desconocidos en `ask`.
- Los agentes de solo lectura bloquean flags mutantes como `--fix`, `--autofix`, `--write` y actualizaciones de snapshots; logs/inspect sensibles de Docker/Kubernetes quedan en `ask`.

## Runtime compartido

OpenCode no carga `agents-shared.md` globalmente. El instalador embebe esas reglas una sola vez en cada agente generado y conserva [agents-shared.md](agents-shared.md) como referencia humana.

OpenCode carga tres plugins locales desde `plugins/**`: [ms-model-variants.ts](../plugins/ms-model-variants.ts), que cachea durante 24 horas solo los providers conectados; [ms-skill-registry.ts](../plugins/ms-skill-registry.ts), que refresca un registry ya inicializado; y [ms-workflow-tools.ts](../plugins/ms-workflow-tools.ts), que valida ledgers y calcula huellas de revisión sin depender de ejecutables externos. Ninguno modifica archivos del proyecto durante el primer arranque.

OpenCode carga plugins npm y MCPs desde `opencode.json`. La configuración declara notifier y Context7; la clave de Context7 se resuelve exclusivamente desde `CONTEXT7_API_KEY`, nunca desde el catálogo. Los agentes con acceso a documentación deben preferir Context7 antes de `webfetch` cuando aplique.

OpenCode instala automáticamente los plugins npm con Bun al arrancar. El `package.json` del directorio de configuración declara `@opencode-ai/plugin` para el plugin TypeScript local; no se distribuyen `node_modules`, locks ni cachés.

El índice único vive en `.atl/skill-registry.md`; su cache es `.atl/.skill-registry.cache.json`. Es un índice de rutas, no una copia compactada ni un inventario de built-ins. Escanea exactamente `<root>/<skill>/SKILL.md` en las roots estándar de OpenCode, Claude Code, Codex y Agent Skills, con precedencia de proyecto. La primera ejecución explícita de `/ms-skills refresh` inicializa `.atl/` en `.gitignore`; después OpenCode puede refrescarlo al arrancar.

La TUI carga las preferencias portables desde `tui.json`, incluido `opencode-subagent-statusline`. El estado y cache del plugin se generan localmente y no se distribuyen.

Este documento queda como documentación humana del sistema: mapa de agentes, flujo recomendado y reglas de alto nivel. Si cambias el contrato operativo, actualiza `agents-shared.md` y las referencias de los subagentes que lo usan.
