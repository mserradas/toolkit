# TDD: endurecimiento de permisos Claude

> Referencia histórica. Desde 2026-09-17 el kit no genera políticas de permisos en ningún cliente. Se retiraron el guard de Claude, las tablas de comandos y las reglas de Codex. La validación de resultados queda disponible como comando manual en los tres clientes, sin hooks de bloqueo. Este diseño describe la implementación anterior.

| Campo | Valor |
|---|---|
| Estado | Reemplazado |
| Retención | Histórica |
| Versión | 1.1 |
| Fecha de creación | 2026-08-05 |
| PRD | N/A — decisión técnica explícita |
| Spec | N/A — comportamiento cerrado en la entrada |

## 1. Decisión y objetivo

`ms-agent-kit` materializa para cada agente `ms-*` una política Bash explícita con la forma `{ fallback, allow, ask, deny }`. El guard de Claude resuelve cada comando a `allow | ask | deny`, conserva el `fallback: "ask"` de `ms-codex` y falla cerrado cuando la política falta o es inválida.

El mismo guard protegerá configuraciones sensibles por identidad de ruta y por semántica de invocación:

| Recurso | Decisión |
|---|---|
| Cualquier `.git/config` | `deny` |
| Cualquier `.claude/settings.local.json` | `deny` |
| `~/.claude/settings.json` del `BuildContext.homeDir` | `deny` |
| `<project>/.claude/settings.json`, resuelto desde `process.cwd()` | Permitido por esta capa; siguen aplicando permisos de herramienta y settings |
| Cualquier invocación semántica de `git config` | `deny` |

Las denegaciones estructurales, de secretos y de configuraciones sensibles tienen precedencia sobre la política materializada. Dentro de una política válida, el orden es `deny > ask > allow > fallback`.

### Invariantes

- Cada agente del catálogo aparece en el mapa materializado, incluso cuando no dispone de Bash.
- `bash: "deny"` se representa como `fallback: "deny"` y listas vacías.
- Un mapa Bash solo es válido si su fallback `"*"` y todas sus acciones son `allow`, `ask` o `deny`; cualquier ausencia, tipo o valor distinto produce una política efectiva `deny`.
- `ms-codex` conserva `fallback: "ask"`; los roles cerrados conservan `fallback: "deny"`.
- Una coincidencia `ask` prevalece sobre una coincidencia `allow`; ninguna de ellas supera una denegación estructural, sensible o explícita.
- Los candidatos canónicos se usan para `deny` y `ask`. Un auto-allow solo coincide con el comando raw expresamente allowlisted; wrappers u opciones no exactos caen al fallback `ask` o `deny`.
- La ausencia de `payload.agent_type` continúa admitida. Si se declara y difiere del agente fijado por `argv`, se deniega.
- Una ruta se clasifica por componentes e identidad canónica, no por aparición textual dentro de otra cadena.
- La excepción de proyecto solo cubre exactamente `<project>/.claude/settings.json`; no cubre `settings.local.json`, la configuración de usuario ni archivos alcanzados mediante symlink.
- Si la ruta de proyecto y la de usuario coincidieran, prevalece la protección de usuario.
- No se introduce estado persistente, migración ni cambio de schema.

## 2. No objetivos

- Rediseñar la política de OpenCode más allá de ampliar la matriz compartida de rutas directas.
- Cambiar el fallback de `ms-codex` a `deny`.
- Endurecer la ausencia de `payload.agent_type`.
- Añadir N-3, H-8 o un grant global de `Skill`.
- Permitir variantes de `git config`; la política Claude lo deniega por completo, incluso para lecturas.
- Sustituir el parser de shell existente por un parser general.
- Cambiar la configuración de settings de Claude ni su precedencia sobre hooks.

## 3. Entradas y trazabilidad

