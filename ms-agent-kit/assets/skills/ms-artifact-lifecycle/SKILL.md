---
name: ms-artifact-lifecycle
description: "Resuelve identidad, vigencia y disposición de artefactos durables. Úsala desde ms-architect con artefactos de nivel 3–4, al cerrar o pausar ese trabajo y en ms-status docs o maintenance; omítela en cambios simples sin artefactos."
---

# Gate De Rol

Esta skill la coordina únicamente `ms-architect`. No amplía permisos ni autoriza mutaciones. Los owners de specs o TDDs reciben las reglas pertinentes en el brief y actualizan solo sus artefactos.

# Artefactos Durables

La raíz canónica es `.agents/docs`: discovery en `.agents/docs/discovery`, PRD en `.agents/docs/prd`, spec en `.agents/docs/spec`, TDD en `.agents/docs/design` e histórico en `.agents/docs/archive`. `docs/` queda reservado para documentación pública y no es fuente canónica de estos artefactos.

Una ruta explícita del usuario tiene prioridad: si no existe en disco, repórtala como input inválido y bloqueante; no busques un reemplazo silencioso. Solo cuando el usuario no indicó ruta usa el candidato único por feature slug en el directorio canónico. La identidad estable es `Feature ID` + `Contexto`, donde `Contexto` es `global`, `branch:<ref>` o `release:<versión>` y puede omitirse solo si es `global`. Para crear `Feature ID`, usa el ticket o ID explícito si existe; si no, congela el slug canónico inicial. Un cambio de título o slug no cambia ese ID y ninguna fase posterior inventa otro. Ante varios candidatos relevantes, no elijas por fecha ni `mtime`: usa trazabilidad y estado, y pregunta solo si la elección cambia el resultado. Lee únicamente el artefacto activo y sus referencias directas; no cargues todo `.agents/docs` ni invoques `ms-project-init` solo para resolver una ruta conocida.

Un PRD `Borrador` o `En revisión` no autoriza implementación. Los artefactos `Archivado` o `Reemplazado` y todo `.agents/docs/archive/**` son históricos, no fuentes activas. No infieras aprobación por la mera existencia de un archivo. Si la petición vigente, el PRD (producto/qué), la spec (comportamiento) o el TDD (diseño/cómo) se contradicen, reporta drift y no lo resuelvas silenciosamente.

Lee metadatos antes del cuerpo. Un TDD `Implementado` queda fuera de la carga automática y de `active_artifacts` por defecto. Solo una ruta explícita del usuario/brief o una decisión o contrato concreto afectado justifica consultarlo; indica la razón. Coincidir en feature, ruta amplia o funcionalidad soportada no basta. Esta exclusión no se aplica a PRDs ni a specs `Implementado`/`Verificado` vigentes cuyo comportamiento sea necesario.

Detecta `docs/{discovery,prd,spec,design,archive}` como rutas legacy: repórtalas para migración o confirmación, nunca escribas nuevos artefactos allí ni las mantengas como segunda fuente de verdad.

## Ciclo De Vida

`.agents/docs` es memoria de trabajo versionada, no un almacén permanente. Conserva como máximo un artefacto activo por tipo + `Feature ID` + `Contexto`; cualquier otro enlaza `Reemplazado por` o queda como candidato de disposición. Si ramas o versiones contienen comportamiento divergente, no las combines ni dispongas automáticamente: reporta conflicto. La ausencia de metadatos se reporta como gap, no se completa con fechas, owners o evidencia inventados.

Al cerrar, pausar, cancelar, abandonar o reemplazar un trabajo nivel 3–4, clasifica cada artefacto relevante con una razón observable:

| Clasificación | Criterio |
|---|---|
| `mantener activo` | Necesario para trabajo abierto o comportamiento vigente; un TDD implementado exige relevancia concreta, no basta que su implementación exista |
| `promover` | Contiene conocimiento duradero que debe sintetizarse en README, documentación pública permitida o la convención ADR/arquitectura existente mediante un owner autorizado |
| `archivar propuesto` | Tiene valor histórico explícito por auditoría, compliance, una decisión mayor o petición del usuario |
| `eliminar propuesto` | Solo apoyó la ejecución, fue absorbido o quedó totalmente reemplazado; Git conserva el historial |

