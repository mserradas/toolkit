---
name: cognitive-doc-design
description: "Diseña documentación clara y de baja carga cognitiva. Úsala para READMEs, guías, RFCs, arquitectura, notas de revisión, onboarding y docs densas o difíciles de escanear."
---

# Cognitive Doc Design

Usa esta skill al crear o revisar documentación que otra persona debe entender, revisar o ejecutar rápido.

## Reglas

- Empieza por la respuesta: decisión, acción o resultado; contexto después.
- Usa revelación progresiva: happy path primero, detalles y casos borde después.
- Agrupa el contenido en secciones cortas con títulos claros.
- Prefiere tablas, checklists, ejemplos y plantillas antes que prosa larga.
- Haz explícita la intención de revisión: qué cambió, por qué importa y cómo verificarlo.
- Elimina encuadres repetidos, tono motivacional y contexto genérico.
- Escribe toda la prosa humana en español neutro y profesional, con independencia de la lengua predominante del código base. Conserva sin traducir literales técnicos, identificadores, rutas, comandos, APIs, valores de estado, logs, errores, citas textuales, terminología técnica canónica del proyecto y tokens estructurales exigidos por formatos o tooling.
- Si modificas un documento existente en inglés, normaliza al español toda su prosa humana; no traduzcas citas ni contratos públicos literales.

## Forma Recomendada

Para docs orientadas a revisión:

```text
Resultado
- <qué cambió o qué decisión se tomó>

Por qué
- <razón e impacto técnico/usuario>

Cómo verificar
- <comandos, archivos, screenshots, acceptance checks>

Riesgos / límites
- <gaps conocidos, follow-ups, non-goals>
```

Para guías:

```text
Objetivo
Prerrequisitos
Camino rápido
Variantes comunes
Troubleshooting
Referencias
```

## Condiciones De Parada

- Si la doc describe internals pero la audiencia es usuaria, reescribe desde la tarea del usuario.
- Si el lector debe reconstruir el cambio desde contexto disperso, añade resumen o tabla.
- Si una sección es larga pero poco frecuente, muévela a "Detalles" o "Troubleshooting".
