# Agentes opencode

> Actualizado: 2026-07-05

Este equipo separa producto, arquitectura, implementación, verificación y auditoría.

## Flujo base

```text
Idea -> ms-plan -> PRD
Idea temprana -> ms-discovery -> experimentos / decisión de PRD
PRD aprobado -> ms-architect -> ms-spec si aporta -> ms-designer -> TDD
Cambio acotado -> ms-architect -> ms-fastlane -> revisión/smoke -> cierre
Cambio con scope claro -> ms-architect -> ms-codex -> verificación si aplica -> cierre
TDD aprobado -> ms-architect -> paquetes -> ms-progress -> verificación -> cierre
```

## Comandos

| Comando | Uso |
|---|---|
| `/ms-status [objetivo]` | Estado de solo lectura de fase, artefactos, diff, verificación, riesgos y siguiente acción recomendada |
| `/ms-models [filtro]` | Diagnóstico de solo lectura de modelos, `reasoningEffort`, variantes disponibles y recomendaciones para agentes `ms-*` |

## Mejoras inspiradas por Gentle AI

Se incorporan ideas útiles sin añadir una segunda familia de agentes:

- **Preflight nivel 4**: antes de programas grandes, `ms-architect` fija modo de ejecución, estrategia de entrega, presupuesto de revisión, persistencia/idioma de artefactos y comandos de verificación conocidos.
- **Guard de carga de revisión**: el TDD estima tamaño y riesgo de revisión; si un paquete supera el presupuesto (400 líneas por defecto), `ms-architect` divide, pide excepción explícita o cambia estrategia de entrega.
- **Lentes 4R con agentes existentes**: `ms-security-auditor` cubre Risk; `ms-scout` cubre Readability, Reliability y Resilience en modo revisión dirigida.
- **Gatekeeper entre fases**: antes de avanzar, `ms-architect` valida contrato, existencia de artefactos, coherencia de rutas/comandos, drift contra la entrada y siguiente acción.
- **Contrato de idioma**: conversación en el idioma del usuario; artefactos persistentes en el idioma del repo o inglés técnico por defecto.
- **Test capabilities snapshot**: `ms-tester` reporta los comandos detectados/ejecutables para que el arquitecto los reutilice en verificaciones posteriores.
- **`ms-project-init`**: protocolo ligero para detectar stack, arquitectura, comandos de verificación y riesgos desconocidos antes de cambios grandes.
- **`ms-work-unit`**: protocolo para partir trabajo en unidades revisables con tests/docs acoplados al comportamiento que verifican.
- **`ms-spec`**: spec funcional ligera para cerrar comportamiento, reglas, criterios y contratos antes del TDD cuando el cambio lo justifica.
- **`ms-progress`**: ledger simple en `docs/status/**` para retomar paquetes y fases en otra ventana sin usar el TDD como tracker.
- **`ms-model-variants`**: plugin local inspirado en Gentle AI que cachea modelos/variantes en `~/.config/opencode/cache/model-variants.json`; `/ms-models` lo usa para revisar asignaciones sin cambiar agentes automáticamente.

## Skills Generales Instaladas

