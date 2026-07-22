# TDD: configuración administrada de Context7 para Codex

| Campo | Valor |
|---|---|
| Estado | Aprobado para implementación |
| Versión | 1.0 |
| Fecha de creación | 2026-07-20 |
| PRD | N/A — decisión técnica explícita |
| Spec | N/A — comportamiento cerrado en la entrada |

## 1. Decisión y objetivo

`ms-agent-kit` añadirá Context7 a `config.toml` de Codex mediante una estrategia opcional `managed-block`. El instalador será dueño solo de un bloque delimitado, no del archivo completo. Los bytes situados fuera del rango administrado, el modo del archivo y las defensas contra symlinks se conservarán.

La configuración deseada es:

```toml
[mcp_servers.context7]
url = "https://mcp.context7.com/mcp"
env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }
```

El artefacto contiene únicamente el nombre de la variable de entorno. Nunca lee, renderiza ni persiste el valor de `CONTEXT7_API_KEY`.

### Invariantes

- La ausencia de estrategia conserva el comportamiento actual de archivo completo.
- Un bloque exacto no provoca escritura; un bloque distinto es conflicto salvo que `--force` restaure solo ese bloque.
- Una tabla Context7 externa equivalente satisface el requisito sin modificación ni ownership.
- Una tabla Context7 externa no equivalente es un conflicto protegido incluso con `--force`.
- Toda mutación preserva byte a byte el contenido exterior al rango administrado.
- `status` evalúa el bloque administrado. El hash del archivo completo solo protege la carrera entre plan y aplicación.
- Desinstalar o retirar un artefacto nunca elimina contenido exterior ni una tabla externa satisfecha.
- Solo se admite un bloque de `ms-agent-kit` por destino en esta iteración.

## 2. No objetivos

- Implementar un parser TOML general, normalizar el archivo o reordenar tablas.
- Administrar varias regiones de un mismo archivo en una única instalación.
- Adoptar, reescribir o eliminar tablas Context7 creadas fuera de los marcadores.
- Gestionar el valor de la API key o comprobar conectividad con Context7.
- Cambiar el formato global de `state.json` o elevar `schemaVersion` por campos opcionales.

## 3. Entradas y trazabilidad

| Entrada cerrada | Materialización en el diseño |
|---|---|
| Estrategia opcional compatible con schema 1 | Campos opcionales en `Artifact`, `PlanItem` y `OwnedFile`; ausencia equivale a archivo completo |
| Marcadores deterministas y preservación exterior | Helper de bloque basado en `Buffer`, rango poseído explícito y separador registrado |
| Exacto/modificado/force | Matriz de planificación y reemplazo limitado al rango |
| Tabla externa satisfecha/conflictiva | Detector conservador específico para Context7, sin ownership en el caso satisfecho |
| Status y carrera | Hash de bloque para estado; `currentHash` global únicamente como precondición de aplicación |
| Uninstall/obsolete | Eliminación del rango intacto, `skip` si cambió y limpieza de estado si falta |
| Rollback | Snapshot inmediato, hash y modo exactos escritos; restauración protegida por compare-and-swap |
| Retirada de metadata previa | `codex.ts` deja de emitir `ms-architect/agents/openai.yaml`; el planner la trata como obsoleta |

## 4. Estado actual relevante

- `src/core/types.ts` modela todos los artefactos como archivos completos. `OwnedFile.afterHash` representa actualmente el hash global posterior a la instalación.
- `src/core/planner.ts:createPlan` compara `desiredHash`, `current.hash` y `previous.afterHash`; también planifica artefactos obsoletos.
- `src/core/installer.ts:applyPlan`, `uninstallTargets` e `installationStatus` escriben, retiran y evalúan archivos completos. `RollbackEntry` ya conserva el snapshot inmediato del archivo.
- `src/core/files.ts` aporta lectura binaria, escritura atómica, preservación de modo y rechazo de symlinks.
- `src/adapters/codex.ts:buildCodexArtifacts` no emite `.codex/config.toml`; declara Context7 mediante `CODEX_ARCHITECT_METADATA` en `ms-architect/agents/openai.yaml`.
- `tests/installer.test.ts` concentra la conducta transaccional y `tests/adapters.test.ts` valida los artefactos Codex.

