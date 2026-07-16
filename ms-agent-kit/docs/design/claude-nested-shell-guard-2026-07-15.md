# Claude nested shell guard — diseño TDD

Fecha: 2026-07-15

## Alcance

El siguiente paquete corrige exclusivamente cuatro huecos confirmados del guard generado para Claude:

1. `Grep.tool_input.glob` puede seleccionar rutas sensibles sin pasar por `secretPath`.
2. La protección frente a volcados de entorno solo se aplica al comando exterior y no a comandos extraídos recursivamente.
3. El código entregado a `shell -c`, `env -S` o `env --split-string` puede depender de expansiones de parámetros que el guard no puede resolver de forma estática.
4. Estructuras de control o agrupación de shell no modeladas pueden ocultar ejecutables peligrosos.

La implementación posterior será un único paquete limitado a:

- `src/adapters/claude.ts`
- `tests/claude-guard.test.ts`

Las correcciones existentes para opciones anteriores a `shell -c` y para `env -P` se mantienen como regresiones y no amplían este paquete. Quedan fuera de alcance cualquier otro hallazgo y cualquier cambio en OpenCode o Codex.

## Causa

`passesRecursiveDenyRules` vuelve a aplicar la denylist a comandos interiores, pero las otras protecciones no cubren todas las capas ni todas las entradas de herramienta:

- `invokesEnvironmentDump` se ejecuta en el comando Bash original, no en cada comando interior descubierto;
- el parser acepta como código una cadena con expansión de parámetros cuyo valor efectivo solo conocería el shell en ejecución;
- el modelo de secuencias simples no representa de forma segura palabras reservadas y grupos como `if`, `then` o `{ ...; }`;
- el guard incorpora `Glob.tool_input.pattern`, pero no `Grep.tool_input.glob`, a la validación de rutas sensibles.

El resultado es que una operación que se bloquearía directamente puede quedar oculta dentro de una capa recursiva o de una entrada no inspeccionada.

## Invariantes

1. La denylist canónica sigue siendo la única fuente de verdad para decidir qué comandos ejecutables son peligrosos; no se crea una segunda lista de comandos destructivos.
2. Todo comando interior descubierto se evalúa con las mismas reglas que un comando de nivel superior.
3. `passesRecursiveDenyRules` reaplica la protección frente a volcados de entorno en cada nivel de recursión.
4. `env` se distingue por su función: sin comando efectivo es un volcado de entorno y se bloquea; con asignaciones y un comando efectivo es un wrapper y ese comando se inspecciona recursivamente.
5. El código entregado a `shell -c`, `env -S` o `env --split-string` que contenga una expansión de parámetro no resoluble estáticamente se resuelve *fail-closed*.
6. Las estructuras de control o agrupación no soportadas se analizan correctamente o se resuelven *fail-closed*; nunca se aceptan como una secuencia simple parcial.
7. `Grep.tool_input.glob` pasa por `secretPath` con la misma política que el resto de selectores de ruta. La excepción existente para `.env.example` se conserva.
8. La inspección recursiva mantiene un límite de profundidad explícito y cualquier parseo ambiguo, sustitución sin cerrar o exceso del límite se resuelve *fail-closed*.
9. Texto literal que contiene palabras como `if` o `rm` no se interpreta como ejecutable ni se bloquea por coincidencia textual accidental.
10. No se amplían permisos ni se alteran agentes, plataformas o herramientas fuera del guard de Claude.

## Diseño

La función central conserva una interfaz conceptual equivalente a:

```text
passesRecursiveDenyRules(agent, command, depth) -> allow | deny
```

Para cada nivel debe:

1. rechazar si se supera el máximo de profundidad;
2. rechazar si el comando actual representa un volcado de entorno;
3. aplicar `BASH_DENY_RULES` al comando actual;
4. tokenizar de manera conservadora y validar que la estructura shell está completamente modelada;
5. extraer sustituciones, wrappers `env` y código de shells con `-c`;
6. rechazar código efectivo con expansiones de parámetros cuyo valor no pueda determinarse;
7. invocar `passesRecursiveDenyRules` para cada comando interior;
8. permitir solo si el nivel actual y todos sus interiores resultan permitidos.

