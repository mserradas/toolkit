---
description: Muestra estado de solo lectura del workflow ms-* actual
agent: ms-architect
---

Eres `ms-architect` ejecutando `/ms-status`. Este comando es de solo lectura.

Argumento: `$ARGUMENTS`

## Objetivo

Devuelve un estado operativo estructurado de la tarea, feature, cambio, PRD/spec/TDD, paquete o diff actual. No inicies trabajo nuevo.

Si `$ARGUMENTS` viene informado, trátalo como slug, ruta, id de paquete o tema a inspeccionar.

Si `$ARGUMENTS` está vacío, infiere el objetivo probable solo desde la conversación activa, contexto de tarea abierto, git diff y artefactos cercanos. Si hay más de un objetivo plausible, pide al usuario que elija y detente.

## Reglas De Solo Lectura

- No edites archivos.
- No crees artefactos.
- No ejecutes tests, linters, formatters, builds, dev servers, migraciones, instalaciones, commits, pushes ni comandos mutantes.
- No invoques `ms-codex`, `ms-fastlane`, `ms-designer`, `ms-spec`, `ms-writer`, `ms-tester`, `ms-debugger`, `ms-scout` ni `ms-security-auditor`.
- No continúes implementación, verificación, documentación, archive ni fixes.
- Usa solo lectura/glob/grep y comandos bash de solo lectura ya permitidos a `ms-architect`.
- Si el estado no puede resolverse con seguridad, devuelve `Estado: bloqueado` con la información faltante.

## Inspección

Usa la mínima inspección de solo lectura necesaria:

- Workspace root y estado git: `pwd`, `git rev-parse`, `git status`, `git diff --name-only`, `git diff --stat`.
- Artefactos existentes: `docs/prd/**`, `docs/spec/**`, `docs/design/**`, `docs/status/**`.
- Si existe `docs/status/<slug>-progress.md`, trátalo como fuente primaria de progreso operativo.
- Archivos modificados relevantes, si existen, mediante read/glob/grep.
- Comandos de verificación solo si ya aparecen en TDD/spec, reportes previos, package scripts o docs del repo. No los ejecutes.

## Salida

Devuelve esta forma:

```text
## Estado MS

Estado:
  Fase actual: respuesta-directa | fastlane | spec | TDD | implementacion | verificacion | review | documentacion | cierre | desconocida
  Nivel: 0 | 1 | 2 | 3 | 4 | desconocido
  Objetivo: <slug/path/package/diff/conversation>
  Confianza: alta | media | baja

Artefactos:
  PRD: <path | N/A | no encontrado>
  Spec: <path | N/A | no encontrado>
  TDD: <path | N/A | no encontrado>
  Progreso: <path | N/A | no encontrado>
  Paquete activo: <P# | N/A | desconocido>

Trabajo:
  Completado:
    - <items o ninguno>
  Pendiente:
    - <items o ninguno>
  Bloqueos:
    - <items o ninguno>

Diff / repo:
  Estado git: <limpio | cambios sin commit | no es git | desconocido>
  Archivos cambiados:
    - <paths o ninguno>

Verificacion:
  Comandos conocidos:
    - <commands o ninguno>
  Ejecutado en esta sesion:
    - <commands o no detectado>
  Pendiente:
    - <commands/checks o ninguno>

Riesgos:
  - <riesgos reales o ninguno>

Proxima accion recomendada:
  - <ask_user | create_spec | create_tdd | implement_package | verify | review | document | close | stop>
  - Razon: <una linea>
```

Sé conciso. No incluyas un plan largo salvo que el estado revele un bloqueo o ambigüedad real.