## 5. Modelo y contratos

### 5.1 Tipos en `src/core/types.ts`

Se añade `ManagementStrategy = "managed-block"`. La estrategia de archivo completo continúa representada por la ausencia del campo, evitando modificar registros existentes.

`Artifact` incorpora campos opcionales:

- `strategy?: "managed-block"`.
- `blockId?: string`, obligatorio en runtime cuando la estrategia está presente.
- `satisfaction?: "codex-context7"`, selector del detector externo permitido para este artefacto.

`content` sigue siendo `Buffer`, pero con `managed-block` representa el cuerpo deseado situado entre marcadores, sin el separador exterior. `blockId` debe cumplir `[a-z0-9][a-z0-9._-]*`; el adapter usará `codex-context7`.

`PlanItem` incorpora campos opcionales para hacer autocontenida la decisión ya calculada:

- `strategy?: "managed-block"` y `blockId?: string`.
- `currentBlockHash?: string` y `desiredBlockHash?: string`.
- `leadingSeparator?: "" | "\n" | "\r\n"`, cuando se vaya a crear o adoptar ownership.
- `satisfiedExternally?: boolean`; solo es válido con `action: "unchanged"` y prohíbe crear estado.

`currentHash` mantiene su significado actual: snapshot global leído durante el plan. Para bloques no determina drift funcional; solo se comprueba justo antes de aplicar.

`OwnedFile` incorpora campos opcionales:

- `strategy?: "managed-block"` y `blockId?: string`.
- `blockHash?: string`, hash del rango administrado canónico, incluyendo marcadores y el separador poseído.
- `leadingSeparator?: "" | "\n" | "\r\n"`.
- `createdFile?: boolean`, distingue un destino creado por el kit de un archivo preexistente, incluido uno de cero bytes.

`afterHash` sigue siendo obligatorio por compatibilidad estructural. En nuevos registros `managed-block` se guarda como hash global informativo de la última escritura, pero no se usa para `status`, actualización, uninstall u obsolete. En registros sin `strategy`, conserva toda su semántica actual.

Las funciones que consuman estos tipos validarán la combinación: una estrategia presente sin `blockId`, hashes de bloque ausentes en ownership, o `satisfiedExternally` junto a una acción mutante son errores internos y abortan antes de escribir.

### 5.2 Nuevo helper `src/core/managed-block.ts`

El helper trabaja con `Buffer`; no convierte el archivo completo a texto ni normaliza finales de línea. Expone operaciones conceptuales para:

- renderizar los marcadores a partir de un `blockId` validado;
- localizar cero, uno o varios pares de marcadores y devolver offsets del rango;
- clasificar el par como completo, incompleto, duplicado o invertido;
- extraer y hashear el rango poseído;
- insertar, reemplazar o retirar el rango mediante concatenación de slices de `Buffer`;
- inspeccionar de forma conservadora una tabla externa Context7 fuera de cualquier bloque.

Los marcadores exactos son líneas de comentario TOML:

```text
# >>> ms-agent-kit managed-block:codex-context7 >>>
# <<< ms-agent-kit managed-block:codex-context7 <<<
```

El cuerpo canónico usa `\n` y termina en `\n` antes del marcador de cierre. Al insertar:

- archivo vacío: `leadingSeparator = ""`;
- archivo no vacío que ya termina en `\n`: `leadingSeparator = ""`;
- archivo no vacío que termina en `\r\n`: `leadingSeparator = ""` y el bloque conserva su serialización canónica independiente;
- archivo no vacío sin fin de línea: se antepone `\n` o `\r\n`, según el estilo detectable del archivo; en ausencia de señal se usa `\n`.

El separador añadido forma parte del rango poseído, se incluye en `blockHash` y se registra en estado. Al reemplazar o retirar, el helper incluye exactamente ese separador en el slice administrado. Así se recuperan los bytes preexistentes aunque el archivo originalmente no terminara en salto de línea. Si esos bytes poseídos cambian, el bloque se considera modificado.

