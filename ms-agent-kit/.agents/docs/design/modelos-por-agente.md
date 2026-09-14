# Modelos por agente

> Estado: Implementado
> Feature ID: modelos-por-agente
> Contexto: global
> Versión: 2
> Fecha de creación: 2026-09-11
> Última revisión: 2026-09-11
> Retención: Temporal
> Revisar cuando: se apruebe la disposición de esta referencia, cuya decisión ya está absorbida por documentación y tests
> Ámbito afectado: catálogo de agentes, resolución de modelos, configuración personal, adaptadores, plan y doctor
> Implementado en: [resolución por agente](../../../src/core/agent-models.ts) y [guía de modelos](../../../README.md#elegir-modelos-por-agente)

## Decisión implementada

La agrupación de modelos `strong/balanced/light/fast` fue sustituida por defaults explícitos y overrides independientes por agente y cliente. PRD: N/A. Spec: N/A. El [catálogo](../../../src/core/agent-catalog.ts) y `resolveAgentModel` en [agent-models.ts](../../../src/core/agent-models.ts) son las fuentes vigentes; se conservaron modelos, esfuerzos, herencia y perfiles de capacidades y permisos.

La configuración personal usa `models[agent][client]`; el plan JSON presenta `models[client][agent]`. La resolución independiente impide que un override de un agente cambie otro rol o cliente. La procedencia declarada no demuestra la configuración efectiva de una sesión; `ms-architect` de Codex conserva su materialización como skill de la tarea principal.

## Compatibilidad deliberada

Se conserva `schemaVersion: 1`, aunque las claves públicas de modelos cambian de forma incompatible. Los perfiles antiguos se rechazan con un error accionable; no existe interpretación ni migración silenciosa que pueda propagar overrides a agentes no deseados. La [guía de modelos](../../../README.md#elegir-modelos-por-agente) documenta la sustitución manual.

Sin configuración o con `models: {}` se mantienen los defaults. Las demás secciones de configuración, las validaciones de secretos y symlinks y las autorizaciones de verificación conservan su semántica. Doctor atribuye fuentes al catálogo por agente y ya no presenta perfiles de modelos.

## Evidencia y límites

La aceptación incluye pruebas integradas, comprobación de tipos, build, paquete, diff y revisión de seguridad focal. La comparación de artefactos anteriores y posteriores conserva los agentes nativos; la diferencia deliberada es la frase de `ms-doctor` de Codex en los scopes user y project. Los resultados no implican cambios de modelos ni una instalación global completada.

La decisión de consumo está promovida al [README](../../../README.md#elegir-modelos-por-agente) y al [plan de mejoras](../../../docs/plan-mejoras-eficiencia.md), con cobertura en los tests de [configuración](../../../tests/model-config.test.ts), [diagnóstico](../../../tests/model-diagnostics.test.ts) y [adaptadores](../../../tests/adapters.test.ts). Este documento no conserva planes ejecutados, conteos ni logs por corrida.

## Disposición

Clasificación: eliminar propuesto. La decisión está absorbida por documentación y tests; la retención temporal mantiene únicamente esta referencia hasta resolver su disposición. Queda fuera de carga automática. Este cierre no autoriza ni ejecuta borrados o movimientos.