| Skill | Uso |
|---|---|
| `cognitive-doc-design` | Docs, guías, READMEs, RFCs y notas de revisión con baja carga cognitiva |
| `comment-writer` | Comentarios de PR/issues, feedback y respuestas de mantenimiento |
| `work-unit-commits` | Partir cambios en unidades revisables con tests/docs acoplados |
| `chained-pr` | Diseñar PRs encadenados/stacked cuando se supera el presupuesto de revisión |
| `judgment-day` | Doble juez ciego para revisar diffs, specs, TDDs o slices de alto riesgo |
| `delegation-brief` | Preparar tareas autosuficientes para subagentes con contexto, límites, DoD y evidencia esperada |
| `skill-creator` | Crear nuevas skills concisas y reutilizables |
| `skill-improver` | Auditar y mejorar skills existentes |

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
| `ms-plan` | `openai/gpt-5.5` | Hace preguntas y crea PRDs | Solo `docs/prd/**` |
| `ms-discovery` | `openai/gpt-5.5` | Debate ideas tempranas, clasifica inconvenientes y propone experimentos | Solo `docs/discovery/**` si el usuario pide guardar |
| `ms-architect` | `openai/gpt-5.5`, `reasoningEffort: high`, `steps: 48` | Orquesta el flujo técnico, inspecciona en solo lectura y decide fastlane/spec/TDD | No |
| `ms-spec` | `openai/gpt-5.5` | Crea specs funcionales verificables antes del TDD cuando el cambio lo justifica | Solo `docs/spec/**` |
| `ms-designer` | `openai/gpt-5.5` | Crea TDDs desde PRDs/specs aprobados | Solo `docs/design/**` |
| `ms-progress` | `openai/gpt-5.5` | Registra progreso operativo, paquetes, evidencia, verificación y próxima acción | Solo `docs/status/**` |
| `ms-fastlane` | `openai/gpt-5.5` | Ejecuta cambios acotados sin cadena de subagentes | Sí, scope limitado |
| `ms-codex` | `openai/gpt-5.5` | Implementa código con scope cerrado | Sí |
| `ms-tester` | `openai/gpt-5.5` | Corre tests, lint, type-check y format-check | No |
| `ms-scout` | `openai/gpt-5.5` | Explora codigo y revisa diffs en solo lectura | No |
| `ms-debugger` | `openai/gpt-5.5` | Reproduce bugs y encuentra causa raíz | No |
| `ms-writer` | `openai/gpt-5.5` | Actualiza docs de usuario, README, changelog | Solo docs de usuario |
| `ms-security-auditor` | `openai/gpt-5.5` | Audita seguridad con evidencia | No |

## Cuando usar cada uno