Un marcador incompleto, invertido, duplicado, un segundo bloque administrado en el mismo destino o una tabla Context7 adicional produce conflicto. No se intenta reparar de forma implícita.

### 5.3 Reconocimiento acotado de tabla externa

El detector `codex-context7` solo inspecciona texto UTF-8 válido y líneas fuera de marcadores. Busca una única cabecera `[mcp_servers.context7]` y delimita su contenido hasta la siguiente cabecera TOML. Dentro de esa tabla acepta comentarios, espacios, orden distinto y claves adicionales, pero exige exactamente estos valores semánticos:

- `url` es el string `https://mcp.context7.com/mcp`;
- `env_http_headers` es una tabla inline que contiene el mapping string `CONTEXT7_API_KEY = CONTEXT7_API_KEY`.

La comprobación admite comillas TOML simples o dobles para strings sin escapes, pero no evalúa escapes, interpolaciones, tablas multilínea ni alias. Ante sintaxis ambigua, duplicados de las claves requeridas, una segunda tabla Context7 o un valor que no pueda demostrar equivalente, devuelve conflicto. Esta política favorece falsos conflictos seguros frente a sobrescribir configuración externa.

No se considera satisfecho un mapping que contenga el valor real de una clave. Ambos lados deben ser literalmente el nombre `CONTEXT7_API_KEY`.

## 6. Planificación

`src/core/planner.ts:createPlan` conserva la rama actual para artefactos sin estrategia y deriva los artefactos `managed-block` a una clasificación específica después de `assertNoSymlinkEscape` y `readExistingFile`.

Orden de decisión:

1. Validar definición del artefacto y seguridad del destino.
2. Leer una sola vez el archivo y conservar `current.hash` como guard de carrera.
3. Detectar marcadores del `blockId` y tablas Context7 externas.
4. Si existe un bloque inequívoco, compararlo con el rango canónico; una tabla externa adicional es conflicto.
5. Si no existe bloque, clasificar la tabla externa como ausente, satisfecha o conflictiva.
6. Emitir `PlanItem` con hashes de bloque y separador; no usar el hash global para decidir si el bloque cambió.

### Matriz de estados del plan

| Archivo / estado previo | Estado observado | Sin `--force` | Con `--force` | Ownership tras aplicar |
|---|---|---|---|---|
| Ausente, sin registro | Sin bloque ni tabla | `create` | `create` | Sí; `createdFile: true` |
| Existente, sin registro | Sin bloque ni tabla | `update` (inserción) | Igual | Sí; exterior intacto |
| Cualquiera, sin registro | Bloque exacto único | `unchanged` sin escritura | Igual | Sí; se registra el bloque existente |
| Cualquiera, sin registro | Bloque único distinto | `conflict` | `update` del bloque | Sí; exterior intacto |
| Cualquiera, con registro | Bloque exacto | `unchanged` | Igual | Se conserva |
| Cualquiera, con registro | Bloque modificado | `conflict` | `update` del bloque | Se actualiza hash del bloque |
| Cualquiera, con registro | Bloque ausente y sin tabla | `update` (reinserción) | Igual | Se conserva |
| Cualquiera, sin bloque | Tabla externa equivalente | `unchanged`, `satisfiedExternally` | Igual | No |
| Cualquiera, sin bloque | Tabla externa diferente o ambigua | `conflict` | `conflict` protegido | No |
| Cualquiera | Marcadores inválidos, múltiples bloques o bloque + tabla externa | `conflict` | `conflict` | Sin cambio |

Para un bloque exacto sin registro, `applyPlan` incrementa `unchanged` y crea ownership sin reescribir. Para el caso externo satisfecho, también incrementa `unchanged`, pero omite toda alta o actualización en `state.files`. La siguiente ejecución vuelve a evaluar la tabla externa; no se convierte en artefacto obsoleto ni participa en uninstall.

### Obsoletos

