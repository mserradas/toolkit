# Auditoría multicliente

> Estado: Implementado
> Feature ID: auditoria-multicliente
> Contexto: global
> Versión: 4
> Fecha de creación: 2026-09-11
> Última revisión: 2026-09-11
> Retención: Temporal
> Revisar cuando: existan mediciones reales de tareas multicliente o se apruebe la disposición de esta referencia
> Ámbito afectado: contratos de agentes, diagnóstico estático, adaptadores OpenCode/Codex/Claude y evaluación
> Implementado en: [política de verificación](../../../src/core/verification-policy.ts), [README](../../../README.md) y [guía de agentes](../../../assets/docs/agents.md)

## Alcance y fuentes vigentes

La auditoría inicial y el balance de permisos están implementados y aceptados. PRD: N/A. Spec: N/A. Esta referencia conserva razones y límites; queda fuera de carga automática.

El comportamiento de consumo está promovido al [README](../../../README.md) y a la [guía de agentes](../../../assets/docs/agents.md). El [contrato compartido](../../../assets/docs/agents-shared.md) mantiene el formato normativo; no se replica aquí.

## Decisiones conservadas

### Balance y autorizaciones por proyecto

`balanced` y `trusted` admiten los comandos rutinarios y runners locales acotados del balance; `strict` conserva su comportamiento. Los helpers preservan las denegaciones de secretos, operaciones destructivas y composición. No se concede `node*`, Compose general, red indiscriminada ni acceso a producción; las excepciones no habilitan comandos mutantes del tester.

La [política de verificación](../../../src/core/verification-policy.ts) consume `verification.projects[]` opcional de la configuración personal `~/.ms-agent-kit/config.yaml`. Cada entrada declara raíz absoluta, comandos exactos y directorios convencionales de salida. Esta configuración es una fuente de confianza del usuario; `project.yaml` permanece como datos sin autorización.

Las autorizaciones requieren coincidencia de raíz normalizada y `scope: project`. No se propagan a proyectos vecinos ni se absorben en instalaciones `scope: user`. La configuración anterior sin el campo conserva su comportamiento. Los guards comprueban el directorio de trabajo y los enlaces simbólicos para evitar aplicar una autorización fuera de su contexto.

Las salidas se limitan a directorios convencionales admitidos, incluida la caché `node_modules/.vite`, sin habilitar su raíz de código. Se rechazan escapes y rutas sensibles; Codex materializa únicamente directorios de salida, no archivos ni permisos de autoría. El tester no recibe herramientas `Edit`/`Write` por autorizar artefactos de verificación.

Los comandos exactos y sus recetas, configuración Compose y efectos requieren revisión al cambiar sus fuentes. La coincidencia textual no acredita vigencia. Las reglas de OpenCode y el guard de Claude no certifican aislamiento por sandbox ni todos los efectos de un proceso; los límites nativos permanecen explícitos.

El [preflight](../../../src/core/command-preflight.ts) separa decisión estática (`allow | ask | deny | unknown`) de evidencia sobre efectos y runtime sin ejecutar operaciones. Reconoce inspección cerrada. `unknown` no es aprobación ni bloqueo automático: el padre resuelve lo pendiente con la autorización existente y las capacidades del cliente.

Diseñador y spec conservan solo `git status --short` y consultas `git diff --stat` o `git diff --name-only` dentro de sus rutas. Patch y `--check` siguen excluidos por exposición de contenido sensible. Una denegación conserva su causa; cambiar sintaxis, intérprete o rol no la convierte en autorización.

### Semántica común y mecanismos del cliente

El [validador compartido](../../../src/core/result-contract.ts) separa el estado de la misión del resultado de sus comprobaciones. Un diagnóstico puede completar su misión al demostrar un fallo; un gate obligatorio fallido impide aceptar la entrega como `completed`.

La CLI y el guard de Claude comparten la semántica. En los otros clientes la aceptación corresponde al padre; no se presume enforcement nativo equivalente. Validar coherencia del contrato no acredita por sí solo la verdad de sus referencias.

La evidencia textual se conserva y las verificaciones estructuradas son aditivas. La vigencia contempla código, configuración, dependencias, entorno y archivos sin seguimiento: un commit aislado no representa todo el estado que produjo un resultado.

### Observación y presupuesto

El [diagnóstico de modelos](../../../src/core/model-diagnostics.ts) distingue declarado, instalado y efectivo usando un snapshot único. Esto evita combinar observaciones incompatibles; un valor no observable permanece sin comprobar. El arquitecto Codex hereda la tarea principal y se conserva la precedencia de overrides personales.

Los modelos permanecen iguales. El experimento de presupuesto usa 32 para `ms-codex` en OpenCode y conserva 20 en Claude y Codex. Las unidades `steps`, `maxTurns` y presupuesto por instrucción no son equivalentes; cualquier conclusión de rendimiento requiere medición por cliente.

### Coordinación y evaluación

La propiedad única por gate y la continuidad mediante deltas reducen trabajo repetido solo cuando la evidencia sigue vigente. El cierre documental se agrupa por propietario para conservar los límites de escritura; la guía vigente contiene los detalles operativos.

Las métricas nuevas de [evaluación](../../../assets/evaluations/README.md) son opcionales para mantener registros anteriores legibles. `null` identifica ausencia de observación; convertirla en cero sesgaría las comparaciones de bloqueos, duplicaciones y retrabajo.

## Evidencia y límites del cierre

La aceptación del balance incluye pruebas de comportamiento, comprobación de tipos, build, validación del paquete y revisión de seguridad. Los hallazgos sobre comandos mutantes del tester y normalización en el guard fueron corregidos y cerrados tras una nueva revisión. Este documento no conserva logs ni conteos por corrida.

No se ha medido una mejora de rendimiento con tareas reales multicliente. La instalación en scope user es una operación separada; este cierre no afirma que las sesiones activas hayan cargado los cambios. MCP PostgreSQL y publicación permanecen fuera del alcance.

## Disposición

La retención temporal conserva las razones y límites pendientes de medición real o disposición. Las guías de consumo ya contienen el comportamiento vigente; el TDD es candidato a eliminación cuando deje de aportar valor único. No existe necesidad de retención histórica declarada y esta actualización no mueve ni elimina archivos.