| Entrada aprobada | Materialización |
|---|---|
| Política Bash ternaria | Mapa por agente y función de decisión en `src/adapters/claude.ts` |
| Fallback cerrado ante política ausente o malformada | Validación al materializar y al consumir; resultado `deny` |
| Fallback OpenCode preservado | El valor de `"*"` pasa a `fallback`, incluido `ask` para `ms-codex` |
| Precedencia `deny > ask > allow` | Pseudoflujo de la sección 6 |
| Contrato oficial `PreToolUse` | JSON exclusivo en `stdout` para `allow` y `ask`, con exit 0 |
| Protección contextual de settings | `BuildContext.homeDir`, `process.cwd()` y canonicalización por ancestro existente |
| `git config` denegado semánticamente | Reutilización de `invocationStages` y `gitSubcommand` |
| Rutas directas compartidas | Extensión acotada de `src/core/permissions.ts` |

Fuente externa: [Hooks de Claude Code](https://code.claude.com/docs/en/hooks), documentación oficial consultada el 2026-08-05. `PreToolUse` admite `allow`, `deny`, `ask` y `defer`; el JSON solo se procesa con exit 0. Este diseño usa `allow`, `ask` y el deny existente por exit 2. Un `allow` del hook no supera reglas `deny` o `ask` de settings.

No hay preguntas funcionales abiertas.

## 4. Estado previo relevante

- `src/adapters/claude.ts:bashAllowRules` solo materializa allowlists de roles cuyo fallback es `deny`.
- `allowedBashCommand` devuelve `true` cuando no encuentra reglas para el agente. Una política omitida puede, por tanto, abrir Bash.
- `bashDenyRules` conserva denies explícitos y el guard aplica análisis recursivo de shell, secretos, mutaciones y código dinámico.
- `src/core/opencode-role-permissions.ts` define `"*": "ask"` para `ms-codex`; la materialización Claude actual no conserva ese fallback.
- El guard ya dispone de `canonicalPath`, que resuelve el ancestro existente más cercano y preserva el sufijo inexistente.
- `secretPath` duplica parte de `src/core/permissions.ts`, pero no distingue la configuración de usuario de la configuración de proyecto.
- `gitSubcommand` ya normaliza opciones globales de Git y `invocationStages` reconoce wrappers soportados.
- El guard exitoso termina sin una decisión JSON explícita; los rechazos usan exit 2.

## 5. Decisiones y alternativas descartadas

### 5.1 Política única por agente

La implementación sustituye `BASH_ALLOW_RULES` y `BASH_DENY_RULES` por `BASH_POLICIES`. Cada entrada contiene:

- `fallback: "allow" | "ask" | "deny"`;
- `allow: string[]`;
- `ask: string[]`;
- `deny: string[]`.

Los patrones específicos de `openCodeRolePermission(agent).bash` se agrupan por acción. Los patrones `opencode ...`, no ejecutables como parte del contrato Claude, continúan sin convertirse en allows Claude. Cualquier patrón que represente `git config` tampoco se incorpora a `allow`; la denegación semántica del runtime sigue siendo la autoridad.

La validación se repite en el runtime generado para que una constante ausente o malformada no recupere un comportamiento permisivo. No se lanza un fallback implícito: se devuelve `deny`.

Alternativa descartada: conservar el booleano `allowedBashCommand`. No puede expresar `ask`, pierde el fallback de `ms-codex` y mantiene el bypass ante reglas ausentes.

### 5.2 Settings contextuales, no glob global

`.git/config` y `.claude/settings.local.json` se añaden a las rutas directas y patrones compartidos de `src/core/permissions.ts`, junto con sus casos en `isSensitivePath`. No se añade `**/.claude/settings.json`: bloquearía también el settings de proyecto que debe seguir legible.

`~/.claude/settings.json` se materializa específicamente en el guard Claude a partir de `BuildContext.homeDir`. La firma conceptual pasa a `claudeGuardSource(catalog, context)`; el artefacto contiene la ruta, no el contenido del archivo.

Alternativa descartada: marcar cualquier `.claude/settings.json` como secreto compartido. Es simple, pero elimina la excepción de proyecto.

### 5.3 Clasificación semántica

La protección nueva no usa `command.includes(...)` ni una expresión regular sobre el comando completo:

- para `Read`, `Write`, `Edit` y `NotebookEdit`, inspecciona únicamente los campos de ruta;
- para `Glob` y `Grep`, inspecciona `path` y `glob`, no el patrón de búsqueda textual;
- para Bash, reutiliza tokens, etapas y wrappers ya reconocidos para extraer operandos de ruta de invocaciones soportadas;
- para Git, usa la etapa cuyo ejecutable efectivo es `git` y `gitSubcommand(args).name === "config"`.

Texto citado como `printf '.git/config'`, una búsqueda de esa cadena dentro de `README.md`, `.git/configuration` o `.claude/settings.json.example` no se clasifica como acceso protegido. Una forma ambigua que ya es rechazada por el análisis estructural existente continúa en `deny`.

Alternativa descartada: buscar substrings sensibles en el comando. Produce falsos positivos sobre documentación y admite evasiones por wrappers o normalización.

## 6. Diseño implementado

### 6.1 Materialización

La construcción recorre todos los agentes del catálogo:

1. Si `bash === "deny"`, genera una política cerrada.
2. Si `bash` no es un objeto plano, no contiene `"*"` válido o contiene una acción inválida, genera una política cerrada.
3. En otro caso, copia `"*"` a `fallback` y distribuye el resto de patrones entre `allow`, `ask` y `deny`.
4. Retira de `allow` las reglas no aplicables a Claude y cualquier forma derivada de `git config`.
5. Serializa una entrada para el agente aun cuando todas las listas estén vacías.

Los denies que hoy se inspeccionan estructuralmente pueden seguir fuera de la lista literal para evitar falsos positivos; continúan siendo denies previos a la política.

### 6.2 Resolución contextual de rutas

El guard materializa `USER_CLAUDE_SETTINGS` con `path.resolve(context.homeDir, ".claude/settings.json")`. En runtime:

1. Expande solo `~` y el prefijo `~/` mediante el home materializado; no interpreta variables de entorno.
2. Resuelve rutas relativas contra `process.cwd()`.
3. Canonicaliza el target y los roots mediante `realpathSync.native` sobre el ancestro existente más cercano.
4. Compara por igualdad de ruta o por pares exactos de componentes `.git/config` y `.claude/settings.local.json`.
5. Calcula `PROJECT_CLAUDE_SETTINGS` desde el cwd canónico.
6. Aplica primero los denies globales y de usuario; después reconoce la excepción exacta de proyecto.

Para inputs con glob, se canonicaliza el prefijo concreto anterior al primer metacarácter y se comparan componentes del sufijo como patrón. Solo se deniega cuando el patrón puede seleccionar uno de los targets protegidos; una coincidencia parcial de nombre no basta.

Errores de `realpath` distintos de `ENOENT`, paths no interpretables o expansión ambigua fallan cerrados para la operación evaluada.

### 6.3 Detección de `git config`

Cada comando y comando anidado que el parser existente pueda demostrar se recorre con `invocationStages`. Se deniega cuando cualquier etapa:

- tiene `executable === "git"`; y
- después de normalizar opciones globales mediante `gitSubcommand`, tiene `name === "config"`.

Esto cubre como mínimo `git config`, `git -C <ruta> config`, `git --git-dir=<ruta> config`, `command git config`, wrappers `env` soportados y comandos anidados deterministas de `xargs`. No se distingue entre lectura y escritura. `git configuration` y texto que solo menciona `git config` no coinciden.

Las opciones globales `-c` y `--config-env` se tratan como sensibles porque pueden alterar la configuración efectiva. Si sus argumentos faltan, son ambiguos o impiden demostrar el subcomando, la invocación falla cerrada. La misma regla se aplica a cualquier opción global de Git que el parser no pueda normalizar de forma inequívoca.

`git diff --no-index` recibe tratamiento específico: sus dos operandos se extraen y pasan por la clasificación canónica de paths. Así, el modo que compara archivos fuera del índice no puede leer una configuración protegida.

### 6.4 Operandos file de `grep` y `rg`

El guard modela las opciones que reciben archivos o directorios en `grep` y `rg`, incluidas sus formas separadas y `--option=value`. Solo esos operandos y los argumentos posicionales que el parser identifica como paths pasan por la protección contextual; el patrón de búsqueda no se confunde con una ruta.

Las opciones de `rg` que ejecutan programas externos o amplían la lectura a archivos comprimidos son hard deny antes de evaluar la política: `--pre`, cualquier forma `--pre*`, `--hostname-bin` y `-z`/`--search-zip`. Una variante incompleta o ambigua también falla cerrada.

### 6.5 Contrato de decisión Bash

Pseudoflujo normativo:

~~~text
decideBash(agent, command):
  si la identidad esperada no es válida -> deny
  si el análisis estructural/recursivo falla -> deny
  si accede a secretos o configuración protegida -> deny
  si alguna invocación efectiva es git config -> deny
  policy = política válida del agente; si no existe -> deny
  candidates = comando raw + candidatos canónicos demostrados
  si algún candidate coincide con policy.deny -> deny
  si algún candidate coincide con policy.ask -> ask
  si el comando raw coincide exactamente con policy.allow -> allow
  devolver policy.fallback
~~~

La coincidencia `deny`/`ask` usa el matcher de patrones existente sobre el comando raw y sus candidatos canónicos. El auto-allow evalúa únicamente el comando raw contra los patrones `allow`: una canonicalización que retire un wrapper, reordene opciones o normalice una forma no expresamente allowlisted no concede permiso. Esas variantes llegan al fallback `ask` de `ms-codex` o `deny` de un rol cerrado. `unsafeShellSyntax` y `unsafeReadOnlyArguments` permanecen en la fase estructural; no pueden degradarse a `ask`.

### 6.6 Contrato de salida `PreToolUse`

Para `allow` y `ask`, el proceso termina con exit 0 y escribe únicamente un objeto JSON en `stdout`:

~~~json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Permitido por la política Bash del agente ms-*"
  }
}
~~~

