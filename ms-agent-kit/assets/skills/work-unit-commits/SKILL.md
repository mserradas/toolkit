---
name: work-unit-commits
description: "Planifica cambios como unidades revisables. Úsala para dividir implementaciones, commits o PRs y mantener tests/docs junto al comportamiento."
---

# Work Unit Commits

## Gate De Rol

Esta skill define unidades; no implementa ni modifica archivos. Puede usarla `ms-architect` para routing o `ms-designer` dentro de un TDD. Si eres un ejecutor, sigue la unidad recibida y no rediseñes el plan.

Usa esta skill al decidir cómo dividir un cambio en paquetes, commits o PRs.

## Reglas

- Una work unit entrega un comportamiento, fix, migración o documentación consumible.
- No dividas por tipo de archivo si ningún slice funciona solo (`models`, luego `services`, luego `tests`).
- Mantén tests junto al comportamiento que verifican.
- Mantén docs junto al cambio visible que explican.
- Cada unidad debe tener inicio claro, fin claro, fuera de alcance, verificación y rollback.
- Un reviewer debe entender por qué existe la unidad desde el diff y el mensaje.
- Usa 400 líneas cambiadas como señal orientativa de carga de revisión, no como obligación automática de dividir.

## Tabla De Decisión

| Situación | División |
|---|---|
| Comportamientos visibles independientes | Unidades separadas |
| Foundation compartida requerida por varios comportamientos | Unidad foundation primero, luego unidades de comportamiento |
| Migración más feature | Preparación backward-compatible primero, feature después |
| Refactor requerido para feature | Unidad de equivalencia de refactor primero, feature después |
| Tests solo significativos con el código | Misma unidad que el código |
| Docs explican solo este comportamiento | Misma unidad que el comportamiento |

## Estrategia De PR

| Condición | Estrategia |
|---|---|
| Unidad enfocada y revisable | PR único |
| Unidades independientes con orden de aterrizaje | Stacked PRs hacia la rama base |
| La feature debe integrarse antes de llegar a la rama base | Cadena sobre una feature branch con PR tracker |
| Código generado, vendor o migración indivisible | Excepción de tamaño documentada |

## Contrato De Salida

Devuelve:

- Lista de unidades propuestas.
- Límite de cada unidad.
- Verificación de cada unidad.
- Tamaño/riesgo esperado de revisión.
- Follow-ups explícitamente fuera de alcance.