### Protección de entorno en cada nivel

`invokesEnvironmentDump` debe formar parte de la evaluación recursiva, no ser únicamente un filtro previo del payload Bash. La clasificación distingue:

- `env` sin comando efectivo: volcado completo, bloqueado;
- `printenv` con o sin nombres: lectura de entorno, bloqueada;
- `env VAR=x pnpm test`: wrapper con comando efectivo, permitido si `pnpm test` supera la inspección recursiva;
- `env -S 'printenv'`: wrapper cuyo comando interior es un volcado, bloqueado.

Esta comprobación se repite después de extraer código de `sh -c`, otros shells soportados y variantes split-string de `env`.

### Código dinámico en `-c` y `-S`

El argumento que se ejecutará como código debe ser determinista para el guard. Si depende de `$VAR`, `${VAR}` u otra expansión de parámetro no resoluble, el guard lo bloquea aunque la asignación aparezca antes en la misma línea. No se intenta emular la expansión del shell.

Ejemplos:

- `CMD='rm -f archivo'; sh -c "$CMD"` → bloquear.
- `env -S "$CMD"` → bloquear.
- `sh -c 'pnpm test'` → permitir.

Las sustituciones `$(...)` y con backticks continúan tratándose como comandos interiores y no se confunden con una expansión de parámetro simple.

### Estructuras de control y grupos

El parser no puede extraer solo una parte aparentemente segura de una construcción compuesta. Para `if`/`then`/`fi`, grupos `{ ...; }` y cualquier estructura no representada completamente hay dos implementaciones válidas:

- modelar todos sus comandos ejecutables y evaluarlos recursivamente; o
- rechazar toda la construcción de forma conservadora.

El paquete mínimo elegirá *fail-closed* cuando la estructura no esté soportada. Las palabras reservadas dentro de argumentos entrecomillados siguen siendo texto literal.

### Glob de Grep

Cuando `tool_name === "Grep"`, `tool_input.glob` se añade a los valores evaluados por `secretPath`:

- `.env*` → bloquear porque puede seleccionar secretos;
- `*.ts` → permitir;
- `.env.example` → permitir mediante la excepción segura ya definida en `secretPath`.

No se introduce una política paralela para Grep.

## Plan TDD

### Rojo

Añadir primero pruebas en `tests/claude-guard.test.ts` que demuestren los cuatro huecos. La matriz mínima es:

| Área | Caso | Resultado esperado |
| --- | --- | --- |
| Entorno recursivo | `sh -c 'env'` | bloqueado |
| Entorno recursivo | `sh -c 'printenv API_TOKEN'` | bloqueado |
| Entorno recursivo | `env -S 'printenv'` | bloqueado |
| Wrapper seguro | `env VAR=x pnpm test` | permitido |
| Código dinámico | `CMD='rm -f archivo'; sh -c "$CMD"` | bloqueado *fail-closed* |
| Código dinámico | `env -S "$CMD"` | bloqueado *fail-closed* |
| Código estático seguro | `sh -c 'pnpm test'` | permitido |
| Control no modelado | `if true; then rm -f archivo; fi` | bloqueado |
| Grupo no modelado | `{ rm -f archivo; }` | bloqueado |
| Texto literal | `printf '%s\n' 'if true; then rm -f archivo; fi'` | permitido si el agente permite el ejecutable exterior |
| Grep sensible | `Grep` con `tool_input.glob: ".env*"` | bloqueado |
| Grep ordinario | `Grep` con `tool_input.glob: "*.ts"` | permitido |
| Grep seguro | `Grep` con `tool_input.glob: ".env.example"` | permitido según `secretPath` |

Mantener además las regresiones existentes para comandos peligrosos directos, opciones anteriores a `shell -c`, `env -P`, sustituciones de comandos, parseo ambiguo y profundidad superior al límite.

### Verde

