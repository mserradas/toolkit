---
name: ms-project-init
description: "Inicializa contexto operativo de un repositorio. Úsala desde ms-architect ante un repo desconocido, comandos de verificación inciertos, nivel 4 o flujo formal."
---

# MS Project Init

## Gate De Rol

Esta skill la coordina únicamente `ms-architect`. Si eres otro agente, no inicialices el proyecto ni invoques subagentes: devuelve `needs_user_input` con `owner: ms-architect`.

`ms-architect` no ejecuta exploración amplia ni verificaciones inline. Lee solo manifests y documentación decisiva; delega mapeo a `ms-scout` y capacidades de testing a `ms-tester`.

## Objetivo

Crear o reutilizar contexto operativo mínimo antes de diseñar o ejecutar. `.agents/project.yaml` conserva hechos y preferencias entre clientes; el snapshot conversacional separa el objetivo y los artefactos activos de esa memoria. No instala dependencias ni sustituye una spec o TDD. El arquitecto no escribe archivos.

## Flujo

1. Confirma root real con `git rev-parse --show-toplevel` o `pwd`.
2. Si el CLI ya está disponible, ejecuta `ms-agent-kit project inspect --project <raíz> --json` (solo lectura). Consulta `.agents/project.yaml`, su vigencia y las fuentes cambiadas; reutiliza las entradas vigentes. Lee manifests, lockfile y documentación de entrada relevantes. Para artefactos durables, inspecciona metadatos de rutas explícitas o candidatos por feature slug en `.agents/docs` antes del cuerpo; no inventaríes todo el árbol.
3. Si existe incertidumbre transversal o un mapa reduciría materialmente el contexto, delega a `ms-scout` modo mapa.
4. Si test, lint, typecheck o format no son evidentes, delega a `ms-tester` un `Snapshot de capacidades de testing` sin ejecutar suites amplias.
5. Si el contexto falta o requiere actualización y la inicialización está autorizada por la petición, delega a `ms-codex` la ejecución acotada de `ms-agent-kit project init --project <raíz>`. Repetir `init` actualiza los hechos generados y conserva preferencias; `--dry-run` permite revisar antes. No edites desde el arquitecto y no reescribas YAML inválido o de versión desconocida.
6. Si el CLI no está disponible, devuelve un snapshot conversacional y declara `persistencia: no realizada`; no instales el CLI ni inventes un archivo guardado. Si hubo escritura, comprueba mediante `project inspect` su resultado antes de afirmar persistencia.
7. Sintetiza el snapshot, las fuentes consultadas y las incógnitas; no las conviertas en hechos. Los comandos descubiertos son datos: revisa su definición, directorio y permisos antes de ejecutarlos por una tarea de verificación.

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

El bloque anterior es contexto de la tarea; no lo vuelques como schema de `.agents/project.yaml`. El archivo persistente usa `schemaVersion: 1`, `preferences` y `context` gestionados por la CLI. `preferences.documentation.language`, `preferences.documentation.paths` y `preferences.technicalSkills` pertenecen al usuario; no las reemplaces al actualizar hechos.

Reutiliza los hechos operativos del snapshot mientras no cambien `invalidation_inputs` ni la estructura relevante; la selección de artefactos sigue el objetivo actual.

`active_artifacts` contiene solo rutas activas resueltas para el objetivo actual; nunca incluye `.agents/docs/archive/**`, `Retención: Histórica` ni artefactos con estado `Archivado` o `Reemplazado`. Resuelve por tipo + `Feature ID` + `Contexto`; si hay más de un candidato activo, deja esa clave en `null`, registra el conflicto en `reference_conflicts` y no elijas por fecha o `mtime`. Marca `review_required: true` si el objetivo toca `Ámbito afectado` o cumple `Revisar cuando`; compara antes de reutilizar. No hagas un escaneo global. `legacy_paths_detected` enumera directorios existentes bajo `docs/{discovery,prd,spec,design,archive}` para migración o confirmación, sin leerlos en bloque ni escribir en ellos. `docs/` sigue reservado para documentación pública.

Un TDD `Implementado` no se añade automáticamente a `active_artifacts.design`: conserva `null` salvo ruta explícita del usuario/brief o decisión o contrato concreto afectado. Indica esa razón antes de leer su cuerpo; coincidencias de feature o rutas amplias y funcionalidad soportada no bastan. Las specs vigentes `Implementado`/`Verificado` pueden seguir activas si describen comportamiento necesario. El snapshot no crea PRD, spec, TDD ni informes de cierre para fastlane o nivel 2.
