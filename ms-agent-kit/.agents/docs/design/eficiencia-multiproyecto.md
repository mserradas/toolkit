# Eficiencia multiproyecto

> Estado: Implementado
> Feature ID: eficiencia-multiproyecto
> Contexto: global
> Versión: 4
> Fecha de creación: 2026-09-02
> Última revisión: 2026-09-11
> Retención: Temporal
> Revisar cuando: cambien los contratos de persistencia del contexto, recuperación de locks, permisos de escritura documental o herencia de modelos.
> Ámbito afectado: `project.yaml`, publicación atómica, `projectWritePaths` y `resolveAgentModel`.
> Implementado en: [contexto de proyecto](../../../src/core/project-context.ts).

## Consulta y retención

Esta referencia resume decisiones técnicas y enlaza sus fuentes canónicas. Queda fuera de la selección automática de `active_artifacts`; que la funcionalidad siga soportada no convierte el TDD en contexto activo.

Consúltalo únicamente por petición de su ruta o cuando una tarea afecte uno de los contratos descritos abajo. En ese caso, registra qué decisión resulta relevante y carga solo la sección necesaria.

La retención temporal permite promover estas razones a documentación duradera cuando exista un destino autorizado. Después puede proponerse su eliminación; conservarlo aquí no exige incorporarlo a cada tarea.

## Contexto como datos

Las preferencias humanas se separan del contexto generado para que una actualización conserve las decisiones del proyecto. Los comandos detectados describen cómo verificarlo; no autorizan su ejecución ni amplían permisos del agente.

El schema estricto y el rechazo de aliases y symlinks evitan interpretaciones ambiguas y accesos indirectos. Un archivo inválido se conserva para corrección explícita: no se sobrescribe con valores inferidos.

Fuentes: [`initializeProjectContext` e `inspectProjectContext`](../../../src/core/project-context.ts). El schema y los comandos de uso están en el [README](../../../README.md).

## Persistencia y concurrencia

La publicación es atómica y, bajo el lock del kit, compara el contenido observado antes de actualizar. El rename atómico por sí solo no detecta conflictos; la comparación protege frente a cambios observados durante la operación.

La recuperación de locks usa un guard conservador. Un guard abandonado requiere intervención manual; esta limitación evita que dos recuperadores sustituyan simultáneamente al propietario.

Fuentes: [persistencia del contexto](../../../src/core/project-context.ts) y [`acquireOperationLock`](../../../src/core/operation-lock.ts).

## Alcance de escritura documental

Una instalación de usuario conserva reglas genéricas; las rutas documentales del proyecto solo se incorporan al ámbito de proyecto y al rol escritor. Así, un repositorio no amplía los permisos de instalaciones globales.

Codex concede escritura por directorio; la limitación a Markdown se mantiene como instrucción del rol. Ese límite no equivale a una restricción de extensión impuesta por el sistema de archivos.

Fuentes: [`projectWritePaths`](../../../src/adapters/common.ts) y [adaptador Codex](../../../src/adapters/codex.ts). La configuración admitida está en el [README](../../../README.md).

## Modelos y evidencia

Los overrides personales se resuelven por agente y cliente sin modificar los valores base ni otros agentes o clientes. En Codex, la configuración de especialistas respeta la herencia y no cambia el modelo de la tarea principal.

Fuentes: [`loadKitConfiguration`](../../../src/core/kit-config.ts) y [`resolveAgentModel`](../../../src/core/agent-models.ts). El [README](../../../README.md#elegir-modelos-por-agente) documenta el uso; el [plan de mejoras](../../../docs/plan-mejoras-eficiencia.md) conserva la evidencia de verificación y las evaluaciones de eficiencia aún pendientes.
