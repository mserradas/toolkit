---
name: delegation-brief
description: "Escribe delegation briefs autosuficientes para subagentes. Úsala antes de delegar trabajo multi-step, paquetes nivel 3-4, ejecución de TDD/spec, investigación de bugs, reviews, verificación o cualquier tarea donde falte contexto y pueda haber drift."
---

# Delegation Brief

Prepara instrucciones autosuficientes para un worker; no ejecuta la misión. Úsala solo desde `ms-architect` u otro orquestador autorizado. Si eres un worker, devuelve el control al padre.

## Cuándo Usarla

Úsala cuando una delegación sea compleja, multiarchivo, derive de una spec/TDD, investigue o revise un problema, necesite verificación independiente o retome trabajo parcial. Omítela cuando la tarea sea inequívoca y pueda expresarse con precisión en 1-3 líneas.

## Reglas

- Asigna un único resultado principal; divide antes una misión demasiado amplia.
- Incluye solo contexto necesario y decisiones ya aprobadas.
- Delimita archivos, comportamiento permitido y aquello que no debe tocarse.
- Define aceptación observable, evidencia de entrega y verificaciones conocidas; no inventes comandos.
- Declara dependencias. En un reintento añade qué preservar, qué falta y qué efectos no repetir.

## Plantilla

```text
ID de tarea: T<n>
Agente destino: ms-<agent>

Objetivo: <resultado único esperado>

Contexto necesario:
  - <decisiones, archivos, símbolos o dependencias imprescindibles>

Alcance permitido:
  - <archivos, módulos, comportamiento o comandos>

Fuera de alcance:
  - <lo que no debe tocar o rediseñar>

Tarea concreta:
  - <acciones verificables>

Criterios de aceptación:
  - <resultado observable>

Verificación:
  - <comando conocido y alcance, o “no aplica”>

Entrega esperada:
  - <archivos, resumen, resultados y bloqueos>

Reintento (solo si aplica):
  - Preservar: <trabajo aceptado>
  - Pendiente: <delta restante>
  - No repetir: <efectos ya realizados>

Contrato:
  - Termina con `Contrato para ms-architect`.
```

## Gate De Calidad

Antes de enviar la tarea, comprueba:

- ¿El worker puede empezar sin leer la conversación padre?
- ¿Hay un único resultado, límites claros y aceptación observable?
- ¿La entrega y las verificaciones permiten evaluar el resultado sin inferencias?

Si alguna respuesta es no, corrige el brief o divide la misión.