Al construir `plan.obsolete`, los registros sin estrategia conservan el flujo actual. Para `managed-block`:

- bloque intacto: acción `remove` significa retirar el rango, no el archivo completo;
- bloque modificado o marcadores ambiguos: `skip` y conservación del estado;
- bloque ausente: acción `remove` de reconciliación, sin mutación de archivo, para limpiar estado;
- ownership compartido: `detach` conserva la semántica actual antes de evaluar retirada física.

`currentHash` del obsoleto sigue siendo el guard global de carrera entre plan y aplicación.

## 7. Aplicación, status, uninstall y rollback

### Aplicación en `src/core/installer.ts`

Antes de cada acción se relee el destino. Si su hash global no coincide con `PlanItem.currentHash` —o si apareció un archivo cuando el plan observó ausencia— se aborta con “El destino cambió después del plan”. Esto protege cambios dentro o fuera del bloque ocurridos después del plan.

Para una mutación `managed-block`, `applyPlan`:

1. guarda en `RollbackEntry` el `ExistingFile | null` inmediatamente anterior;
2. recalcula y valida el rango esperado sobre ese snapshot;
3. compone el nuevo `Buffer` sustituyendo solo el rango o insertándolo;
4. usa `atomicWriteFile` con `current.mode ?? artifact.mode`;
5. registra hashes, separador y `createdFile` en `OwnedFile`.

No crea backup persistente del archivo completo para un bloque: el exterior no se adopta ni se posee. `OriginalFile` permanece por compatibilidad con el modelo de archivo completo. El rollback transaccional conserva en memoria el snapshot inmediato, el hash y el modo exactos escritos. Solo restaura archivo, modo y bytes completos si el destino todavía coincide con ambos; si una edición concurrente o un `chmod` lo hizo divergir, preserva el destino y reporta un error agregado de reversión.

### Status

`installationStatus` discrimina por estrategia:

- archivo ausente: `missing`;
- bloque único cuyo hash coincide con `OwnedFile.blockHash`: `ok`, aunque cambie cualquier byte exterior;
- bloque ausente: `missing`;
- bloque distinto, marcadores inválidos o múltiples: `modified`.

No hay entrada de status para una tabla externa satisfecha porque nunca se registra ownership.

### Uninstall y retirada obsoleta

`uninstallTargets` y la aplicación de obsoletos comparten la misma operación de retirada:

| Observación | Resultado |
|---|---|
| Bloque intacto | Retirar rango y separador poseído; preservar exterior |
| Bloque modificado o ambiguo | `skip`; conservar registro y archivo |
| Bloque ausente | No tocar archivo; limpiar registro |
| Archivo ausente | Limpiar registro |
| Resultado vacío y `createdFile: true` | Eliminar archivo mediante `removeManagedFile` |
| Resultado vacío y archivo preexistente | Conservar archivo vacío y su modo |
| Resultado no vacío | Reescribir atómicamente con el modo actual |

Cada retirada completada entra en `RollbackEntry` con su snapshot anterior y el hash y modo posteriores —o ausencia— que produjo. Si falla una operación o la escritura de estado, se restaura el snapshot completo inmediato únicamente cuando el destino sigue coincidiendo con ese resultado. Las tablas externas satisfechas no aparecen en estado y, por tanto, nunca se retiran.

## 8. Adapter Codex y migración

En `src/adapters/codex.ts:buildCodexArtifacts`:

- añadir un artefacto `configuration` llamado `context7` con destino `path.join(roots.codex, "config.toml")` para scope user y project;
- establecer `strategy: "managed-block"`, `blockId: "codex-context7"` y `satisfaction: "codex-context7"`;
- usar exactamente el cuerpo TOML definido en este documento, sin leer variables de entorno;
- eliminar `CODEX_ARCHITECT_METADATA` y dejar de emitir `ms-architect/agents/openai.yaml`.

La transición no aumenta `schemaVersion`:

