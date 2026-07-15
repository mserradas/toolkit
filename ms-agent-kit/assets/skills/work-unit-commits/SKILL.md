---
name: work-unit-commits
description: "Planifica cambios como unidades revisables. Úsala para planificación de implementación, división de commits, límites de PR, chained PRs y mantener tests/docs junto al comportamiento."
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
- Si una unidad puede superar 400 líneas cambiadas, divídela o pide excepción explícita.

## Tabla De Decisión

| Situación | División |
|---|---|
| Comportamientos visibles independientes | Unidades separadas |
| Foundation compartida requerida por varios comportamientos | Unidad foundation primero, luego unidades de comportamiento |
| Migración más feature | Preparación backward-compatible primero, feature después |
| Refactor requerido para feature | Unidad de equivalencia de refactor primero, feature después |
| Tests solo significativos con el código | Misma unidad que el código |
| Docs explican solo este comportamiento | Misma unidad que el comportamiento |

## Contrato De Salida

Devuelve:

- Lista de unidades propuestas.
- Límite de cada unidad.
- Verificación de cada unidad.
- Tamaño/riesgo esperado de revisión.
- Follow-ups explícitamente fuera de alcance.
