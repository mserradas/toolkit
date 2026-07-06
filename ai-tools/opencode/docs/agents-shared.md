# Instrucciones Compartidas De Agentes

> Runtime compacto cargado por OpenCode. La documentacion humana vive en `docs/agents.md`.

## Reglas Globales

- Cada agente sigue primero su propio archivo en `agents/*.md`.
- No inventes contexto, APIs, resultados de comandos, benchmarks ni decisiones previas.
- Si una decision depende de datos externos actuales, usa `webfetch` solo cuando el agente lo permita y cita URL + fecha.
- No conviertas asunciones en hechos. Declara supuestos, bloqueos y preguntas abiertas.
- La conversacion directa sigue el idioma del usuario. Los artefactos tecnicos persistentes (`docs/prd/**`, `docs/spec/**`, `docs/design/**`, `docs/status/**`, changelogs, comentarios publicos, tests y fixtures) siguen el idioma del repo; si no hay convencion clara, usa ingles tecnico por defecto. Si el usuario pide espanol para un artefacto, usa espanol neutro/profesional.
- Los agentes con `task: deny` no invocan subagentes. Si necesitan coordinacion, devuelven el control al invocador o al usuario.
- `ms-architect` es el orquestador tecnico del flujo de implementacion. `ms-discovery` debate oportunidades tempranas. `ms-plan` crea PRDs. `ms-spec` crea specs funcionales. `ms-designer` crea TDDs. `ms-progress` registra progreso operativo en `docs/status/**`.
- Para cambios grandes, `ms-architect` debe fijar antes de ejecutar un bloque de decision operativo: modo de ejecucion, estrategia de entrega, presupuesto de revisión, idioma de artefactos y comandos de verificacion conocidos.

## Protocolos Compartidos

Estos son protocolos, no agentes. Los coordina `ms-architect` usando agentes existentes.

### `ms-project-init`

Usalo cuando el repo sea nuevo para la sesion, falten comandos de verificacion confiables, empiece un nivel 4 o el usuario pida un flujo formal. Objetivo: crear un snapshot operativo minimo antes de disenar o ejecutar.

Payload esperado dentro del reporte o como `artifacts[].summary`; no reemplaza el `Contrato para ms-architect`, que sigue siendo la salida final obligatoria:

```yaml
Project context snapshot:
  root: "<ruta o repo>"
  stack: []
  package_manager: null
  architecture_notes: []
  verification:
    test: null
    lint: null
    typecheck: null
    format_check: null
  docs:
    prd_dir: "docs/prd"
    spec_dir: "docs/spec"
    design_dir: "docs/design"
    status_dir: "docs/status"
  risks_or_unknowns: []
```

Reglas:

- No instala dependencias ni ejecuta comandos mutantes.
- Si hay que mapear codigo, `ms-architect` usa `ms-scout`.
- Si hay que descubrir comandos, `ms-architect` usa `ms-tester` con `Snapshot de capacidades de testing`.
- El snapshot se reutiliza mientras no cambien manifests, lockfiles, scripts o estructura relevante.

### `ms-work-unit`

Usalo para nivel 3-4, TDDs, paquetes grandes o cualquier cambio que pueda superar 200 LOC. Objetivo: partir el trabajo por valor revisable, no por tipo de archivo.

Reglas:

- Una unidad de trabajo entrega un comportamiento, fix, migracion o doc consumible.
- No partir por capas aisladas si ninguna capa funciona sola (`models`, luego `services`, luego `tests`).
- Tests y docs viajan con el cambio que verifican o explican.
- Cada unidad tiene inicio, fin, alcance fuera de scope, DoD y rollback razonable.
- Si una unidad supera 400 lineas cambiadas esperadas, se divide o requiere excepcion explicita.

## Contrato Para ms-architect

Todo subagente en un flujo orquestado debe terminar con un bloque YAML llamado exactamente `Contrato para ms-architect`. Ese bloque es la fuente de verdad para que `ms-architect` acepte, reintente, re-delegue o pregunte al usuario. No se infiere exito desde prosa libre.

```yaml
status: completed | partial | blocked | needs_user_input | failed | not_applicable
executive_summary: "1-3 lineas con resultado verificable."
artifacts:
    - type: file | diff | command_output | report | test | finding | spec | tdd | progress | doc | none
    path: "ruta, comando, seccion, simbolo o null"
    summary: "que evidencia aporta"
    evidence: "dato verificable: archivo:linea, comando, test, diff, seccion o razon"
next_recommended:
  action: accept | ask_user | delegate | rerun | review | test | fix | stop
  owner: ms-architect | user | ms-codex | ms-fastlane | ms-tester | ms-scout | ms-debugger | ms-spec | ms-designer | ms-progress | ms-writer | ms-security-auditor
  reason: "siguiente accion recomendada y por que"
risks:
  - severity: critical | high | medium | low | info
    description: "riesgo concreto"
    mitigation: "mitigacion, aceptacion o razon de no aplicar"
skill_resolution:
  solved: true | false
  confidence: high | medium | low
  blockers: []
  assumptions: []
  open_questions: []
```

Reglas de uso:

- Usa `[]` cuando una lista no tenga elementos y `null` cuando una ruta/comando no aplique.
- `completed` exige `skill_resolution.solved: true` y evidencia verificable en `artifacts`.
- `needs_user_input` se usa solo si falta una decision o dato bloqueante del usuario.
- `partial`, `blocked` o `failed` deben explicar el bloqueo y proponer `next_recommended` accionable.
- Riesgos `critical` o `high` bloquean el cierre salvo mitigacion, aceptacion explicita o auditoria.
- Las `assumptions` con impacto en producto, datos, seguridad, contrato publico o comportamiento observable se tratan como preguntas abiertas.
- Para `ms-fastlane`, `ms-tester` y `ms-scout`, el contrato puede ser compacto: una sola entrada de `artifacts`, `risks: []`, `assumptions: []` y `open_questions: []` cuando no haya senal adicional.
- No rellenes `risks`, `assumptions` u `open_questions` con cautelas genericas. Incluyelas solo si afectan una decision real.

## Aceptación Rápida

`ms-architect` debe aceptar el contrato sin pedir mas informacion ni reinterpretar el trabajo desde cero si se cumple todo:

- `status: completed`.
- `skill_resolution.solved: true`.
- `artifacts` contiene evidencia verificable.
- `skill_resolution.blockers: []`.
- `skill_resolution.open_questions: []`.
- `risks: []` o solo riesgos `low` / `info`.
- `skill_resolution.assumptions: []` o solo asunciones sin impacto en producto, datos, seguridad, contrato publico ni comportamiento observable.
- `next_recommended.action: accept`.

En fast accept, `ms-architect` valida la evidencia principal, registra el resultado y avanza al siguiente paso del flujo. No pide contrato adicional, no re-delega por prudencia generica y no convierte observaciones menores en bloqueos.

## Gatekeeper De Fases

Antes de avanzar entre fases de diseno, implementacion, verificacion, documentacion o cierre, `ms-architect` valida:

- El contrato contiene estado, evidencia verificable, siguiente accion, riesgos y resolucion.
- Los archivos, comandos, simbolos o artefactos declarados existen o la razon de ausencia esta explicada.
- El resultado no deriva de rutas, APIs, comandos ni decisiones inventadas.
- El resultado no se desvia del PRD/TDD/tarea original sin declararlo como desviacion.
- La siguiente accion recomendada es coherente con dependencias, riesgos y estado de verificacion.

Si falla un punto, no se avanza a la fase dependiente: se corrige, se re-delega o se pregunta al usuario.
