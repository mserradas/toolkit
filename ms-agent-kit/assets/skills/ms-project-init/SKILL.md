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
2. Lee manifests, lockfile y documentación de entrada relevantes. Para artefactos durables, inspecciona solo rutas explícitas o candidatos por feature slug en `.agents/docs`; no inventaríes todo el árbol.
3. Si existe incertidumbre transversal o un mapa reduciría materialmente el contexto, delega a `ms-scout` modo mapa.
4. Si test, lint, typecheck o format no son evidentes, delega a `ms-tester` un `Snapshot de capacidades de testing` sin ejecutar suites amplias.
5. Sintetiza el snapshot y lista incógnitas; no las conviertas en hechos.
6. Devuelve el snapshot al invocador.

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
    canonical_root: ".agents/docs"
    directories:
      discovery: ".agents/docs/discovery"
      prd: ".agents/docs/prd"
      spec: ".agents/docs/spec"
      design: ".agents/docs/design"
      archive: ".agents/docs/archive"
    active_artifacts:
      discovery: null
      prd: null
      spec: null
      design: null
    artifact_identity:
      feature_id: null
      context: "global"
      review_required: false
    reference_conflicts: []
    legacy_paths_detected: []
  risks_or_unknowns: []
  invalidation_inputs:
    manifests: []
    lockfiles: []
    scripts: []
```

Reutiliza el snapshot mientras no cambien `invalidation_inputs` ni la estructura relevante.

`active_artifacts` contiene solo rutas activas resueltas para el objetivo actual; nunca incluye `.agents/docs/archive/**`, `Retención: Histórica` ni artefactos con estado `Archivado` o `Reemplazado`. Resuelve por tipo + `Feature ID` + `Contexto`; si hay más de un candidato activo, deja esa clave en `null`, registra el conflicto en `reference_conflicts` y no elijas por fecha o `mtime`. Marca `review_required: true` si el objetivo toca `Ámbito afectado` o cumple `Revisar cuando`; compara antes de reutilizar. No hagas un escaneo global. `legacy_paths_detected` enumera directorios existentes bajo `docs/{discovery,prd,spec,design,archive}` para migración o confirmación, sin leerlos en bloque ni escribir en ellos. `docs/` sigue reservado para documentación pública.
