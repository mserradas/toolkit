---
name: chained-pr
description: "Divide cambios grandes en PRs encadenados o stacked PRs. Úsala para PRs de más de 400 líneas cambiadas, planificación de stacked PRs, slices de revisión y control de carga de revisión."
---

# Chained PR

Usa esta skill cuando un PR planificado pueda superar el presupuesto de revisión o cuando el usuario pida stacked/chained PRs.

## Reglas

- Presupuesto de revisión por defecto: 400 líneas cambiadas (`additions + deletions`).
- Divide cambios grandes salvo que el maintainer acepte explícitamente `size:exception`.
- Cada PR debe ser una unidad entregable con su propia verificación.
- Mantén tests/docs junto a la unidad que validan o explican.
- Declara inicio, fin, dependencias, follow-ups y fuera de alcance en cada PR.
- Trata los diffs contaminados como problema de base branch: retarget/rebase hasta que el PR hijo contenga solo su unidad.
- No mezcles estrategias de cadena después de elegir una.

## Elección De Estrategia

| Condición | Estrategia |
|---|---|
| PR enfocado y <=400 líneas cambiadas | PR único |
| Los slices pueden aterrizar independientemente | Stacked PRs hacia main |
| La feature debe integrarse antes de main | Feature branch chain con tracker PR |
| Diff generado/vendor/migración no se puede partir limpiamente | Pedir `size:exception` |

## Contexto De Cadena

Incluye:

- Límite del PR actual.
- Dependencia previa.
- Siguiente PR planificado.
- Verificación hecha para este PR.
- Ruta de rollback o fix-forward.
- Qué queda explícitamente fuera.
