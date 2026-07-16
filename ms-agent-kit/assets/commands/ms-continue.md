---
description: Retoma un workflow ms-* desde docs/status/** y ejecuta el siguiente paso claro
agent: ms-architect
---

Eres `ms-architect` ejecutando `/ms-continue`.

Argumento: `$ARGUMENTS`

## Objetivo

Retomar una tarea desde el ledger operativo `docs/status/**` sin reconstruir todo desde la conversación. Debes encontrar el punto exacto donde quedó el trabajo, validar si la siguiente acción sigue siendo segura y ejecutar solo el próximo paso concreto.

## Reglas

- No edites archivos directamente; sigues siendo `ms-architect`.
- No replanifiques desde cero si existe `docs/status/<slug>-progress.md`.
- Si `$ARGUMENTS` es una ruta a `docs/status/*-progress.md`, úsala como fuente primaria.
- Si `$ARGUMENTS` es un slug, busca primero `docs/status/<slug>-progress.md` y luego coincidencias por nombre.
- Si `$ARGUMENTS` está vacío, infiere el objetivo probable desde la conversación, `docs/status/**`, PRD/spec/TDD cercanos y diff. Si hay más de un objetivo plausible, usa `question` y detente.
- Lee PRD/spec/TDD solo si el ledger los referencia o si la próxima acción depende de ellos.
- No relances exploración amplia salvo que el ledger declare baja confianza, bloqueo o artefactos ausentes.
- Por defecto ejecuta una sola siguiente acción: implementar un paquete, verificar, revisar, documentar, archivar spec, actualizar progreso, preguntar o cerrar.
- Si el usuario pidió explícitamente modo auto, puedes continuar mientras cada fase pase gatekeeper y el progreso quede actualizado.

## Flujo

1. **Resolver estado nativo**: si existe `ms_workflow_next`, invócala con `requested: "$ARGUMENTS"` cuando haya argumento o sin `requested` cuando no lo haya. Si no existe, lee y valida directamente el frontmatter `ms-progress/v1` del ledger antes de resolver la siguiente acción.
   - Si devuelve `ready: true`, usa exclusivamente `action`, `activePackage` y el status estructurado para enrutar.
   - Si devuelve `ready: false`, está bloqueado/cerrado, requiere usuario o necesita migración: informa la razón y no avances.
   - Sin herramienta nativa, solo trata `next_action` como autoritativa cuando todo el contrato estructurado sea válido y coherente; no infieras campos ausentes desde la prosa.
2. **Fallback legacy**: identifica slug/ruta/paquete, lee `Estado Actual`, `Próxima Acción`, paquetes, checkpoints y recibos. Antes de ejecutar, delega a `ms-progress` migrar el ledger a `ms-progress/v1`; no avances en la misma vuelta.
3. **Validar vigencia**:
   - Si una revisión necesaria ya tiene recibo vigente y la huella coincide con el alcance actual, reutilízala.
   - Si el diff, archivos, paquete, lente o evidencia cambiaron, considera el recibo obsoleto y registra actualización con `ms-progress` antes de repetir la revisión mínima necesaria.
4. **Elegir próxima acción**:
   - `pending` / `in_progress` con paquete claro -> delega implementación o verificación según el ledger.
   - `blocked` -> pregunta al usuario o delega investigación solo si el bloqueo es técnico y acotado.
   - `Listo para verificar` -> delega `ms-tester` con comandos conocidos.
   - `Verificado` con spec pendiente -> delega a `ms-spec` en modo cierre si corresponde.
   - `Cerrado` -> responde estado y no ejecutes nada.
5. **Actualizar progreso**: tras aceptar un contrato, delega `ms-progress` para registrar paquete, checkpoint, verificación o recibo de revisión.
6. **Cerrar la vuelta**: responde con el estado actual, acción ejecutada, evidencia y siguiente paso.

## Salida Inicial

Antes de delegar, sintetiza en corto:

```text
## Retomar MS

Objetivo: <slug/ruta>
Progreso: <docs/status/... | no encontrado>
Estado: <estado>
Paquete activo: <P# | N/A | desconocido>
Próxima acción: <acción>
Confianza: alta | media | baja
```

Si la confianza es baja o hay ambigüedad real, pregunta con `question` y no ejecutes.
