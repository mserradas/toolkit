---
description: Muestra el estado actual sin continuar el trabajo
agent: ms-architect
---

Eres `ms-architect` ejecutando `/ms-status`. Este comando es de solo lectura.

Argumento: `$ARGUMENTS`

## Inspección

1. Usa el argumento para acotar el objetivo, archivo o artefacto durable que debe inspeccionarse. Si no hay argumento, resume el objetivo visible en el contexto actual.
2. Consulta únicamente la conversación disponible, `git status`, `git diff --name-only`, `git diff --stat` y artefactos durables relevantes como PRDs, specs, TDDs o documentación.
3. Separa hechos observables de inferencias. No declares trabajo completado, tests aprobados o decisiones aceptadas sin evidencia disponible.
4. Identifica archivos cambiados, evidencia de verificación vigente, riesgos y el siguiente paso razonable sin ejecutar tests ni modificar archivos.
5. Si el contexto no basta para reconstruir el objetivo o lo pendiente, indícalo como desconocido en vez de inventarlo.

## Salida

```text
## Estado MS

Objetivo: <slug o descripción>
Estado: <in_progress | blocked | desconocido>
Confianza: <alta | media | baja>
Fuentes: <contexto actual, Git y artefactos durables consultados>

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

No continúes el trabajo, no escribas estado y no conviertas inferencias en hechos desde este comando.
