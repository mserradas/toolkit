---
name: delegation-brief
description: "Escribe delegation briefs autosuficientes para subagentes. Úsala antes de delegar trabajo multi-step, paquetes nivel 3-4, ejecución de TDD/spec, investigación de bugs, reviews, verificación o cualquier tarea donde falte contexto y pueda haber drift."
---

# Delegation Brief

## Gate De Rol

Esta skill prepara delegaciones; no ejecuta la misión descrita. Úsala solo desde `ms-architect` u otro orquestador autorizado. Si eres un worker, no redactes una nueva delegación ni invoques agentes: devuelve el control al padre.

Usa esta skill al preparar una tarea para otro agente. El objetivo es que el worker pueda ejecutar bien sin depender del contexto oculto de la conversación padre.

## Cuándo Activarla

Úsala al delegar:

- trabajo nivel 3-4,
- cualquier paquete de TDD/spec,
- implementación multiarchivo,
- investigación de bug,
- verificación,
- revisión o auditoría,
- documentación con impacto de producto,
- retries después de una delegación fallida o parcial.

Omítela en fastlane y tareas nivel 2 muy pequeñas solo cuando la tarea ya sea inequívoca y quepa en 1-3 líneas.

## Reglas

- Da al worker una misión cerrada, no un objetivo abierto.
- Incluye solo el contexto necesario; omite ruido de la conversación padre.
- Haz explícitos los límites: archivos/módulos objetivo, cambios permitidos y qué no tocar.
- Incluye criterios de aceptación y evidencia esperada al volver.
- Incluye comandos de verificación solo si existen; no los inventes.
- Preserva decisiones aprobadas de PRD/spec/TDD; no permitas que el worker las rediseñe.
- Si la tarea depende de otro paquete, declara la dependencia y el estado actual.
- Si la tarea es demasiado amplia para un worker, pártela antes de delegar.

## Forma Del Brief

```text
ID de tarea: T<n>
Paquete / fuente: P<n> | Spec | TDD | Diseño inline | Bug branch
Agente destino: ms-<agent>

Objetivo:
  <una frase con el resultado esperado>

Contexto necesario:
  - <decisiones aprobadas, archivos, símbolos, restricciones>

Alcance permitido:
  - <archivos, módulos, comportamiento o comandos que puede tocar/ejecutar>

Fuera de alcance:
  - <lo que no debe tocar, rediseñar o asumir>

Tarea concreta:
  1. <paso verificable>
  2. <paso verificable>

Criterios de aceptación:
  - <resultado observable>

Definition of Done:
  - <comando, diff, archivo, test, reporte o evidencia>

Evidencia esperada al volver:
  - <paths, comandos, resumen de diff, hallazgos o bloqueo>

Contrato:
  - Termina con `Contrato para ms-architect`.
```

## Tabla De Decisión

| Situación | Ajuste del brief |
|---|---|
| Implementación desde TDD | Incluye package ID, secciones relevantes del TDD, restricciones aceptadas y verificación esperada |
| Creación de spec/TDD | Incluye pedido/PRD/spec de origen, contexto conocido del repo, bloqueos y convención de ruta del artefacto |
| Investigación de bug | Incluye síntoma, evidencia de repro/log/test, archivos ya revisados y regla de no fix si es debugger |
| Revisión/auditoría | Incluye diff/objetivo, lente exacta de revisión, severidad esperada y categorías fuera de alcance |
| Verificación | Incluye comandos exactos si se conocen, fallback de descubrimiento y formato de reporte esperado |
| Retry tras trabajo parcial | Incluye resultado previo, qué fue aceptado, qué falló y qué no repetir |

## Gate De Calidad

Antes de enviar la tarea, comprueba:

- ¿El worker puede empezar sin leer la conversación padre?
- ¿Hay exactamente un resultado principal?
- ¿Los límites y non-goals son explícitos?
- ¿La evidencia esperada es concreta?
- ¿Otro worker competente produciría aproximadamente el mismo resultado?

Si alguna respuesta es no, ajusta el brief o divide la tarea.
