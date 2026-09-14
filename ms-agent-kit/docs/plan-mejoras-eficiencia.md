# Plan de mejoras de eficiencia

Estado: Implementado y verificado; evaluación de eficacia con LLM pendiente. Fecha: 2026-09-02.

Objetivo: usar `ms-agent-kit` en distintos proyectos con menos exploración repetida, instrucciones más pequeñas y conocimiento técnico accesible desde OpenCode, Claude Code y Codex.

Este plan conserva prioridades y mitigaciones de la revisión, e identifica debajo su estado de implementación y aceptación. Combina inspiración documental de gentle-ai, hallazgos del código del kit y propuestas propias; no acredita que gentle-ai implemente estas mismas soluciones. Las pruebas automáticas verifican contratos y seguridad, no ahorro real de tiempo o tokens.

## Prioridades

| Nivel | Significado |
|---|---|
| P1 — Alta | Primera iteración: corrige fricción habitual o permite comprobar la mejora. |
| P2 — Media | Siguiente iteración: mejora flexibilidad y compatibilidad operativa. |
| P3 — Opcional | Incorporar cuando exista una necesidad frecuente y observable. |

No se identificó un bloqueo crítico que requiera P0. El esfuerzo es relativo: bajo significa un cambio acotado; medio implica coordinar configuración, adaptadores o pruebas. No representa una estimación de días.

## Vista de decisión

| ID | Prioridad | Hallazgo e impacto | Mitigación mínima | Esfuerzo |
|---|---|---|---|---|
| EF-01 | P1 | El contexto inicial no tiene persistencia definida; otra sesión puede repetir la exploración. | Guardar y reutilizar un contexto pequeño por proyecto, con fuentes e invalidación. | Medio |
| EF-02 | P1 | Las convenciones globales pueden chocar con el repositorio, especialmente el idioma documental. | Permitir preferencias explícitas por proyecto y conservar sus convenciones por defecto. | Bajo |
| EF-03 | P1 | Los ejecutores y el tester no pueden cargar skills técnicas. | Permitir una selección de skills pertinentes por rol o misión. | Medio |
| EF-04 | P1 | El arquitecto carga mucho detalle documental incluso para tareas simples. | Extraer procedimientos avanzados a referencias bajo demanda. | Bajo |
| EF-05 | P2 | El recorrido habitual requiere delegación y fastlane usa límites rígidos de tamaño. | Facilitar ejecución directa acotada y evaluar admisión por claridad y riesgo. | Medio |
| EF-06 | P2 | La selección de modelos es poco configurable y difiere entre clientes. | Exponer overrides independientes por agente y mostrar el resultado por cliente. | Medio |
| EF-07 | P2 | Un catálogo instalado no garantiza que el cliente pueda usar las capacidades esperadas. | Ampliar `doctor` con comprobaciones de disponibilidad y compatibilidad. | Medio |
| EF-08 | P1 | Las pruebas actuales no miden eficiencia real de los agentes. | Crear una evaluación pequeña y repetible antes de comparar cambios. | Medio |
| EF-09 | P3 | Cambiar de cliente puede perder objetivo, decisiones y siguiente acción. | Generar una nota de traspaso explícita y breve. | Bajo |

## Mitigación y comprobación por punto

### Estado de implementación y aceptación

