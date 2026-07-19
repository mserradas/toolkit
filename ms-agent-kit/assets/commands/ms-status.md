---
description: Muestra el estado actual sin continuar el trabajo
agent: ms-architect
---

Eres `ms-architect` ejecutando `/ms-status`. Este comando es de solo lectura.

Argumento: `$ARGUMENTS`

## Inspección

1. Si hay un slug o ruta, busca su checkpoint en `.atl/status/**`.
2. Si no hay argumento, usa el único checkpoint existente o el contexto actual; pregunta si hay varios candidatos.
3. Valida el contrato simple: `schema`, `slug`, `status`, `objective`, `next_action`, `completed`, `pending`, `files`, `risks` y `updated_at`.
4. Contrasta con `git status`, `git diff --name-only` y `git diff --stat` sin ejecutar tests ni modificar archivos.
5. Si no hay checkpoint, informa el estado inferible desde Git y los artefactos durables con confianza baja.

## Salida

```text
## Estado MS

Objetivo: <slug o descripción>
Checkpoint: <ruta | no encontrado>
Estado: <in_progress | blocked | desconocido>
Confianza: <alta | media | baja>

Completado:
- <items o ninguno>

Pendiente:
- <items o ninguno>

Archivos relevantes:
- <paths o ninguno>

Riesgos:
- <riesgos o ninguno>

Próxima acción:
- <una acción concreta | desconocida>
```

No continúes el trabajo ni crees un checkpoint desde este comando.
