---
name: cognitive-doc-design
description: "Diseña documentación para personas clara y de baja carga cognitiva: READMEs, guías, RFCs, arquitectura, notas de revisión y onboarding. Excluye crear o revisar instrucciones para agentes (AGENTS.md, CLAUDE.md o equivalentes) y crear o mejorar SKILL.md."
---

# Cognitive Doc Design

Usa esta skill al crear o revisar documentación que otra persona debe entender, revisar o ejecutar rápido.

## Contrato De Activación

Selecciona por el entregable y su propósito. Para archivos de instrucciones para agentes usa `agent-instructions-design`; para crear una skill usa `skill-creator` y para mejorarla `skill-improver`. Un README o guía que explica `AGENTS.md`, `CLAUDE.md` o skills sigue dentro de `cognitive-doc-design`. En peticiones mixtas, aplica cada skill solo a su entregable, sin encadenarlas automáticamente sobre el mismo archivo. Respeta una selección explícita del usuario.

## Reglas

- Empieza por la respuesta: decisión, acción o resultado; contexto después.
- Usa revelación progresiva: happy path primero, detalles y casos borde después.
- Agrupa el contenido en secciones cortas con títulos claros.
- Prefiere tablas, checklists, ejemplos y plantillas antes que prosa larga.
- Haz explícita la intención de revisión: qué cambió, por qué importa y cómo verificarlo.
- Elimina encuadres repetidos, tono motivacional y contexto genérico.
- Sigue `preferences.documentation.language` y la convención documental del proyecto: con `inherit`, conserva el idioma existente; para documentos nuevos sin convención usa español neutro y profesional. Conserva sin traducir literales técnicos, identificadores, rutas, comandos, APIs, valores de estado, logs, errores, citas textuales, terminología técnica canónica del proyecto y tokens estructurales exigidos por formatos o tooling.
- Una edición puntual no autoriza traducir el documento completo; no traduzcas citas ni contratos públicos literales. Usa `preferences.documentation.paths` dentro del permiso efectivo del rol.

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