| ID | Estado del cambio | Evidencia disponible | Aceptación pendiente |
|---|---|---|---|
| EF-01 | Implementado | `project init/inspect`, detector Node/Python, persistencia e invalidación; [tests de contexto](../tests/project-context.test.ts). | Reutilización correcta en sesiones nuevas de los tres clientes. |
| EF-02 | Implementado | Preferencias de idioma y rutas de writer; [tests de modelos y preferencias](../tests/model-config.test.ts). | Diffs documentales acotados con idiomas y proyectos distintos. |
| EF-03 | Implementado | Skills técnicas seleccionadas y límites por rol; [tests de adaptadores](../tests/adapters.test.ts). | Que ejecutor y tester consulten solo las skills pertinentes en tareas reales. |
| EF-04 | Implementado | Lifecycle extraído y referencias instalables; [pruebas de política](../tests/architect-policy.test.ts) y [medición de fuentes](../assets/evaluations/README.md). | Carga bajo demanda observada con LLM, sin pérdida de reglas aplicables. |
| EF-05 | Implementado | Entradas fastlane en tres clientes, admisión por riesgo y hooks preservados. | Comparar cambios mecánicos y casos sensibles con agentes reales. |
| EF-06 | Implementado | YAML personal validado, resolución aislada y render nativo; [tests de modelos](../tests/model-config.test.ts). | Disponibilidad de los modelos elegidos en cada cuenta; no se infiere del render. |
| EF-07 | Implementado | Diagnóstico de capacidades con evidencia y estados diferenciados; [tests de diagnóstico](../tests/runtime-diagnostics.test.ts). | Comprobaciones del entorno concreto del usuario. |
| EF-08 | Infraestructura implementada | [Cinco tareas y plantilla](../assets/evaluations/README.md), fixtures y medida estructural. | Línea base LLM y comparación posterior repetida; ninguna mejora porcentual acreditada. |
| EF-09 | Implementado | Comando `ms-handoff`, nota conversacional y persistencia explícita desde el padre. | Traspaso real entre clientes y detección de evidencia obsoleta. |

El gate integrado del cambio completo terminó correctamente: 274/274 tests en 16 archivos, TypeScript, build y comprobación del paquete. La auditoría general y la revisión del delta de locks cerraron sin hallazgos abiertos. Esta evidencia no equivale a aceptación conductual con LLM. Los contratos de uso están en el [README](../README.md).

### EF-01 — Contexto persistente por proyecto

**Mitigación implementada.** `ms-project-init` consulta `.agents/project.yaml`; `project init` lo crea o actualiza y `project inspect` compara fuentes. Guarda módulos, comandos con directorio y procedencia, preferencias y hashes. Las reglas compartidas conectan esa lectura con los tres clientes, conservando los archivos humanos existentes.

**Límite.** Guardar hechos estables y sus fuentes. Separar este contexto del progreso de una tarea. Revisar las entradas afectadas cuando cambien manifests, scripts o estructura; no regenerar todo en cada inicio.

**Comprobación.** En dos proyectos de stacks distintos, una sesión nueva de cada cliente identifica los comandos y directorios correctos desde el contexto guardado. Al modificar un script, detecta que esa entrada necesita revisión.

### EF-02 — Convenciones propias del repositorio

**Mitigación implementada.** `preferences.documentation` define idioma y directorios relativos explícitos. `inherit` conserva el idioma del documento; español es el fallback cuando falta convención. La instalación de proyecto amplía únicamente los destinos de `ms-writer`. OpenCode y Claude usan globs Markdown; Codex concede el directorio y restringe Markdown mediante instrucciones, limitación nativa declarada.

**Límite.** Las instrucciones vigentes del usuario prevalecen. Evitar traducciones completas o reorganizaciones documentales como efecto secundario de un cambio puntual.

**Comprobación.** Una edición pequeña en un README inglés conserva el idioma y limita el diff al objetivo; otro proyecto configurado en español produce documentación en español. Las rutas configuradas funcionan en los tres adaptadores.

### EF-03 — Skills técnicas disponibles para los ejecutores

**Mitigación implementada.** `ms-codex`, `ms-fastlane` y `ms-tester` pueden usar skills técnicas seleccionadas en la tarea, `skill_inputs` o `preferences.technicalSkills`. Se mantiene el catálogo nativo; no se instala un catálogo técnico adicional ni dependencias del proyecto.

**Límite.** Una skill no amplía los permisos del rol. El tester sigue sin modificar código y los workers siguen sin coordinar agentes. Los protocolos de orquestación permanecen fuera de su selección técnica.

**Comprobación.** El ejecutor aplica una convención definida únicamente en una skill del proyecto; el tester usa una skill de verificación. Ambos mantienen sus límites de rol y evitan cargar skills ajenas a la tarea.

### EF-04 — Instrucciones avanzadas bajo demanda

**Mitigación implementada.** `ms-artifact-lifecycle` concentra retención, promoción, archivo y mantenimiento. El arquitecto conserva resolución de artefactos, disparadores, evidencia y autorización; la referencia se consulta bajo demanda.

**Límite.** Conservar resolución de artefactos, evidencia y autorizaciones aplicables. Asegurar que las referencias se instalan y resuelven correctamente en los tres clientes.

