---
name: agent-instructions-design
description: "Crea, edita y revisa archivos de instrucciones para agentes: AGENTS.md, CLAUDE.md o el equivalente solicitado, con reglas y convenciones concretas del proyecto. Se activa cuando ese archivo es el entregable; excluye documentación para personas y creación o mejora de SKILL.md."
---

# Agent Instructions Design

Convierte hechos del proyecto y preferencias del usuario en instrucciones breves que ayuden a un agente a decidir y verificar su trabajo.

## Contrato De Activación

Selecciona por el archivo que se modifica y su propósito, no por menciones a agentes:

| Entregable | Skill responsable |
|---|---|
| Instrucciones operativas en `AGENTS.md`, `CLAUDE.md` o equivalente pedido | `agent-instructions-design` |
| README, guía o RFC para personas, aunque explique esos archivos | `cognitive-doc-design` |
| Skill reutilizable nueva con `SKILL.md` | `skill-creator` |
| Auditoría o mejora de una skill existente | `skill-improver` |

Usa esta skill de forma autónoma para el archivo de instrucciones; no cargues `cognitive-doc-design` automáticamente por necesitar claridad. En peticiones mixtas, aplica cada skill solo a su entregable. Mencionar o leer `AGENTS.md` durante una tarea de código no activa su edición ni esta skill. Respeta una selección explícita del usuario.

## Alcance Y Evidencia

1. Respeta el archivo, cliente y ámbito solicitados: global, repositorio o subdirectorio. Si falta destino, reutiliza el archivo pertinente existente o el formato del cliente confirmado; pregunta solo cuando la ambigüedad cambie el resultado. Genera ambos formatos únicamente si se pidieron.
2. Lee las instrucciones que afecten a ese ámbito y las fuentes mínimas relevantes: documentación de entrada, manifests, scripts y configuración. Reutiliza contexto vigente disponible sin exigir `ms-project-init` ni otros componentes del kit.
3. Distingue reglas explícitas del usuario, convenciones comprobadas y propuestas. Un ejemplo aislado de código no establece una norma. Conserva las incógnitas en el reporte; evita completar el archivo con comandos o políticas inventados.
4. Comprueba el alcance, la carga y las referencias soportadas por el cliente antes de depender de ellas. Consulta su documentación oficial si hay dudas; no supongas que cambiar el nombre entre `AGENTS.md` y `CLAUDE.md` conserva el comportamiento. Un enlace Markdown no acredita carga automática.

## Redacción Y Edición

- Incluye solo información que cambie decisiones: límites entre módulos, convenciones relevantes, comandos con su directorio, archivos generados y criterios de finalización, según el proyecto. Evita secciones vacías y consejos genéricos.
- Escribe cada regla con condición y acción observables; añade verificación cuando corresponda. Distingue requisitos de preferencias y define excepciones solo cuando tengan una razón concreta.
- Ordena primero las instrucciones frecuentes y enlaza detalles mantenidos en otras fuentes. Evita duplicar documentación, configuración o reglas de un ámbito superior; conserva visibles las instrucciones imprescindibles.
- Mantén el idioma solicitado o existente y los literales técnicos intactos. Una edición puntual conserva las reglas y secciones ajenas al cambio.
- Resuelve contradicciones con la petición vigente y la evidencia. Si dos decisiones incompatibles siguen sin resolverse, señala el conflicto sin elegir silenciosamente ni añadir ambas como obligaciones.
- Aplica los cambios pedidos sin reconfirmación rutinaria. Una revisión o auditoría entrega hallazgos; modifica solo si la petición también autoriza aplicar. Mantén las escrituras dentro del alcance autorizado y los permisos efectivos del rol.
- Las instrucciones redactadas no conceden herramientas ni permisos y no sustituyen controles del cliente. Evita imponer dependencias, roles, aprobaciones o flujos `ms-*` que el proyecto no haya adoptado.

## Verificación Y Salida

Revisa el diff, las rutas y las referencias locales. Contrasta los comandos con sus definiciones y distingue los inspeccionados de los ejecutados; documentarlos no requiere instalar dependencias ni lanzar suites completas. Comprueba que las reglas sean aplicables, no se contradigan y respeten el alcance real del cliente.

Entrega el archivo o diff solicitado y un resumen breve de las reglas añadidas o ajustadas, la evidencia revisada y las incógnitas pendientes. En auditoría, devuelve hallazgos con ubicación y corrección propuesta. No afirmes que el cliente ha cargado las instrucciones sin comprobarlo.