`permissionDecision` cambia a `ask` cuando corresponda. La razón es determinista, no incluye el comando completo ni rutas sensibles. No se escriben banners, logs ni texto adicional en `stdout`; diagnósticos internos solo pueden ir a `stderr`.

Un `deny` puede conservar el contrato actual de mensaje en `stderr` y exit 2. Los hooks `Stop` y `SubagentStop` mantienen su contrato terminal y no emiten una decisión `PreToolUse`.

Tras validar una operación no Bash, el guard puede emitir `allow` por el mismo helper cuando el evento sea `PreToolUse`. Esto no evita que settings de Claude mantengan un `ask` o `deny`.

## 7. Seguridad, fallos y observabilidad

- No se lee el contenido de ningún settings para tomar la decisión.
- El home se inyecta desde `BuildContext`; el guard no consulta variables de entorno para descubrirlo.
- Un symlink hacia un target protegido se deniega por identidad canónica.
- Una ruta inexistente bajo un directorio enlazado conserva la canonicalización del ancestro.
- La política ausente o malformada, JSON de entrada inválido, agente desconocido y parser ambiguo producen `deny`.
- `ask` nunca se representa con exit distinto de 0, porque Claude ignoraría el JSON.
- Las razones de decisión son aptas para logs: no reflejan el comando ni valores potencialmente sensibles.
- La suite debe verificar `stdout` byte a byte para impedir contaminación del protocolo.