**Comprobación.** Una tarea simple usa un prompt menor y no carga el procedimiento documental; una tarea que modifica artefactos sí lo consulta. Medir el texto cargado y comprobar comportamiento, además de actualizar los tests de contenido.

### EF-05 — Recorrido cotidiano con menos coordinación

**Mitigación implementada.** `ms-fastlane` tiene entrada directa en los tres clientes; mantiene exclusiones por riesgo y usa tres archivos/120 líneas como señales orientativas. Claude conserva el fork y los hooks del rol; Codex ejecuta la skill en la tarea principal con su modelo activo.

**Límite.** Adaptar permisos e invocación por cliente; no basta con cambiar el prompt. Si aparecen decisiones de producto, contratos o riesgos fuera del alcance, devolver el control para resolverlos.

**Comprobación.** Un cambio mecánico en cuatro archivos puede completarse con verificación focal sin una delegación adicional por tamaño. Un cambio pequeño de autorización sigue requiriendo el recorrido correspondiente a su riesgo.

### EF-06 — Modelos configurables por agente

**Mitigación implementada.** `~/.ms-agent-kit/config.yaml` permite overrides independientes de modelo y esfuerzo por agente y cliente mediante `models[agente][cliente]`. El plan muestra modelo, esfuerzo y procedencia por cliente y agente; conserva defaults y no modifica el modelo activo de las skills principales de Codex.

**Límite.** No introducir selección automática entre proveedores. Cuando no pueda comprobarse la disponibilidad de un modelo, reportarla como no verificada; no sustituirlo silenciosamente. No guardar credenciales.

**Comprobación.** Cambiar un override modifica únicamente el agente y cliente indicados. Los modelos heredados quedan identificados como tales y las restricciones de cada cliente aparecen en el resultado.

### EF-07 — Diagnóstico de capacidades utilizables

**Mitigación implementada.** `doctor` añade `capabilities` con estado, evidencia y acción sugerida. Comprueba binarios y versiones mediante probes acotadas fuera del repositorio, integridad instalada y contexto de proyecto; contrasta comandos con políticas estáticas disponibles. Declara límites de reconocimiento, Context7 y modelos remotos sin ejecutar scripts del proyecto.

**Límite.** Usar diagnósticos nativos de lectura cuando existan. Distinguir `correcto`, `no disponible`, `incompatible` y `no comprobado`; reservar llamadas a modelos o servicios para verificaciones explícitas.

**Comprobación.** Los casos de cliente ausente, skill no reconocida o herramienta documental no configurada producen mensajes concretos y una acción sugerida. Los casos no comprobables no se presentan como correctos.

### EF-08 — Evaluación de eficiencia y calidad

**Mitigación implementada.** `assets/evaluations` incluye las cinco tareas, fixtures, verificadores, una plantilla de observaciones y medición de fuentes. Registra resultado, tiempo, llamadas, reintentos, preguntas innecesarias y tokens observados; las ejecuciones LLM permanecen manuales y pendientes.

**Límite.** Comparar el mismo cliente, modelo, estado del repositorio y tarea. Repetir los casos antes de atribuir una diferencia al kit y separar las pruebas de arranque de las de reutilización de contexto. Menos tokens no compensa un resultado incorrecto.

**Comprobación pendiente.** Obtener una línea base de ejecuciones LLM y una comparación posterior con evidencia del resultado. La referencia estructural previa de tamaño no equivale a esa línea base. No se fijan porcentajes de ahorro hasta contar con mediciones reales.

### EF-09 — Traspaso sencillo entre clientes

**Mitigación implementada.** `ms-handoff` genera en la conversación una nota con objetivo, decisiones, archivos, verificaciones, Git observado y siguiente acción. Solo una ruta explícita autoriza persistirla mediante `ms-codex`, sin sobrescribir archivos ni seguir symlinks. En un fork Claude, la nota y el destino vuelven al padre para esa delegación.

**Límite.** Mantenerlo independiente de un gestor de sesiones. La nota no acredita por sí sola un PASS vigente: el cliente receptor contrasta el estado actual antes de reutilizar evidencia. Separar notas de trabajos distintos.

**Comprobación.** Otro cliente retoma una tarea desde la nota y el repositorio, identifica lo pendiente y detecta cambios posteriores que invalidan una verificación anterior.