- estados schema 1 antiguos, sin campos nuevos, continúan como ownership de archivo completo;
- el nuevo lector acepta los campos opcionales y valida sus combinaciones al usarlos;
- una instalación previa tendrá `openai.yaml` en estado pero ya no en artefactos deseados, por lo que el flujo existente de obsolete lo elimina/restaura si está intacto y hace `skip` si fue modificado;
- no se migra ownership desde `openai.yaml` a `config.toml`: son artefactos distintos y el plan muestra ambas operaciones;
- una configuración Context7 externa satisfecha permanece externa y no genera registro nuevo.

La compatibilidad del CLI y de los JSON de plan/status se mantiene: no cambian acciones ni estados públicos; solo aparecen campos opcionales en planes internos. Los recuentos de artefactos Codex y las aserciones que esperaban `openai.yaml` deben actualizarse.

## 9. Seguridad, fallos y observabilidad

- Se ejecutan `assertNoSymlinkEscape` y `readExistingFile` antes de inspeccionar o mutar; un symlink o archivo no regular es conflicto.
- La escritura sigue siendo atómica y conserva el modo observado. Crear `config.toml` usa el modo declarado por `textArtifact` (`0o644`).
- Un archivo que deje de ser seguro entre plan y aplicación aborta, sin intentar seguir el enlace.
- Los mensajes de plan distinguen: bloque exacto, bloque modificado, tabla externa satisfecha, tabla externa protegida, marcadores ambiguos y carrera global.
- `--force` solo autoriza reemplazar un bloque inequívoco. No autoriza tablas externas conflictivas, marcadores ambiguos, symlinks ni carreras.
- Ningún log, plan, estado o backup contiene el valor de `CONTEXT7_API_KEY`; solo el nombre de la variable.

## 10. Estrategia de verificación

### Tests de unidad del helper

Crear `tests/managed-block.test.ts` para cubrir offsets y preservación byte a byte:

- render determinista y rechazo de `blockId` inválido;
- inserción en archivo vacío, con LF, CRLF y sin newline final;
- reemplazo y retirada sin alterar prefix/suffix;
- bloque exacto, modificado, ausente, incompleto, invertido y duplicado;
- detector externo satisfecho con espacios, comentarios, orden y claves adicionales;
- detector externo conflictivo por URL, mapping, duplicados, sintaxis ambigua o valor secreto literal.

### Tests del planner/installer

Extender `tests/installer.test.ts` con fixtures pequeños `managed-block`:

- archivo ausente y archivo existente;
- cambios fuera del bloque mantienen `status: ok` y sobreviven a update/uninstall;
- cambios dentro del bloque producen `modified`/`conflict`;
- tabla externa satisfecha no escribe ni crea estado; tabla externa distinta bloquea también con force;
- force restaura solo el bloque y conserva exterior;
- dos ejecuciones consecutivas son idempotentes;
- cambio exterior y cambio interior entre plan y apply disparan el guard de carrera;
- fallo posterior revierte al snapshot inmediato, incluidos bytes y modo, salvo que una edición concurrente posterior deba preservarse por compare-and-swap;
- uninstall y obsolete cubren bloque intacto, modificado, ausente, archivo creado vacío y archivo preexistente vacío;
- symlink de archivo o directorio se rechaza y el modo de un archivo regular se conserva.

### Tests del adapter y migración

Actualizar `tests/adapters.test.ts` y añadir casos de integración en `tests/installer.test.ts`:

- Codex emite `config.toml` con `managed-block`, URL y mapping exactos para scopes user/project;
- el artefacto no contiene una API key materializada;
- ya no se emite `ms-architect/agents/openai.yaml` y se ajustan los recuentos;
- un registro legacy intacto de `openai.yaml` se retira como obsolete;
- metadata legacy modificada se conserva con `skip`; metadata legacy ausente limpia estado;
- actualización que retira metadata e inserta Context7 revierte ambos destinos si una operación posterior falla.

### Comandos de aceptación

```text
pnpm test
pnpm check
pnpm build
```

Además de los tests, la revisión debe buscar `CONTEXT7_API_KEY` en artefactos y snapshots para confirmar que solo aparece como nombre de variable, y comprobar que no quede ninguna emisión de `CODEX_ARCHITECT_METADATA`.

