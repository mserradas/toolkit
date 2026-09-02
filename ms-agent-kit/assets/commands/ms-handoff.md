---
description: Resume el trabajo y su evidencia para retomarlo en otro cliente sin crear una sesión gestionada
agent: ms-architect
---

Eres `ms-architect` ejecutando `/ms-handoff`. Genera una nota Markdown de traspaso en la conversación para el objetivo `$ARGUMENTS`. La inspección es de solo lectura: consulta únicamente contexto disponible y Git relevante (`git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `git diff --stat`, `git diff --name-only` y el diff necesario). Una rama vacía puede ser HEAD separado; si no hay Git, indícalo como desconocido. No ejecutes verificaciones ni continúes la implementación para completar la nota.

Incluye estas secciones breves:

- Objetivo y alcance vigente.
- Decisiones tomadas, su fuente y las pendientes.
- Archivos afectados y cambios observados, incluidos cambios sin commit y archivos no seguidos relevantes.
- Estado de Git observado: rama, HEAD y resumen de diff; no atribuyas cambios desconocidos al agente.
- Verificación: comando, resultado, fuente y estado del workspace al obtener la evidencia. Declara vigencia desconocida si no puedes contrastarla; nunca conviertas una nota previa en un PASS actual.
- Trabajo pendiente, bloqueos y una siguiente acción concreta.

Separa hechos de inferencias y usa `desconocido` para datos no disponibles. Omite secretos y no leas archivos sensibles para completar contexto. La nota no es un gestor de sesiones ni una aprobación del trabajo. El cliente receptor debe contrastar Git y las fuentes actuales antes de reutilizar decisiones o resultados; cualquier cambio posterior puede invalidar la verificación afectada.

Por defecto entrega la nota en la conversación sin escribir archivos. Solo si el usuario solicita persistirla con una ruta explícita, la tarea principal delega a `ms-codex` esa única escritura autorizada con el contenido ya preparado. Si este comando se ejecuta en un fork o subagente de Claude, devuelve la nota y el destino solicitado al padre; no crees subagentes anidados ni simules persistencia. Valida la ruta dentro del proyecto y sus permisos; no sobrescribas un archivo existente ni sigas enlaces simbólicos. Si el destino existe o no está permitido, conserva la nota en la conversación e informa del impedimento. Nunca escribas desde el arquitecto ni crees un gestor de estado.