## Orden de ejecución de referencia

| Fase | Cambios | Resultado para revisar |
|---|---|---|
| 0. Medición inicial | EF-08: tareas y registro de línea base. | Evidencia comparable del comportamiento actual. |
| 1. Ajustes acotados | EF-02 y EF-04. | Diffs documentales pertinentes y menor prompt obligatorio. |
| 2. Reutilización entre proyectos | EF-01 y EF-03; incorporar las preferencias de EF-02 al contexto. | Contexto persistente y skills técnicas utilizables en los tres clientes. |
| 3. Compatibilidad y flexibilidad | EF-07 y EF-06; después EF-05. | Diagnóstico útil, modelos configurables y recorrido directo verificado. |
| 4. Continuidad opcional | EF-09, si alternar clientes lo justifica. | Traspaso de trabajo sin reconstruir un gestor de sesiones. |

Repetir únicamente las evaluaciones afectadas después de cada fase. Si una mitigación aumenta errores, reintentos o trabajo del usuario, ajustarla antes de extenderla.

## Evidencia de partida

La revisión previa del 2026-09-02 informó TypeScript correcto y 189 tests aprobados. Estos resultados corresponden al código anterior al plan; no describen el gate integrado actual ni acreditan mejoras de eficiencia.

El primer gate de integración posterior obtuvo 265 tests PASS y un fallo en la recuperación concurrente de un lock abandonado, en código preexistente del instalador. Se corrigió la carrera mediante `operation.lock.recovery` y una regresión determinista que comprueba que un lector atrasado no borre el lock del nuevo dueño. El gate final posterior aprobó los 274 tests.

- Contexto inicial: [ms-project-init](../assets/skills/ms-project-init/SKILL.md).
- Convenciones e idioma: [reglas compartidas](../assets/docs/agents-shared.md).
- Acceso a skills y rutas de escritura: [perfiles de capacidades](../src/core/profiles.ts).
- Peso del proceso y ejecución: [ms-architect](../assets/agents/ms-architect.md) y [ms-fastlane](../assets/agents/ms-fastlane.md). Antes de la extracción, la sección documental ocupaba aproximadamente el 50 % del texto fuente del arquitecto; no es una medición de tokens consumidos.
- Selección de modelos: [resolución de modelos por agente](../src/core/agent-models.ts).
- Diagnóstico y compatibilidad: [CLI](../src/cli.ts) y [adaptadores](../src/adapters/).
- Cobertura actual: [pruebas de política](../tests/architect-policy.test.ts) y [pruebas de adaptadores](../tests/adapters.test.ts), que también preservan la retirada del antiguo CLI de sesiones.

## Evidencia estructural de EF-08

Mediciones antes/después recibidas del tester para el mismo ámbito `project`, sin overrides y con raíces ficticias equivalentes. Corresponden al archivo fuente de `ms-architect` y a su artefacto generado por cada adaptador:

| Artefacto del arquitecto | Bytes antes | Bytes después | Palabras antes | Palabras después |
|---|---:|---:|---:|---:|
| Fuente | 13153 | 8126 | 1868 | 1143 |
| OpenCode generado | 24038 | 21714 | 3153 | 2782 |
| Claude generado | 14373 | 9346 | 2030 | 1305 |
| Codex generado | 19007 | 16527 | 2711 | 2322 |

Las palabras se contaron con `trim().split(/\s+/u).length`; no son tokens. Claude carga `ms-shared` por separado, por lo que su fila no incluye todas las instrucciones compartidas. Estas filas tampoco representan el inventario completo del kit ni permiten inferir una reducción del contexto total, coste o tiempo de ejecución. La infraestructura de cinco evaluaciones está lista; la línea base y comparación de ejecuciones LLM reales siguen pendientes.

## Cierre de implementación

Evidencia final recibida de `ms-tester`: 274/274 tests PASS en 16 archivos y 5,05 segundos; TypeScript PASS vigente; build PASS; `package:check` PASS con 81 archivos y 139035 bytes. La auditoría general y la del delta de recuperación de locks terminaron sin hallazgos abiertos. Se conserva pendiente únicamente la aceptación con clientes/modelos reales indicada por cada punto, sin afirmar ahorros no medidos.