## 11. Rollout y rollback

El rollout ocurre en la siguiente ejecución normal de `plan`/`install` para Codex. El plan debe mostrar por separado la inserción o satisfacción de `config.toml` y la retirada de `openai.yaml`. No se requiere migración previa ni flag nuevo.

Rollback de una instalación fallida es automático y restaura los snapshots inmediatos cuando cada destino aún coincide con el hash y el modo que escribió la transacción. Una edición concurrente o un `chmod` se conserva y hace que la reversión reporte un error de reconciliación. Revertir la release después de una instalación exitosa vuelve a emitir la metadata legacy según el código revertido; el registro `managed-block` seguirá siendo schema 1 válido para la versión nueva, pero una versión anterior no conoce su estrategia. Por ello, el rollback operativo soportado es ejecutar `uninstall --target codex` con la versión nueva antes de volver al binario anterior. Esta limitación debe constar en las notas de release.

## 12. Unidades de trabajo

### Unidad 1 — Foundation `managed-block` y tests

**Alcance:**

- ampliar los tipos opcionales en `src/core/types.ts` y validarlos;
- crear `src/core/managed-block.ts`;
- integrar planificación, apply, status, uninstall, obsolete y rollback en `src/core/planner.ts` y `src/core/installer.ts`;
- conservar sin cambios el camino de archivo completo;
- añadir `tests/managed-block.test.ts` y casos focales en `tests/installer.test.ts`.

**Definition of Done:**

- la matriz genérica de bloques está cubierta, incluidos force, carrera, rollback, symlink, modo y preservación binaria exterior;
- estados schema 1 sin campos nuevos pasan los tests existentes;
- `pnpm test`, `pnpm check` y `pnpm build` pasan.

**Dependencias:** ninguna; debe completarse antes de la Unidad 2.

### Unidad 2 — Adapter Codex, migración, docs y tests

**Alcance:**

- emitir el bloque Context7 en `.codex/config.toml` desde `src/adapters/codex.ts`;
- retirar la emisión de `ms-architect/agents/openai.yaml`;
- actualizar `tests/adapters.test.ts` y completar escenarios Context7/metadata legacy en `tests/installer.test.ts`;
- actualizar `README.md` para explicar la configuración compartida, la referencia por variable de entorno, conflictos protegidos, uninstall y el rollback operativo.

**Definition of Done:**

- scopes user/project producen el destino correcto y nunca materializan el secreto;
- tabla externa satisfecha/conflictiva y metadata legacy están cubiertas de extremo a extremo;
- los recuentos y expectativas Codex reflejan el nuevo artefacto y la metadata retirada;
- documentación y suite completa concuerdan con los invariantes;
- `pnpm test`, `pnpm check` y `pnpm build` pasan.

**Dependencias:** Unidad 1.

## 13. Riesgos, asunciones y preguntas

| Tipo | Elemento | Mitigación / estado |
|---|---|---|
| Riesgo medio | El detector TOML acotado puede rechazar una tabla semánticamente válida pero compleja | Fallar de forma protegida y explicar el conflicto; parser TOML completo queda fuera de alcance |
| Riesgo medio | Una versión anterior interpreta un registro nuevo como archivo completo | Rollback operativo documentado: uninstall con versión nueva antes de downgrade |
| Riesgo bajo | Ediciones entre plan y apply generan conflictos aunque sean exteriores | Intencional: el hash global es guard de carrera y obliga a recalcular el plan |
| Asunción | Codex acepta la URL y `env_http_headers` indicados bajo `[mcp_servers.context7]` | Decisión cerrada de entrada; cubrir serialización exacta en test |
| Asunción | Solo un bloque por destino basta para esta iteración | Validar y rechazar un segundo bloque |

No hay preguntas abiertas bloqueantes.

## 14. Bitácora de cambios

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 2026-07-20 | Diseño inicial de ownership por bloque, integración Codex y retirada de metadata legacy |