Implementar la corrección mínima en `src/adapters/claude.ts`:

- mover o repetir la clasificación de volcado de entorno dentro de `passesRecursiveDenyRules`;
- diferenciar `env` sin comando de `env` como wrapper con comando efectivo;
- detectar expansiones de parámetros no resolubles en el argumento efectivo de `-c`, `-S` y `--split-string`;
- reconocer por completo las estructuras de control/grupo o rechazarlas *fail-closed*;
- incorporar `Grep.tool_input.glob` a la validación existente con `secretPath`.

No añadir nombres de comandos peligrosos fuera de la denylist canónica ni excepciones específicas para satisfacer casos individuales.

### Refactor

Consolidar los motivos de denegación y la extracción de comandos interiores sin ampliar el alcance. Confirmar que:

- toda ruta de comando interior vuelve a pasar por `passesRecursiveDenyRules`;
- la protección de entorno se aplica a cada nivel;
- el selector `glob` de Grep usa exactamente `secretPath`;
- las construcciones seguras no dependen de coincidencias textuales accidentales.

## Casos de regresión

Además de la matriz principal:

- cada shell soportado con `-c` bloquea un comando canónicamente denegado;
- un wrapper `env` con asignaciones conserva y valida su comando efectivo;
- sustituciones múltiples bloquean si una sola es peligrosa;
- anidamiento seguro dentro del límite se permite;
- anidamiento peligroso se bloquea independientemente del nivel;
- opciones válidas anteriores a `shell -c` no ocultan el código inspeccionado;
- `env -P` no oculta su comando efectivo;
- argumentos ordinarios entrecomillados que contienen `if`, `then`, `{` o `rm` no se bloquean por coincidencia textual accidental;
- los tests existentes de secretos, comandos directos y roles de solo lectura siguen pasando.

## Ronda P6 — código generado, prefijos y `xargs`

Esta ronda posterior corrige únicamente tres evasiones confirmadas por ambos auditores. No amplía el alcance a brace globs ni a variables en posición de ejecutable, que siguen siendo observaciones no confirmadas.

### Criterios de seguridad

1. El argumento efectivo de `shell -c`, `env -S` y `env --split-string` se rechaza *fail-closed* si contiene sustituciones activas capaces de producir texto que una capa posterior interpretará como código: `$()`, backticks, expansión aritmética `$((...))` o process substitution `<(...)`/`>(...)`. El resultado no se considera seguro aunque el productor observado sea `printf`, `echo` u otro comando permitido.
2. Los prefijos de ejecución `!`, `time` y `coproc` no pueden ocultar el ejecutable real. La implementación mínima puede rechazarlos conservadoramente cuando ocupen una etapa ejecutable; las mismas palabras como argumentos literales ordinarios continúan permitidas.
3. `xargs` se trata como wrapper de ejecución. El guard debe consumir únicamente opciones conocidas, exigir un comando explícito e inspeccionarlo recursivamente. Una opción desconocida, un valor ausente o la ausencia de comando se resuelve *fail-closed*.
4. El comando extraído de `xargs` se reconstruye como argumentos literales, sin convertir datos en nueva sintaxis shell. Si ese comando abre una capa `shell -c`, las reglas de código efectivo vuelven a aplicarse en la recursión.
5. La denylist canónica sigue siendo la fuente de verdad para `rm`, `printenv` y demás ejecutables denegados; `xargs` solo expone el comando efectivo a esa política.

### Matriz TDD de P6

