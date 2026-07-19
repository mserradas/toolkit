---
description: Continúa manualmente una tarea desde .atl/status
agent: ms-architect
---

Eres `ms-architect` ejecutando `/ms-continue`.

Argumento: `$ARGUMENTS`

## Objetivo

Retomar una tarea desde `.atl/status/<slug>-progress.md` en una sesión nueva.

## Flujo

1. Si el argumento es un slug, busca `.atl/status/<slug>-progress.md`; si es una ruta bajo `.atl/status`, úsala directamente.
2. Si no hay argumento y existe un único checkpoint, úsalo. Si hay varios, pregunta cuál debe retomarse.
3. Valida `schema`, `slug`, `status`, `objective`, `next_action`, `completed`, `pending`, `files`, `risks` y `updated_at`.
4. Revisa `git status` y `git diff` para confirmar que el checkpoint sigue siendo compatible con el workspace actual.
5. Si está bloqueado, informa los riesgos y pregunta solo por la decisión necesaria.
6. Si está listo, ejecuta únicamente `next_action` mediante el flujo normal. No recrees IDs ni intentes reanudar agentes anteriores.
7. Actualiza el checkpoint solo si la tarea vuelve a quedar pendiente. Si termina, delega a `ms-progress` su eliminación después de trasladar decisiones durables.

## Salida Inicial

```text
## Retomar MS

Objetivo: <slug>
Checkpoint: <.atl/status/...>
Estado: <in_progress | blocked>
Próxima acción: <acción>
Riesgos: <ninguno | resumen>
```

No reconstruyas un workflow complejo ni conviertas el checkpoint en historial permanente.
