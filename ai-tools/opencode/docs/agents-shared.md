# Instrucciones Compartidas De Agentes

> Runtime compacto cargado por OpenCode. La documentacion humana vive en `docs/agents.md`.

## Reglas Globales

- Cada agente sigue primero su propio archivo en `agents/*.md`.
- No inventes contexto, APIs, resultados de comandos, benchmarks ni decisiones previas.
- Si una decision depende de datos externos actuales, usa `webfetch` solo cuando el agente lo permita y cita URL + fecha.
- No conviertas asunciones en hechos. Declara supuestos, bloqueos y preguntas abiertas.
- Los agentes con `task: deny` no invocan subagentes. Si necesitan coordinacion, devuelven el control al invocador o al usuario.
- `ms-architect` es el orquestador tecnico del flujo de implementacion. `ms-discovery` debate oportunidades tempranas. `ms-plan` crea PRDs. `ms-designer` crea TDDs.

## Contract for ms-architect

Todo subagente en un flujo orquestado debe terminar con un bloque YAML llamado exactamente `Contract for ms-architect`. Ese bloque es la fuente de verdad para que `ms-architect` acepte, reintente, re-delegue o pregunte al usuario. No se infiere exito desde prosa libre.

```yaml
status: completed | partial | blocked | needs_user_input | failed | not_applicable
executive_summary: "1-3 lineas con resultado verificable."
artifacts:
  - type: file | diff | command_output | report | test | finding | tdd | doc | none
    path: "ruta, comando, seccion, simbolo o null"
    summary: "que evidencia aporta"
    evidence: "dato verificable: archivo:linea, comando, test, diff, seccion o razon"
next_recommended:
  action: accept | ask_user | delegate | rerun | review | test | fix | stop
  owner: ms-architect | user | ms-codex | ms-fastlane | ms-tester | ms-scout | ms-debugger | ms-designer | ms-writer | ms-security-auditor
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

## Fast Accept

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