- Usa `ms-plan` cuando todavía no está claro qué construir.
- Usa `ms-discovery` cuando la idea aún está en fase de oportunidad, debate, validación o decisión de si merece PRD.
- Usa `ms-architect` cuando hay que modificar el repo o coordinar subagentes.
- Usa `ms-spec` cuando hay que cerrar comportamiento, reglas, criterios de aceptación o impacto funcional antes del TDD.
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
- `ms-discovery` no crea PRDs, TDDs ni implementación. Clasifica inconvenientes, supuestos, riesgos y experimentos; si la idea madura, recomienda pasar a `ms-plan`.
- `ms-architect` no edita. Puede usar bash solo para inspección de solo lectura acotada (`pwd`, `ls`, `wc`, `file`, `stat`, `rg`, `grep`, `git status`, `git diff`, `git show`, `git log`, `git branch`, `git rev-parse`).
- `ms-architect` delega tests, linters, formatters, servidores, instalaciones, migraciones, commits, pushes y cualquier comando con efectos secundarios.
- `ms-architect` elige primero un nivel de orquestación; no decide agentes por inercia.
- `ms-architect` exige `Contrato para ms-architect` a todo subagente antes de aceptar resultados.
- `ms-architect` no invoca más de 3 subagentes por ola salvo justificación explícita, compacta cada ola en máximo 10 bullets y aplica Aceptación Rápida sin reanalizar reportes completos.
- `ms-architect` ejecuta siempre un Security Smoke Gate tras cambios de `ms-codex` o `ms-fastlane`; si el diff contiene señales reales de secretos/config sensible o lógica de seguridad, invoca `ms-security-auditor` en modo ligero. Una ruta sensible con cambios solo visuales no basta para escalar.
- `ms-architect` aplica Gatekeeper de Fases antes de avanzar entre spec, TDD, implementación, verificación, documentación y cierre.
- `ms-architect` aplica el guard de carga de revisión en cambios nivel 3-4: presupuesto por defecto 400 líneas cambiadas por paquete/PR; si se excede, divide o pide excepción explícita.
- `ms-architect` usa `ms-project-init` cuando no hay snapshot confiable de stack/comandos o antes de un nivel 4.
- `ms-architect` usa `ms-work-unit` para partir nivel 3-4 por comportamiento entregable, no por tipo de archivo.
- `ms-architect` usa `ms-spec` solo para cambios nivel 3-4, features ambiguas, contratos públicos, datos, seguridad, migraciones o decisiones irreversibles; no lo usa en fastlane ni nivel 2 claro.
- `ms-architect` usa `judgment-day` cuando el usuario pide doble juez/revisión adversarial o cuando un diff/TDD/spec de alto riesgo necesita confirmación independiente; no aplica a fastlane ni cambios triviales.
- `ms-architect` usa `delegation-brief` antes de delegar paquetes nivel 3-4, TDD/spec, bugs, reviews, auditorías, verificaciones o retries; fastlane y nivel 2 trivial pueden usar brief corto.
- `ms-architect` usa `ms-progress` después de aceptar paquetes, verificaciones, bloqueos o cierres de fase en nivel 3-4. `/ms-status` lee `docs/status/**` como fuente primaria de progreso si existe.
- `ms-spec` no diseña arquitectura técnica ni implementación; produce comportamiento, reglas, casos borde y criterios verificables en `docs/spec/**`.
- `ms-designer` no asigna ejecutores; solo diseña el TDD.
- `ms-progress` no diseña ni implementa; solo actualiza `docs/status/**` con evidencia aceptada.
- `ms-designer` incluye previsión de revisión en la sección de paquetes del TDD.
- `ms-fastlane` se bloquea si el cambio no califica como acotado: máximo 3 archivos totales, <=120 LOC estimadas, sin contrato público, datos persistidos, seguridad, infra, CI/CD, dependencias, ambigüedad de producto ni decisión irreversible.
- `ms-codex` no rediseña ni amplía scope.
- `ms-tester` no modifica archivos.
- `ms-scout` solo ejecuta comandos de inspección de solo lectura: lectura, búsqueda, listados y git read-only.
- `ms-scout` puede revisar diffs con lentes `Readability`, `Reliability` y `Resilience`; seguridad profunda sigue siendo de `ms-security-auditor`.
- `ms-debugger` no arregla bugs; solo reporta causa raíz.
- `ms-writer` no toca PRDs ni TDDs.
- `ms-security-auditor` no escribe fixes.
- `ms-architect` usa el camino mínimo para cambios de bajo riesgo: no invoca scout, spec, TDD, writer, auditoría ni tester por prudencia genérica si no se activan disparadores explícitos.
- Todo subagente que no orquesta declara `task: deny` explícito.
- Los agentes `ms-*` declaran `websearch`, `todowrite` y `lsp` en `deny`. `skill` queda permitido solo en `ms-architect`, `ms-spec`, `ms-designer` y `ms-writer` para skills generales; ejecutores y agentes de solo lectura lo mantienen en `deny`.
- `opencode.json` añade una denylist global de secretos para lectura directa y comandos evidentes: `.env`, `.env.local`, entornos reales (`production`, `staging`, `test`, `development`), `.ssh`, `.aws/credentials`, `credentials.json`, `.npmrc`, `.netrc`, `.kube/config`, llaves `*.pem`/`*.key` y `secrets/**`. Es una red práctica de protección, no una política de bloqueo general; archivos de ejemplo como `.env.example` no se bloquean por defecto.
- La lectura genérica vía bash (`cat`, `head`, `tail`, `find`, `tree`, `rg`, `grep`) queda permitida en agentes operativos de lectura/código/verificación (`ms-codex`, `ms-tester`, `ms-debugger`, `ms-security-auditor`, `ms-scout`) para reducir fricción. La denylist global de secretos en `opencode.json` cubre rutas sensibles.
- `ms-debugger` tiene `env` y `printenv*` en `deny` para evitar exposición accidental de secretos.
- Los agentes de solo lectura bloquean flags mutantes como `--fix`, `--autofix`, `--write` y actualizaciones de snapshots; logs/inspect sensibles de Docker/Kubernetes quedan en `ask`.

## Runtime compartido

OpenCode carga [agents-shared.md](agents-shared.md), no este README. Ese archivo contiene solo las instrucciones compartidas mínimas y el contrato estándar `Contrato para ms-architect`.

OpenCode carga plugins locales desde `plugins/**`. Actualmente se incluye [ms-model-variants.ts](../plugins/ms-model-variants.ts), que cachea modelos y variantes de providers en `~/.config/opencode/cache/model-variants.json` al iniciar OpenCode. Es pasivo: no modifica agentes, modelos, permisos ni archivos de proyecto. Si el cache no existe, reinicia OpenCode una vez para que el plugin pueda generarlo.

La TUI carga [tui.json](../tui.json) para plugins visuales. Actualmente registra `opencode-subagent-statusline`, inspirado por Gentle AI, para mostrar actividad/status de subagentes cuando OpenCode lo exponga.

Este documento queda como documentación humana del sistema: mapa de agentes, flujo recomendado y reglas de alto nivel. Si cambias el contrato operativo, actualiza `agents-shared.md` y las referencias de los subagentes que lo usan.
