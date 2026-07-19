---
name: ms-project-init
description: "Inicializa contexto operativo de un repositorio. Úsala desde ms-architect ante un repo desconocido, comandos de verificación inciertos, nivel 4 o flujo formal."
---

# MS Project Init

## Gate De Rol

Esta skill la coordina únicamente `ms-architect`. Si eres otro agente, no inicialices el proyecto ni invoques subagentes: devuelve `needs_user_input` con `owner: ms-architect`.

`ms-architect` no ejecuta exploración amplia ni verificaciones inline. Lee solo manifests y documentación decisiva; delega mapeo a `ms-scout` y capacidades de testing a `ms-tester`.

## Objetivo

Crear un snapshot operativo mínimo antes de diseñar o ejecutar. No instala dependencias, no modifica configuración y no sustituye una spec o TDD.

## Flujo

1. Confirma root real con `git rev-parse --show-toplevel` o `pwd`.
2. Lee manifests, lockfile y documentación de entrada relevantes.
3. Si comprender arquitectura requiere 4 o más archivos, delega a `ms-scout` modo mapa.
4. Si test, lint, typecheck o format no son evidentes, delega a `ms-tester` un `Snapshot de capacidades de testing` sin ejecutar suites amplias.
5. Sintetiza el snapshot y lista incógnitas; no las conviertas en hechos.
6. Devuelve el snapshot al invocador. Solo usa `ms-progress` si el usuario pide guardar un checkpoint antes de cambiar de sesión.

## Salida

```yaml
Project context snapshot:
  root: "<repo/root>"
  stack: []
  package_manager: null
  architecture_notes: []
  verification:
    test: null
    lint: null
    typecheck: null
    format_check: null
  docs:
    prd_dir: "docs/prd"
    spec_dir: "docs/spec"
    design_dir: "docs/design"
    status_dir: ".atl/status"
  risks_or_unknowns: []
  invalidation_inputs:
    manifests: []
    lockfiles: []
    scripts: []
```

Reutiliza el snapshot mientras no cambien `invalidation_inputs` ni la estructura relevante.
