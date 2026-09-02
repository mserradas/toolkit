# Evaluación pequeña de agentes

Cinco tareas manuales para comparar calidad y coste observado del kit. Solo necesitan Node 22 o posterior; no requieren dependencias, red ni una instalación del kit para verificar el fixture. Estos archivos se incluyen en el paquete publicado dentro de `assets/evaluations` y funcionan igual desde un checkout.

**No existe todavía una línea base de eficacia real.** Los scripts no inician modelos, no crean observaciones y no calculan tokens a partir de caracteres. Los tests del fixture prueban criterios del ejercicio; no prueban que un agente los haya resuelto.

## Ejecutar un caso

1. Desde el directorio `assets/evaluations`, copia el fixture a un directorio temporal nuevo, una vez por tarea y repetición:

   ```sh
   node --input-type=module -e 'import { cpSync, mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path"; const destination = mkdtempSync(join(tmpdir(), "ms-agent-eval-")); cpSync("fixture", destination, { recursive: true }); console.log(destination)'
   ```

2. Abre esa copia como proyecto del cliente que vas a evaluar. Conserva el identificador del kit, del fixture, la versión del cliente, el modelo y sus ajustes. Utiliza el mismo agente de entrada en ambas variantes. Pega literalmente el prompt de la tarea del catálogo. No añadas aclaraciones ni soluciones durante la comparación; registra las preguntas y reintentos.
3. Ejecuta `node verify.mjs <id>` en la copia terminada y revisa los criterios de `tasks.json`. La copia original falla los cinco casos: tres esperan cambios de comportamiento y dos entregables documentales. `node demo.mjs` sí funciona desde el inicio.
4. Compara los archivos con el fixture original. El verificador no debe cambiar; únicamente son admisibles los archivos indicados en `allowed_changes`. En investigación y documentación, el PASS automático confirma solo datos mínimos: revisa causa, precisión, evidencia y claridad antes de registrar un resultado correcto. En `modules`, comprueba además que `createOrder` usa `canFulfill` en lugar de duplicar su lógica.
5. Copia `result-template.json` fuera del repositorio y completa un registro por ejecución. El valor inicial `pending` se rechaza deliberadamente: la plantilla no acredita una ejecución. Valídalo con `node validate-result.mjs /ruta/resultado.json`.

| ID | Tipo | Comprobación principal |
|---|---|---|
| `bug` | Bug conocido | Cantidad cero y regresión del cálculo |
| `feature` | Feature acotada | Normalización, orden y ausencia de mutaciones |
| `investigation` | Investigación | Precedencia del envío remoto y reproducciones |
| `documentation` | Documentación | Ejecución real del ejemplo y explicación correcta |
| `modules` | Cambio entre módulos | Existencias, validación de cantidad y contrato del pedido |

No uses el mismo directorio ya resuelto en otra repetición. Para `cold`, abre una sesión nueva sin contexto guardado del fixture. Para `reused`, prepara previamente el contexto del proyecto sobre una copia aún sin resolver y abre una sesión nueva que lo reutilice. Mantén esa preparación idéntica entre variantes y no mezcles ambas condiciones en una misma comparación.

## Registrar y comparar observaciones

- `client`: cliente y versión; `model`: identificador resuelto y esfuerzo/configuración relevante. Si el cliente no lo revela, indica `unverified`; esa ejecución no permite atribuir diferencias al kit.
- `kit_ref`: commit exacto y, si procede, referencia al diff local; `fixture_ref`: commit o hash del fixture sin resolver. Conservar el diff es necesario si hay cambios sin commit.
- `task_id`, `repetition` y `context_state`: tarea, repetición positiva y `cold` o `reused`.
- `outcome`: `pass` solo al cumplir todos los criterios automáticos y manuales; `fail`, `blocked` o `incomplete` también son observaciones válidas.
- `duration_seconds`: tiempo de pared desde enviar el prompt hasta finalizar, incluidas herramientas; `tool_calls`: invocaciones de herramientas visibles (incluidas las de subagentes cuando el cliente las exponga); `retries`: intentos repetidos tras un fallo; `unnecessary_questions`: preguntas ya resueltas por el prompt o fixture, justificadas en la evidencia. Usa el mismo criterio de conteo en ambas variantes.
- `tokens`: total comunicado por el cliente, con referencia a su medición. Todas las métricas admiten `null` si no se pueden observar: `null` no significa cero.
- `evidence`: rutas o referencias a la salida del verificador original, diff, revisión manual y mediciones del cliente. El validador comprueba estructura, no existencia ni veracidad de esas referencias.

Compara mismo cliente, modelo, ajustes, tarea, fixture inicial y estado de contexto. Repite cada condición al menos tres veces antes de interpretar diferencias y alterna el orden de variantes. Conserva resultados incorrectos y bloqueados; compara primero tasa de corrección y después tiempo, llamadas y tokens de resultados correctos. Una reducción de coste con más errores no acredita una mejora. No publiques porcentajes de ahorro sin registros reales comparables.

## Medir tamaño de las fuentes

Desde `assets/evaluations`, ejecuta:

```sh
node measure-prompts.mjs
node measure-prompts.mjs --assets /ruta/al/checkout-anterior/assets
node measure-prompts.mjs --baseline /ruta/antes.json
```

Guarda la salida JSON estándar del segundo comando como `antes.json` fuera del repo antes de comparar. El script solo lee archivos; mide bytes UTF-8, caracteres Unicode (puntos de código) y SHA-256, con orden estable. Omite enlaces simbólicos y limita la lectura a agentes, comandos, skills y el contrato compartido. La comparación enumera añadidos, retirados y modificados y muestra diferencias de tamaño.

Es un inventario de fuentes, no una suma de contexto efectivo: incluye referencias bajo demanda y prompts mutuamente excluyentes. No equivale al prompt generado por cada adaptador, a tokens consumidos ni a eficacia. Para evaluar una extracción de contenido, compara el archivo del arquitecto y la referencia extraída por separado; el total del inventario puede aumentar aunque disminuya el prompt obligatorio.

La medición estructural previa del 2026-09-02, comunicada por el tester del flujo, registró 13.153 bytes y 1.868 palabras en `assets/agents/ms-architect.md`; su sección documental contenía 925 palabras. Los prompts generados con ámbito `project` registraron: OpenCode 24.038 bytes/3.153 palabras, Claude 14.373/2.030 y Codex 19.007/2.711. Es una referencia textual recibida del tester, no una ejecución de este script ni una línea base de eficacia. Para una comparación reproducible con hashes usa snapshots del mismo script y conserva los refs correspondientes.
