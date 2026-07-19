# Instrucciones Compartidas De Agentes

> Contrato compacto compartido entre los clientes compatibles. La documentación humana vive en `docs/agents.md`.

## Invariantes

- Sigue primero el rol y los límites definidos para tu agente en el cliente actual.
- No inventes contexto, APIs, resultados, métricas ni decisiones. Separa hechos, supuestos, preguntas y bloqueos.
- Para información externa actual, usa Context7 o documentación oficial cuando tus herramientas lo permitan; cita fuente y fecha.
- Conversa en el idioma del usuario. Los artefactos persistentes siguen el idioma del repositorio o, si no existe convención, inglés técnico. El estado temporal vive en `.atl/status/**`.
- Los workers no invocan subagentes. Si necesitan coordinación o una decisión del usuario, devuelven el control a `ms-architect`.
- `ms-architect` mantiene el flujo delgado: delega misiones distintas, sintetiza evidencia y evita repetir lecturas o verificaciones sin una razón concreta.
- Si una tarea queda interrumpida, devuelve `partial` con el trabajo que debe preservarse y la siguiente acción. Crea checkpoints solo cuando el usuario pida cambiar de sesión.

## Protocolos Bajo Demanda

No reproduzcas estos protocolos aquí. Carga su fuente normativa solo cuando aplique:

- Contexto inicial: `ms-project-init`.
- Unidades revisables: `work-unit-commits`.
- Delegaciones complejas: `delegation-brief`.
- Revisión adversarial: `judgment-day`.
- Checkpoint entre sesiones: `ms-progress` y `ms-continue`.
- Cierre de una spec: modo de cierre de `ms-spec`.

## Preguntas Al Usuario

Solo los agentes primarios con permiso `question` preguntan directamente. Usa opciones breves en el idioma del usuario y detente tras preguntar. Los workers devuelven `needs_user_input` con las preguntas concretas.

## Contrato Para ms-architect

Todo worker de un flujo orquestado termina con un bloque YAML llamado exactamente `Contrato para ms-architect`:

```yaml
status: completed | partial | blocked | needs_user_input | failed | not_applicable
summary: "resultado concreto en 1-3 líneas"
evidence:
  - "archivo, símbolo, comando, test o hallazgo verificable"
blockers: []
risks: []
questions: []
next_action: "acción recomendada o null"
```

Reglas:

- `completed` exige evidencia verificable, `blockers: []` y ninguna pregunta bloqueante.
- `partial`, `blocked` y `failed` explican en `blockers` qué impide completar y proponen una acción concreta.
- `needs_user_input` incluye únicamente preguntas cuya respuesta cambie el resultado.
- Registra solo riesgos que afecten una decisión real. Riesgos `critical` o `high` impiden cerrar hasta mitigación o aceptación explícita.
- Usa `[]` para listas vacías y `null` cuando no haya siguiente acción.

## Aceptación

`ms-architect` valida la evidencia principal y acepta sin reinterpretar el trabajo cuando el estado es `completed`, no hay bloqueos ni preguntas pendientes y los riesgos no impiden cerrar. En otro caso corrige el brief, re-delega o pregunta al usuario según `next_action`.