Archivar, mover o eliminar siempre requiere autorización explícita: reporta la propuesta y no ejecutes ni delegues esa acción sin ella. `Retención: Histórica` exige un motivo de retención concreto; `.agents/docs/archive` no es un vertedero.

Un trabajo parcial que continuará conserva `Retención: Temporal` e indica `Revisar cuando` con un evento o condición observable; no se archiva ni elimina. `Revisar cuando` también es obligatorio para `Histórica`, salvo retención legal indefinida explícitamente justificada. En tareas posteriores, para un artefacto ya seleccionado por relevancia, si el cambio toca `Ámbito afectado` o cumple `Revisar cuando`, marca `review_required: true`, compara antes de reutilizar y no asumas vigencia por metadatos. Un ámbito amplio no activa por sí solo la lectura de un TDD implementado.

Aplica estas reglas sin plazos arbitrarios:

- Discovery es temporal por defecto. Al pasar a PRD, sintetiza allí la evidencia útil y propone eliminar la nota, salvo evidencia única que justifique conservarla.
- El PRD permanece activo mientras su decisión de producto siga vigente. Tras implementar o abandonar, conserva solo el rationale aún útil; en otro caso propone eliminarlo. Solo propone archivo con una razón histórica explícita.
- La spec permanece activa y actualizada mientras describa comportamiento soportado. Si fue reemplazada o el comportamiento desapareció, propone archivo o eliminación según la trazabilidad necesaria.
- Al implementar un TDD, compacta duplicados de README/spec/tests, planes ejecutados, bitácoras, logs y métricas por corrida. Conserva decisiones únicas con razón, consecuencia y enlaces; propone promoverlas a documentación autorizada existente. Después propone eliminarlo o archivarlo si existe una razón. Si falta destino, conserva una referencia mínima fuera de carga automática y reporta el gap.

No abras un subflujo documental para fastlane o nivel 2 claro: no crees PRD, spec, TDD ni informes de cierre. Solo reporta un candidato evidente ya existente. En niveles 3–4 genera únicamente el artefacto que resuelva una necesidad, sin cadena documental obligatoria.

Cuando evidencia y estado documental no condicionen la implementación, consolídalos al cierre en una delegación por propietario documental, con sus rutas autorizadas y la evidencia final. Evita delegaciones sucesivas por cada actualización intermedia; conserva los límites de cada rol.

Antes de usar o disponer un artefacto, valida que `Reemplazado por` exista, no forme ciclos, comparta `Feature ID` y `Contexto` salvo relación explícita, y no haya duplicados activos por la clave compuesta. `Implementado en` local debe ser resoluble cuando el runtime lo permita; una referencia externa se reporta como no verificada sin `webfetch` automático. Una promoción no permite retirar el origen hasta comprobar destino, contenido duradero, referencias actualizadas y ausencia de duplicación activa.

La ejecución post-autorización sigue este orden exacto:

1. Clasifica y propone; completa y verifica la promoción si aplica.
2. Muestra acciones y rutas exactas y obtiene autorización explícita.
3. Delega a `ms-codex` una única mutación acotada a ese lote.
4. Revisa diff y referencias después de la mutación.

La autorización solo cubre las rutas, acciones y estado observado listados. Si cambia un archivo, destino o diff relevante, queda invalidada y debe solicitarse de nuevo.

Cuando discovery o PRD requieran actualización, no invoques sus agentes primarios: emite `handoff_required` con `agent`, `path`, `feature_id`, `context`, campos o decisión a actualizar y evidencia. No declares cierre documental completo hasta que el usuario ejecute el handoff o acepte explícitamente la deuda. Specs y TDDs sí se delegan a `ms-spec` y `ms-designer` dentro de sus límites.

Toda delegación que dependa de artefactos incluye `artifact_inputs` con sus rutas ya resueltas para evitar nuevas búsquedas, omitiendo las claves no aplicables o usando `null` cuando no existan:

```yaml
artifact_inputs:
  feature_id: "<id-estable>"
  context: "global"
  prd: ".agents/docs/prd/<feature>.md"
  spec: null
  design: ".agents/docs/design/<feature>.md"
```
