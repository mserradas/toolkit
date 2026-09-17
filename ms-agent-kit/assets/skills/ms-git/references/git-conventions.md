# Convención Git Compartida

Aplica esta convención en las entregas gestionadas por `ms-git`. Prioridad: instrucción explícita del usuario para la tarea, excepciones del `AGENTS.md` aplicable y, por último, este documento. Una excepción sustituye únicamente las reglas que especifica; el resto conserva estos valores. El historial sirve de contexto, no constituye por sí solo una excepción. Ninguna convención amplía los permisos efectivos del cliente.

## Ramas Y Destinos

Las ramas permanentes son `develop` para integración y `master` para versiones publicadas. Las ramas de trabajo y release son temporales.

| Entrega | Nombre de rama | Crear desde | Base de la PR | Integración prevista |
|---|---|---|---|---|
| Funcionalidad, corrección, refactor, pruebas, documentación o mantenimiento | `<tipo>/<descripcion-corta>` | `develop` | `develop` | Squash and merge |
| Release solicitada por el usuario | `release/<versión>` | `develop` | `master` | Merge commit, conservando los commits de la release |

Usa nombres descriptivos, en minúsculas y separados por guiones: `feat/exportar-csv`, `fix/sesion-caducada`, `test/renovacion-token`. Respeta nombres explícitos del usuario y prefijos exigidos por el cliente. Mantén una rama por unidad de trabajo acordada; continúa una rama existente pertinente en vez de crear otra por cada commit.

Antes de crear una rama, comprueba por separado el punto de partida y la base de la PR. Resuelve el remoto real y la referencia vigente de `develop`; cuando corresponda, actualiza sus referencias mediante `git fetch <remoto>`. Crea la rama con un punto de partida explícito: `git switch -c <rama> <referencia-verificada>`. No uses el HEAD actual ni la rama predeterminada de GitHub como sustitutos implícitos de `develop`.

Si falta la rama requerida tanto localmente como en el remoto, informa de la diferencia y resuelve la adopción del flujo o la excepción del proyecto. Usar esta skill no autoriza crear o renombrar ramas permanentes, mover commits existentes ni migrar repositorios automáticamente.

## Commits Y PRs

Mensajes en español, con verbo en infinitivo y el formato `tipo: descripción breve`. El ámbito entre paréntesis es opcional; úsalo solo si aclara el cambio.

| Tipo | Uso | Ejemplo |
|---|---|---|
| `feat` | Nueva capacidad | `feat: añadir exportación a CSV` |
| `fix` | Corregir un error | `fix: evitar sesiones duplicadas` |
| `refactor` | Reorganizar sin cambiar comportamiento | `refactor: simplificar la validación` |
| `test` | Cambios dedicados a pruebas | `test: cubrir tokens caducados` |
| `docs` | Documentación | `docs: explicar la instalación` |
| `chore` | Dependencias y mantenimiento | `chore: actualizar dependencias` |

Mantén los tests y la documentación asociados dentro de la misma unidad que su comportamiento. Marca los cambios incompatibles con `!` tras el tipo/ámbito y explica qué compatibilidad se rompe. Añade cuerpo al commit solo si aporta contexto; no añadas coautores o trailers salvo petición o convención específica, y siempre con datos conocidos.

Cada PR de trabajo representa una unidad revisable. Su título sigue el formato de commit y sirve como mensaje final al integrar con squash. Su descripción explica el problema, el comportamiento resultante y las verificaciones reales; sigue la plantilla del repositorio cuando exista. Los commits intermedios permanecen en la rama de trabajo hasta la integración.

## Releases

- Crea una release solo cuando el usuario la solicite. Usa exactamente la versión indicada, por ejemplo `release/1.4.0`; si falta, solicítala antes de crear la rama. No deduzcas ni incrementes versiones a partir de los tipos de commit.
- Revisa la configuración de release del repositorio para conocer archivos de versión, formato de título, disparador de publicación y formato del tag. Si preparar la versión exige editar archivos, tramita ese cambio mediante el flujo de implementación; el arquitecto no adquiere permiso de edición por cargar esta skill.
- La PR de release va de `release/<versión>` a `master` y conserva el historial con merge commit. La estrategia de integración describe el resultado esperado; abrir la PR no autoriza fusionarla.
- GitHub Actions crea el tag mediante el workflow existente. No crees ni publiques un tag manual como parte de esta entrega. Si falta la automatización o no se ha comprobado, indícalo; no prometas que se generará el tag ni instales un workflow por inferencia.
- La eliminación de la rama release queda al mecanismo existente del repositorio, sea un workflow o la configuración de GitHub. Conserva `master` y `develop`.
- Si se añaden correcciones o cambios de versión exclusivamente en la release, identifica lo que debe volver a `develop` para que no se pierda en la siguiente versión. Reutiliza la sincronización existente o deja ese paso pendiente de integración; no lo ocultes declarando el flujo completo.