| Área | Caso | Resultado esperado |
| --- | --- | --- |
| Generación en `-c` | `sh -c '$(printf rm) -f archivo'` | bloqueado *fail-closed* |
| Backticks en `-c` | ``sh -c '`printf rm` -f archivo'`` | bloqueado *fail-closed* |
| Aritmética en `-c` | `sh -c 'printf %s $((1 + 1))'` | bloqueado *fail-closed* |
| Process substitution | `bash -c 'cat <(printf seguro)'` | bloqueado *fail-closed* |
| Generación en split string | `env -S 'sh -c "$(printf rm) -f archivo"'` | bloqueado *fail-closed* |
| Prefijo negación | `! rm -f archivo` | bloqueado |
| Prefijo tiempo | `time rm -f archivo` | bloqueado |
| Prefijo coproceso | `coproc rm -f archivo` | bloqueado |
| Texto literal | `printf '%s\n' '! time coproc'` | permitido |
| `xargs` destructivo | `xargs -0 rm -f` | bloqueado |
| `xargs` de entorno | `xargs -0 printenv` | bloqueado |
| `xargs` seguro | `xargs -0 printf '%s\n'` | permitido |
| `xargs` ambiguo | `xargs --opcion-desconocida printf` | bloqueado *fail-closed* |

### Implementación mínima de P6

- distinguir en la extracción recursiva los argumentos que una capa posterior interpretará como código de los comandos directos reconstruidos desde `xargs`;
- detectar las cuatro formas de sustitución activa respetando comillas simples y escapes, para no bloquear coincidencias meramente literales;
- detectar `!`, `time` y `coproc` solo en etapas ejecutables normalizadas, incluidos wrappers ya soportados como `command` y `env`;
- añadir un parser conservador de opciones de `xargs` y rechazar cualquier forma que no determine un comando explícito de manera inequívoca;
- conservar todas las regresiones seguras anteriores y el límite de profundidad recursiva.

### Definition of Done de P6

- las regresiones peligrosas de la matriz terminan con código 2 y los casos seguros terminan con código 0;
- las pruebas focalizadas del guard, la suite completa, typecheck, build y `git diff --check` pasan;
- el juicio doble queda pendiente hasta revisar el nuevo diff;
- la instalación global no se modifica durante esta ronda.

### P6.1 — entrada no confiable de `xargs`

La entrada que `xargs` leerá en tiempo de ejecución es *tainted*: el guard no conoce sus valores, si estará vacía ni cómo cambiará el significado de los argumentos finales. No es correcto sustituirla por un argumento centinela aparentemente inocuo.

La entrada futura puede controlar distintas superficies:

- `printf '%s\0' 'rm -f archivo' | xargs -0 sh -c` convierte el dato en código de `sh -c`;
- `printf '%s\0' '-f' 'archivo' | xargs -0 rm` convierte datos en opciones y operandos;
- `printf '' | xargs env` puede ejecutar el consumidor sin argumentos, por lo que un centinela inventado ocultaría un volcado de entorno real.

P6.1 aplica una política mínima *sound*:

1. `xargs` solo se permite con una lista diminuta de consumidores de salida cuya semántica garantice que la entrada queda después de un argumento fijo y no puede controlar el ejecutable, código interpretado ni opciones.
2. Como mínimo se admite `printf` con formato estático explícito, por ejemplo `xargs -0 printf '%s\n'`. El formato ocupa una posición fija anterior a cualquier dato futuro.
3. La lista de consumidores es un gate de determinismo de `xargs`, no una segunda denylist de comandos peligrosos.
4. Cualquier otro consumidor, la ausencia de consumidor o una forma que permita reemplazo/entrada alternativa se rechaza *fail-closed*.
5. `-a`/`--arg-file`, `-I`/`--replace` y las opciones no modeladas se rechazan: el guard no intenta inferir datos externos ni sustituciones futuras.
6. No se materializa la entrada desconocida como texto sintético ni se usa ese texto para demostrar que una ejecución es segura.

La matriz roja adicional es:

| Caso | Resultado esperado |
| --- | --- |
| `printf '%s\0' 'rm -f archivo' \| xargs -0 sh -c` | bloqueado *fail-closed* |
| `printf '%s\0' '-f' 'archivo' \| xargs -0 rm` | bloqueado *fail-closed* |
| `printf '' \| xargs env` | bloqueado *fail-closed* |
| `xargs -0 printf '%s\n'` | permitido como consumidor estático seguro |
| `xargs -a entradas printf '%s\n'` | bloqueado por fuente alternativa no modelada |

### P6.2 — transición de comillas en código interpretado

