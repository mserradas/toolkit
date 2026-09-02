---
description: Muestra el estado actual sin continuar el trabajo
agent: ms-architect
---

Eres `ms-architect` ejecutando `/ms-status`. Este comando es de solo lectura.

Argumento: `$ARGUMENTS`

## Inspección

1. Usa el argumento para acotar el objetivo, archivo o artefacto durable que debe inspeccionarse. Si no hay argumento, resume el objetivo visible en el contexto actual. Normaliza el argumento completo con trim y minúsculas; activa mantenimiento solo si el resultado es exactamente `docs` o `maintenance`. Un objetivo como `docs-api` conserva el modo focal.
2. Consulta únicamente la conversación disponible, `git status`, `git diff --name-only`, `git diff --stat` y artefactos durables relevantes como PRDs, specs, TDDs o documentación.
3. Separa hechos observables de inferencias. No declares trabajo completado, tests aprobados o decisiones aceptadas sin evidencia disponible.
4. Identifica archivos cambiados, evidencia de verificación vigente, riesgos y el siguiente paso razonable sin ejecutar tests ni modificar archivos.
5. Para el objetivo acotado, muestra los artefactos activos con `Feature ID`, `Contexto`, `Estado`, `Retención` y `review_required`, y candidatos de disposición con evidencia observable. Excluye de activos `Histórica`, `Archivado`, `Reemplazado` y `.agents/docs/archive/**`; si hay más de uno activo por tipo + `Feature ID` + `Contexto`, reporta el conflicto sin elegir.
6. Si el contexto no basta para reconstruir el objetivo o lo pendiente, indícalo como desconocido en vez de inventarlo.

## Modo Maintenance

Cuando el argumento normalizado completo sea exactamente `docs` o `maintenance`, lista solo cabeceras, metadatos y enlaces de `.agents/docs`; lee cuerpos únicamente para resolver un conflicto. Reporta temporales sin `Revisar cuando`, históricos sin motivo o evento —salvo retención legal indefinida justificada—, referencias rotas o cíclicas, `Implementado en` no resoluble, duplicados por la clave compuesta y `handoff_required` pendientes. No hace `webfetch`, no muta y no propone una acción destructiva sin evidencia. Fuera de este argumento conserva la inspección focal y nunca escanea todo `.agents/docs`.

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

Artefactos activos:
- <tipo | ruta | Feature ID | Contexto | Estado | Retención | review_required | evidencia, o ninguno>

Candidatos de disposición:
- <ruta | promover | archivar propuesto | eliminar propuesto | razón y evidencia, o ninguno>

Handoffs pendientes:
- <agent | path | feature_id | context | campos/decisión | evidencia, o ninguno>

Riesgos:
- <riesgos o ninguno>

Próxima acción:
- <una acción concreta | desconocida>
```

No continúes el trabajo, no escribas estado, no decidas ni ejecutes borrados o movimientos y no conviertas inferencias en hechos desde este comando.
