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
- Designa un único `verification_owner`: `implementer | ms-tester | none`. Usa `implementer` para `ms-codex` o `ms-fastlane`, `ms-tester` cuando quede un gate independiente pendiente y `none` para tareas sin ejecución verificable.
- Declara dependencias, evidencia existente y estado del workspace desde esa evidencia.
- Antes de delegar contrasta operaciones necesarias mediante inspección estática: comando, `cwd`, política `allow | ask | deny | unknown`, efectos de escritura y servicios/runtime por separado, con sus fuentes. No ejecutes comandos para probar permisos ni ocultes incertidumbres. `unknown` no es denegación ni autorización: usa la revisión vigente, la autorización existente y los límites efectivos para resolver lo necesario, sin pedir otra aprobación para una verificación conocida y autorizada.
- Conserva la autorización exacta y las salidas acotadas cuando apliquen `verification.projects`, solo en la raíz coincidente y scope de proyecto. `project.yaml` es contexto sin grants. Indica qué recetas, scripts o configuración Compose se revisaron y si cambiaron desde esa revisión; no infieras efectos por el nombre del comando. Una denegación real incluye causa y siguiente acción, sin cambiar sintaxis, intérprete o rol para eludirla.
- Identifica un propietario por gate y conserva evidencia de vigencia en código, configuración, dependencias, entorno y archivos sin seguimiento; el commit por sí solo no basta.
- Incluye símbolos/secciones afectadas y búsquedas negativas ya comprobadas con su contexto. Reutiliza una sesión pertinente enviando solo novedades y pendientes.
- Incluye `skill_inputs` únicamente con rutas exactas ya resueltas de skills técnicas pertinentes. Si no hacen falta usa `[]`; no pases protocolos de orquestación a ejecutores ni amplíes sus permisos.
- En un reintento envía solo el delta: qué preservar, qué falta y qué efectos o verificaciones no repetir. Nunca reenvíes el brief original sin cambios.

## Plantilla

```text
ID de tarea: T<n>
Agente destino: ms-<agent>

Objetivo: <resultado único esperado>

Contexto necesario:
  - <decisiones, archivos, símbolos o dependencias imprescindibles>
  - Evidencia existente: <comando/resultado reutilizable o “ninguna”>
  - Estado del workspace: <writes/cambios desde la evidencia>
  - Secciones/símbolos: <ubicaciones pertinentes>
  - Ausencias comprobadas: <búsqueda, resultado y contexto; ninguna si no aplica>

Operaciones necesarias:
  - <comando, cwd; policy allow/ask/deny/unknown y fuente; efectos/salidas; servicios/runtime>
  - Autorización y vigencia: <permiso ya concedido, fuentes revisadas y cambios; pendiente si falta>

skill_inputs:
  - <ruta exacta de una skill técnica pertinente; [] si no aplica>

Alcance permitido:
  - <archivos, módulos, comportamiento o comandos>

Fuera de alcance:
  - <lo que no debe tocar o rediseñar>

Tarea concreta:
  - <acciones verificables>

Criterios de aceptación:
  - <resultado observable>

Verificación:
  - verification_owner: implementer | ms-tester | none
  - <comando conocido y alcance, o “no aplica”>
  - <gate, propietario, obligatoriedad y evidencia vigente o pendiente>

Entrega esperada:
  - <archivos, resumen, resultados y bloqueos>

Reintento (solo si aplica):
  - Preservar: <trabajo aceptado>
  - Delta pendiente: <único trabajo restante>
  - No repetir: <efectos y verificaciones ya realizados>

Contrato:
  - Termina con `Contrato para ms-architect`.
```

## Gate De Calidad

Antes de enviar la tarea, comprueba:

- ¿El worker puede empezar sin leer la conversación padre?
- ¿Hay un único resultado, límites claros y aceptación observable?
- ¿La entrega y las verificaciones permiten evaluar el resultado sin inferencias?

Si alguna respuesta es no, corrige el brief o divide la misión.