Esta ronda corrige exclusivamente una transición inválida de `hasActiveCodeGeneration`. Cuando el escáner ya está dentro de comillas dobles (`quote === '"'`), una comilla simple es texto ordinario para el shell. La implementación actual la interpreta como apertura de quoting simple, pierde el cierre doble posterior y puede dejar de detectar una sustitución activa que aparece después.

El invariante de quoting es cerrado:

1. `'` solo abre quoting simple desde el estado no citado (`quote === null`).
2. Dentro de `"..."`, `'` no cambia el estado; el siguiente `"` conserva su función de cierre.
3. Después de cerrar las comillas dobles, `$()`, backticks, `$((...))` y `<(...)`/`>(...)` vuelven a estar activos y se detectan con las reglas de P6.
4. Dentro de `'...'`, esas mismas formas continúan siendo texto literal y no generan un falso positivo.
5. P6.2 no amplía permisos ni modifica la política de consumidores de `xargs` definida en P6.1.

La matriz roja guard-only es:

| Caso | Resultado esperado |
| --- | --- |
| `sh -c "printf \"'\"; \$(printf rm) -f archivo"` | código 2: la comilla simple literal no oculta la sustitución activa posterior |
| `sh -c "printf \"'\""` | código 0: el apóstrofe sin generación activa sigue permitido |

El primer caso debe añadirse a las entradas denegadas de la regresión de código generado y el segundo a sus entradas permitidas. El cambio verde mínimo modifica una sola transición de `hasActiveCodeGeneration`: la rama que abre quoting simple exige `quote === null`. No se reescribe el parser ni se añaden excepciones por comando.

El uso de `basename === "printf"` como prueba de identidad del ejecutable no demuestra qué binario resolverá `PATH`. Ambas revisiones lo conservan como riesgo teórico documentado: no existe una reproducción confirmada que entre en el modelo actual y queda expresamente fuera de P6.2. Tampoco entran brace globs, variables en posición de ejecutable ni otros hallazgos no confirmados.

### Definition of Done de P6.2

- la regresión con comilla simple literal seguida de sustitución activa termina con código 2;
- el caso seguro con apóstrofe y sin generación activa termina con código 0;
- la corrección se limita a la transición de `'` desde estado no citado en `hasActiveCodeGeneration`;
- P6 y P6.1 permanecen intactos y sus regresiones continúan siendo requisitos;
- el riesgo teórico de identidad de `printf` permanece documentado y no provoca cambios de permisos en esta ronda.

## Rollback

Revertir únicamente el paquete posterior en `src/adapters/claude.ts` y `tests/claude-guard.test.ts`. El documento de diseño puede conservarse como registro de la decisión. El rollback restaura el comportamiento anterior sin migraciones, cambios de estado ni impacto en OpenCode o Codex.

Si el comportamiento *fail-closed* produce falsos positivos, no se relaja de forma global: se revierte el paquete y se diseña soporte explícito para la construcción afectada antes de volver a habilitarla.

## Definition of Done

- Los cuatro hallazgos de la matriz quedan cubiertos por pruebas que fallan antes de la implementación y pasan después.
- `passesRecursiveDenyRules` reaplica la protección de environment dump en cada nivel y distingue `env` sin comando de un wrapper `env` con comando efectivo.
- El código efectivo dinámico en `-c`, `-S` y `--split-string` se bloquea *fail-closed*.
- Las estructuras de control o grupo no soportadas se bloquean *fail-closed* y el texto literal equivalente continúa permitido.
- `Grep.tool_input.glob` sensible se bloquea; `*.ts` y `.env.example` conservan el comportamiento seguro esperado.
- La denylist canónica sigue siendo la única fuente de comandos peligrosos.
- La implementación completa es un único paquete que solo cambia `src/adapters/claude.ts` y `tests/claude-guard.test.ts`.
- No se modifican OpenCode, Codex ni otros hallazgos fuera de alcance.
- Verificación final satisfactoria:

```sh
pnpm check
pnpm test
pnpm build
git diff --check
```