## 8. Compatibilidad, rollout y rollback

No hay migración de datos. La siguiente ejecución de `plan`/`install` actualizará el artefacto administrado `hooks/ms-agent-guard.mjs`. Los frontmatters y matchers de hooks no cambian.

El rollout se realiza con las dos unidades en orden. Tras integrarlas, se reinstala el target Claude en fixtures o entornos de validación y se confirma que el guard generado es reproducible.

Rollback operativo: revertir ambas unidades y volver a instalar el target Claude para regenerar el guard anterior. No queda estado nuevo que limpiar. Si solo se revierte la Unidad 2, la política ternaria de la Unidad 1 continúa siendo válida; si se revierte la Unidad 1 después de integrar la Unidad 2, debe revertirse también la integración de decisión usada por la Unidad 2.

## 9. Estrategia de verificación

### Pruebas focales de política y protocolo

`tests/claude-guard.test.ts` cubre:

- comando allow de `ms-codex`: exit 0 y JSON exacto con `permissionDecision: "allow"`;
- comando desconocido de `ms-codex`: exit 0 y `permissionDecision: "ask"`;
- comando que coincide con ask y allow: resultado `ask`;
- wrapper u opciones que generan un candidato canónico allowlisted, pero cuyo comando raw no está expresamente en `allow`: fallback `ask`/`deny`, nunca auto-allow;
- candidato canónico que coincide con `ask` o `deny`: conserva esa decisión aunque el raw no coincida;
- deny explícito y deny estructural que también coinciden con ask/allow: exit 2;
- rol cerrado con comando no listado: `deny`;
- política eliminada, fallback ausente, tipo inválido y acción desconocida: `deny`;
- ausencia de `payload.agent_type`: conserva el resultado del agente esperado;
- identidad declarada discordante: `deny`;
- `stdout` contiene solo JSON parseable para allow/ask y no contiene logs;
- hooks `Stop` y `SubagentStop` no emiten JSON de `PreToolUse`.

