# Agentes opencode

> Actualizado: 2026-06-19

Este equipo separa producto, arquitectura, implementación, verificación y auditoría.

## Flujo base

```text
Idea -> ms-plan -> PRD
Idea temprana -> ms-discovery -> experimentos / decisión de PRD
PRD aprobado -> ms-architect -> ms-designer -> TDD
Cambio acotado -> ms-architect -> ms-fastlane -> review/smoke -> cierre
Cambio con scope claro -> ms-architect -> ms-codex -> verificación si aplica -> cierre
TDD aprobado -> ms-architect -> paquetes -> verificación -> cierre
```

## Niveles de orquestación

| Nivel | Uso | Flujo esperado |
|---|---|---|
| 0 | No modifica repo | Respuesta directa, sin subagentes |
| 1 | Cambio acotado de bajo riesgo | Una tarea a `ms-fastlane`, review de diff, smoke y cierre |
| 2 | Cambio claro que no califica como fastlane | Una tarea a `ms-codex`, verificación solo si aplica |
| 3 | Varias piezas coordinadas | Plan compacto por paquetes, integración y verificación |
| 4 | Alto impacto o diseño persistente | TDD, aprobación humana y ejecución por paquetes |

## Agentes

| Agente | Modelo | Uso principal | Toca archivos |
|---|---|---|---|
| `ms-plan` | `openai/gpt-5.5` | Hace preguntas y crea PRDs | Solo `docs/prd/**` |
| `ms-discovery` | `openai/gpt-5.5` | Debate ideas tempranas, clasifica inconvenientes y propone experimentos | Solo `docs/discovery/**` si el usuario pide guardar |
| `ms-architect` | `openai/gpt-5.5`, `reasoningEffort: high`, `steps: 24` | Orquesta el flujo técnico, inspecciona read-only y decide fastlane/TDD | No |
| `ms-designer` | `openai/gpt-5.5` | Crea TDDs desde PRDs aprobados | Solo `docs/design/**` |
| `ms-fastlane` | `openai/gpt-5.5` | Ejecuta cambios acotados sin cadena de subagentes | Sí, scope limitado |
| `ms-codex` | `openai/gpt-5.5` | Implementa código con scope cerrado | Sí |
| `ms-tester` | `openai/gpt-5.5` | Corre tests, lint, type-check y format-check | No |
| `ms-scout` | `openai/gpt-5.5` | Explora codigo y revisa diffs read-only | No |
| `ms-debugger` | `openai/gpt-5.5` | Reproduce bugs y encuentra causa raíz | No |
| `ms-writer` | `openai/gpt-5.5` | Actualiza docs de usuario, README, changelog | Solo docs de usuario |
| `ms-security-auditor` | `openai/gpt-5.5` | Audita seguridad con evidencia | No |

## Cuando usar cada uno

- Usa `ms-plan` cuando todavía no está claro qué construir.
- Usa `ms-discovery` cuando la idea aún está en fase de oportunidad, debate, validación o decisión de si merece PRD.
- Usa `ms-architect` cuando hay que modificar el repo o coordinar subagentes.
- Usa `ms-designer` cuando un cambio necesita TDD.
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
- `ms-architect` no edita. Puede usar bash solo para inspección read-only acotada (`pwd`, `ls`, `wc`, `file`, `stat`, `rg`, `grep`, `git status`, `git diff`, `git show`, `git log`, `git branch`, `git rev-parse`).
- `ms-architect` delega tests, linters, formatters, servidores, instalaciones, migraciones, commits, pushes y cualquier comando con efectos secundarios.
- `ms-architect` elige primero un nivel de orquestación; no decide agentes por inercia.
- `ms-architect` exige `Contract for ms-architect` a todo subagente antes de aceptar resultados.
- `ms-architect` no invoca más de 3 subagentes por ola salvo justificación explícita, compacta cada ola en máximo 10 bullets y aplica Fast Accept sin reanalizar reportes completos.
- `ms-architect` ejecuta siempre un Security Smoke Gate tras cambios de `ms-codex` o `ms-fastlane`; si el diff contiene señales reales de secretos/config sensible o lógica de seguridad, invoca `ms-security-auditor` en modo ligero. Una ruta sensible con cambios solo visuales no basta para escalar.
- `ms-designer` no asigna ejecutores; solo diseña el TDD.
- `ms-fastlane` se bloquea si el cambio no califica como acotado: máximo 3 archivos totales, <=120 LOC estimadas, sin contrato público, datos persistidos, seguridad, infra, CI/CD, dependencias, ambigüedad de producto ni decisión irreversible.
- `ms-codex` no rediseña ni amplía scope.
- `ms-tester` no modifica archivos.
- `ms-scout` no ejecuta comandos.
- `ms-debugger` no arregla bugs; solo reporta causa raíz.
- `ms-writer` no toca PRDs ni TDDs.
- `ms-security-auditor` no escribe fixes.
- `ms-architect` usa el camino mínimo para cambios de bajo riesgo: no invoca scout, TDD, writer, auditoría ni tester por prudencia genérica si no se activan disparadores explícitos.
- Todo subagente que no orquesta declara `task: deny` explícito.
- Los agentes `ms-*` declaran `websearch`, `todowrite`, `lsp` y `skill` en `deny` salvo cambio intencional documentado.
- La lectura genérica vía bash (`cat`, `head`, `tail`, `find`, `tree`, `rg`, `grep`) queda en `ask`, salvo el allowlist read-only explícito de `ms-architect`. Se prefiere `read`/`grep` de OpenCode para respetar guardrails de archivos sensibles.
- `ms-debugger` tiene `env` y `printenv*` en `deny` para evitar exposición accidental de secretos.
- Los agentes read-only bloquean flags mutantes como `--fix`, `--autofix`, `--write` y actualizaciones de snapshots; logs/inspect sensibles de Docker/Kubernetes quedan en `ask`.

## Runtime compartido

OpenCode carga [agents-shared.md](agents-shared.md), no este README. Ese archivo contiene solo las instrucciones compartidas mínimas y el contrato estándar `Contract for ms-architect`.

Este documento queda como documentación humana del sistema: mapa de agentes, flujo recomendado y reglas de alto nivel. Si cambias el contrato operativo, actualiza `agents-shared.md` y las referencias de los subagentes que lo usan.
