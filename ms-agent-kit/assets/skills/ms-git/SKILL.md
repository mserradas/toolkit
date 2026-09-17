---
name: ms-git
description: "Prepara y ejecuta commits, push, PRs y releases con una convención compartida y excepciones por proyecto. Úsala cuando el usuario pida esa entrega o revisar su preparación; en un flujo ms-* la ejecuta ms-architect. No implementa código ni decide cómo dividir el trabajo."
---

# Entrega Git Y PR

Completa la entrega solicitada conservando los cambios ajenos y la evidencia de verificación. En un flujo `ms-*`, esta skill corresponde a `ms-architect`; los workers devuelven el resultado al arquitecto. En una tarea principal sin un rol restringido, úsala directamente dentro de sus permisos. La skill no amplía herramientas ni anula denegaciones.

## Convención Aplicable

Lee siempre [la convención compartida](references/git-conventions.md) al preparar una entrega, junto con las excepciones del `AGENTS.md` aplicable. La prioridad es: petición explícita del usuario, excepción documentada del proyecto, convención compartida. La referencia es la única definición de ramas, destinos, mensajes e integración; no copies sus reglas en cada repositorio.

## Alcance De La Petición

| Petición vigente | Resultado autorizado |
|---|---|
| Preparar la entrega o implementar sin pedir publicación | Revisar el diff, proponer mensaje/título y resumir verificación; sin staging, commit ni push |
| Hacer commit | Preparar únicamente los cambios de la tarea y crear el commit; sin push |
| Hacer push | Publicar los commits existentes de la rama acordada; no convertir cambios sin commit en commits automáticamente |
| Abrir o actualizar una PR | Preparar la rama, hacer los commits necesarios del alcance autorizado, push y crear o actualizar la PR |
| Crear una rama release | Crear la rama desde la referencia verificada con la versión elegida por el usuario; publicar su PR solo si la petición incluye abrirla |

Reutiliza la autorización y las elecciones de esta conversación. No pidas confirmar cada paso ni elegir entre títulos si ya se pidió completar la entrega. Si solo se invoca la skill sin acción, pregunta qué entrega se busca. Pregunta por alcance o destino únicamente si la evidencia no permite resolver una ambigüedad material. Ninguna de estas peticiones incluye merge, force-push, borrados, reescritura de historial, saltarse hooks ni solicitar revisores.

## Preparación

- Resuelve la convención aplicable y, para PRs, consulta su plantilla. Reutiliza contexto vigente de la tarea.
- Revisa rama, estado, cambios preparados, cambios sin preparar y archivos nuevos relevantes: `git branch --show-current`, `git status --short`, `git diff`, `git diff --cached` y `git log -5 --oneline`.
- Incluye solo el trabajo solicitado. Si hay cambios ajenos en staging o mezclados en las mismas líneas y no puedes aislar la entrega sin alterarlos, conserva el estado y aclara el alcance antes del commit. No uses `git add .`, `git add -A`, reset ni stash para limpiar el workspace.
- Conserva las unidades ya acordadas. `work-unit-commits` define la división cuando hace falta; esta skill ejecuta la entrega y no rediseña el plan.
- Reutiliza verificaciones vigentes del mismo estado de código. Si falta una comprobación obligatoria o un hook falla, devuelve esa corrección al flujo de desarrollo y reanuda desde el paso pendiente. No declares tests ejecutados por el hecho de crear un commit.

## Commits

Aplica los mensajes y tipos de la convención resuelta. Un mensaje explícito del usuario tiene prioridad; no abras una elección de títulos si ya hay autorización para completar la entrega.

1. Si hace falta una rama, resuelve su nombre, referencia de origen y destino de PR por separado según la convención. Créala con `git switch -c <rama> <referencia-verificada>`. No cambies de rama con modificaciones ajenas que puedan desplazarse.
2. Prepara rutas explícitas con `git add -- <rutas>` y comprueba el diff staged. Si el índice ya representa exactamente el alcance, no lo vuelvas a preparar.
3. Crea un commit por unidad acordada, con `git commit -m <mensaje>` o `git commit -F <archivo preparado>`. Si no hay cambios, informa del estado sin crear un commit vacío ni hacer amend.
4. Comprueba el nuevo commit y el estado restante. Si la petición era solo commit, termina aquí.

## Push Y PR

- Verifica rama, remoto y las referencias exigidas por la convención. Para GitHub, contrasta `git remote -v` con `gh repo view --json nameWithOwner,defaultBranchRef`; la rama predeterminada de GitHub es información del repositorio, no determina el destino de la entrega. Un commit local no requiere GitHub ni acceso a red.
- Revisa los commits que se publicarán y el diff completo respecto a la base acordada. Incluye todos los cambios que realmente llegarán a la PR, no solo el último commit. No publiques trabajo ajeno ni pushes a la rama principal por inferencia.
- Antes de crear una PR, busca una abierta para la misma rama, base y repositorio con `gh pr list`. Reutiliza la existente; actualízala solo dentro del alcance solicitado. No dupliques una PR por un error de red o una respuesta incompleta.
- Publica con `git push -u <remoto> <rama>`. Después crea la PR con `gh pr create --base <base> --head <rama> --title <título> --body <cuerpo>` o actualiza con `gh pr edit <número>`. Respeta la petición de borrador cuando exista.
- El título y cuerpo deben permitir revisar el cambio sin leer la conversación: problema y comportamiento resultante, verificaciones con sus resultados reales y limitaciones relevantes. Sigue la plantilla existente; usa `Closes #…` solo si la entrega debe cerrar esa issue. No crees issues ni planes adicionales para completar una entrega.
- Usa `--body-file` cuando haya un archivo preparado. Si el rol no puede escribirlo, usa texto literal que admita su política; no fabriques archivos mediante redirecciones o intérpretes. Puedes combinar consultas permitidas por el cliente; ejecuta las mutaciones en pasos verificables y comprueba cada resultado. No cambies de sintaxis para eludir una denegación.
- Verifica la URL, rama y base con `gh pr view`; consulta `gh pr checks` si aplica. Distingue CI pendiente de CI correcto. Si la publicación devuelve un resultado incierto, consulta el estado remoto (`git ls-remote --heads <remoto> <rama>`) y la PR antes de reintentar. Ante fallo de autenticación o rechazo de política, informa de la causa y conserva el trabajo para retomarlo.

## Cierre

Resume solo lo realizado: commit y rama, estado del push, enlace de PR cuando exista, verificación y pendientes. Diferencia lo preparado de lo publicado. Una implementación completada sin petición de entrega termina lista para revisión; una PR abierta termina sin merge.