`tests/adapters.test.ts` comprueba que todos los agentes están materializados, `ms-codex` tiene fallback `ask`, los roles cerrados fallback `deny` y no queda un allow Claude derivado para `git config`.

### Pruebas de rutas y comandos

`tests/permissions.test.ts` cubre positivos y negativos para las nuevas rutas compartidas:

- `.git/config` y rutas anidadas equivalentes se clasifican como sensibles;
- `.claude/settings.local.json` se clasifica como sensible;
- `.git/configuration`, `.claude/settings.json` y `.claude/settings.json.example` no se clasifican por la matriz global.

`tests/claude-guard.test.ts` cubre además:

- deniega Read directo, ruta absoluta y symlink a `.git/config`;
- deniega `.claude/settings.local.json` relativo, absoluto y mediante symlink;
- deniega `~/.claude/settings.json`, su ruta absoluta y un symlink hacia ella;
- permite Read de exactamente `<project>/.claude/settings.json`;
- mantiene la denegación de usuario si cwd y home identifican el mismo archivo;
- cubre `Glob` y `Grep` dirigidos a targets protegidos sin confundir el patrón de búsqueda con un path;
- deniega operandos Bash protegidos en lectores soportados;
- no deniega por esta protección `printf '.git/config'`, una búsqueda textual de esa cadena, `.git/configuration` ni `.claude/settings.json.example`;
- deniega `git config --get`, `git -C repo config`, `git --git-dir=.git config`, `command git config`, `env X=1 git config` y una forma anidada determinista;
- deniega `git -c name=value config`, `git --config-env=name=ENV config` y formas con argumentos ausentes o opciones globales ambiguas;
- inspecciona ambos paths de `git diff --no-index` y deniega si cualquiera identifica una configuración protegida;
- distingue el patrón de búsqueda de los operandos file de `grep` y `rg`, incluidas opciones separadas y `--option=value`;
- aplica hard deny a `rg --pre*`, `rg --hostname-bin` y `rg -z`/`rg --search-zip`, incluidas formas incompletas o ambiguas;
- no clasifica `git configuration` ni texto citado sobre `git config` como invocación protegida.

### Gates integrales

Los gates integrales de cierre ejecutados desde `ms-agent-kit` son:

~~~text
pnpm test
pnpm check
pnpm build
~~~

La implementación final quedó verificada con estos gates. Esta actualización documental se valida solo mediante revisión estática y no vuelve a ejecutar suites.

## 10. Unidades de trabajo

### Unidad 1 — Política Bash ternaria y protocolo `PreToolUse`

**Comportamiento entregado:** Claude conserva los fallbacks de OpenCode, puede solicitar confirmación con `ask` y falla cerrado ante una política ausente o inválida.

**Archivos:**

- `src/adapters/claude.ts`;
- `tests/claude-guard.test.ts`;
- `tests/adapters.test.ts`.

**Alcance:**

- sustituir las tablas allow/deny por `BASH_POLICIES`;
- validar y resolver `deny > ask > allow > fallback`;
- emitir el JSON oficial para allow/ask;
- preservar denies estructurales, secretos, identidad y contrato terminal.

**Fuera de alcance:** nuevas rutas sensibles y detección de `git config`, salvo neutralizar cualquier allow derivado durante la materialización.

**Criterios de finalización:**

- `ms-codex` devuelve ask para un comando no listado;
- roles cerrados y políticas inválidas devuelven deny;
- precedencia y formato de `stdout` están cubiertos;
- ausencia de `payload.agent_type` sigue admitida;
- pruebas focales y gates integrales pasan.

**Rollback:** revertir los tres archivos y regenerar el guard. No hay datos ni configuración manual que migrar.

**Dependencias:** ninguna.

**Carga de revisión:** media; cambia el contrato de decisión del guard, pero no su parser estructural.

### Unidad 2 — Configuraciones sensibles y `git config`

**Comportamiento entregado:** los agentes `ms-*` no pueden acceder a settings local/user ni a `.git/config`, mientras el settings de proyecto sigue legible.

**Archivos:**

- `src/core/permissions.ts`;
- `src/adapters/claude.ts`;
- `tests/permissions.test.ts`;
- `tests/claude-guard.test.ts`;
- `tests/adapters.test.ts` si cambia la serialización esperada del guard.

`src/core/opencode-role-permissions.ts` no necesita cambiar: su allow `git config --get *`, si existe, se filtra al materializar Claude y queda subordinado al deny semántico. Así no se amplía el rediseño de OpenCode.

**Alcance:**

- ampliar solo las rutas no contextuales de la matriz compartida;
- materializar el settings de usuario desde `BuildContext.homeDir`;
- resolver home, cwd, rutas absolutas, ancestros reales y symlinks;
- permitir exactamente el settings de proyecto;
- detectar `git config` mediante las invocaciones efectivas del parser existente;
- fallar cerrado ante opciones globales Git ambiguas e inspeccionar paths de `git diff --no-index`;
- modelar operandos file de `grep`/`rg` y denegar opciones de `rg` que ejecutan externos o leen comprimidos;
- añadir casos positivos, negativos y de falso positivo.

**Fuera de alcance:** un parser de shell nuevo, excepciones de lectura para `git config` y un patrón global que bloquee todo `.claude/settings.json`.

**Criterios de finalización:**

- las tres clases protegidas se deniegan en acceso directo, absoluto y canónico;
- `<project>/.claude/settings.json` se lee cuando las demás capas lo permiten;
- todas las formas semánticas previstas de `git config` se deniegan;
- menciones textuales y nombres parecidos no activan el deny contextual;
- pruebas focales y gates integrales pasan.

**Rollback:** revertir la ampliación de la matriz, la lógica contextual y sus tests; reinstalar Claude para regenerar el guard. No existe migración persistente.

**Dependencias:** Unidad 1.

**Carga de revisión:** media-alta; combina canonicalización y análisis semántico, con blast radius acotado al guard y a dos rutas compartidas.

## 11. Riesgos y asunciones

| Tipo | Elemento | Mitigación / estado |
|---|---|---|
| Riesgo alto | Un error en la precedencia podría convertir un deny en ask/allow | Una única función de decisión, denies previos a la política y tests de solapamiento |
| Riesgo alto | `stdout` adicional invalida el contrato del hook | Helper único de emisión y aserción byte a byte |
| Riesgo medio | Canonicalizar paths inexistentes o enlazados puede crear diferencias entre plataformas | Reutilizar el algoritmo de ancestro existente y probar ruta relativa, absoluta, inexistente y symlink |
| Riesgo medio | Un parser semántico incompleto podría no reconocer un wrapper, opción global Git u operando file | Reutilizar `invocationStages`, `invocationCommands` y `gitSubcommand`; opciones ambiguas y ejecución externa de `rg` siguen fail-closed |
| Riesgo medio | Añadir `.claude/settings.json` a la matriz global bloquearía el settings de proyecto | No añadir ese glob; materializar únicamente la identidad de usuario en Claude |
| Asunción | El proceso del hook se ejecuta con cwd igual a la raíz del proyecto | Contrato operativo existente indicado por la entrada; la excepción se calcula en runtime |
| Asunción | El allow de un hook no supera deny/ask de settings | Confirmado por documentación oficial de Claude consultada el 2026-08-05 |

No hay preguntas abiertas bloqueantes.

## 12. Bitácora de cambios

| Versión | Fecha | Cambio |
|---|---|---|
| 1.1 | 2026-08-05 | Alineación con la implementación final verificada: auto-allow solo sobre raw, hardening Git/grep/rg y cierre adversarial |
| 1.0 | 2026-08-05 | Diseño inicial de política Bash ternaria y protección contextual de configuraciones sensibles |
