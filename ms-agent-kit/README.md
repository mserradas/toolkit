# ms-agent-kit

Instalador TypeScript ligero para distribuir el flujo `ms-*` en OpenCode, Claude Code y Codex.

El proyecto toma de Gentle AI cuatro ideas que sí aportan valor a una configuración personal: catálogo declarativo, adaptadores por plataforma, estado de propiedad y backups antes de sobrescribir. Deja fuera el auto-updater, la instalación de binarios y la gestión de cuentas o proveedores.

## Qué instala

| Plataforma | Agentes | Workflows | Skills | Extra |
|---|---|---|---|---|
| OpenCode | Markdown nativo en `agents/` | Comandos `/ms-*` | Skills aisladas en `opencode/skills` | Config, TUI, plugins, Context7, notifier y permisos |
| Claude Code | Subagentes Markdown | Skills invocables como `/ms-*` | Skills nativas | Límites de tools y guard `PreToolUse` |
| Codex | 12 especialistas como custom agents TOML | Skills invocables como `$ms-*` | Skills en `.agents/skills` | Perfiles, `web_search`, reglas best-effort y `$ms-architect` como orquestador padre |

El catálogo incluido contiene 13 agentes, 5 comandos, 10 skills, las reglas compartidas y una configuración reproducible de OpenCode.
OpenCode y Claude materializan los 13 agentes. Codex materializa 12 especialistas delegables y adapta `ms-architect` exclusivamente como skill de la tarea padre, evitando que un subagente orquestador quede bloqueado por la profundidad de delegación predeterminada.

## Requisitos

- Node.js 24 o superior.
- `pnpm` para desarrollar el proyecto. El binario compilado funciona con Node.js sin `pnpm`.
- OpenCode, Claude Code y/o Codex ya instalados según los targets elegidos. El instalador configura las herramientas; no instala sus binarios.
- Codex `0.138.0` o superior para los perfiles de permisos. Si la configuración global define `sandbox_mode`, Codex prioriza ese modo y no activa `default_permissions`; el instalador no lo elimina automáticamente.

## Desarrollo

```bash
pnpm install
pnpm build
pnpm test
node dist/cli.js doctor
```

## Uso

Abre el asistente interactivo sin compilar el proyecto:

```bash
pnpm start
```

El asistente permite elegir OpenCode, Claude Code, Codex o todos; después pregunta si la instalación será global o de proyecto, muestra el plan y solicita confirmación antes de escribir. Cuando el paquete esté instalado o enlazado como CLI, el mismo flujo se abre ejecutando solo `ms-agent-kit`.

Primero revisa el plan:

```bash
node dist/cli.js plan --target all --scope user
```

Instala en la configuración global del usuario:

```bash
node dist/cli.js install --target all --scope user
```

Instala solo en un proyecto:

```bash
node dist/cli.js install \
  --target opencode,claude,codex \
  --scope project \
  --project /ruta/al/repositorio
```

En automatización o CI añade `--yes`. `--dry-run` convierte `install` en una inspección sin escrituras.

## OpenCode desde cero

La instalación global de OpenCode crea:

- `opencode.json` con plugins versionados, permisos globales, instrucciones y Context7.
- `openai/gpt-5.6-sol` como modelo global y `ms-architect` como agente predeterminado.
- `tui.json` con tus preferencias y `opencode-subagent-statusline`.
- `opencode-notifier.json` con avisos de finalización, permisos, errores, preguntas y salida de plan; las notificaciones se suprimen mientras OpenCode está enfocado.
- `package.json` con el SDK requerido por plugins TypeScript locales.
- Los plugins locales `ms-model-variants.ts` y `ms-skill-registry.ts`, agentes, comandos y documentación; las skills se instalan en `~/.config/opencode/skills`.

Context7 no guarda la clave en disco. Define la variable antes de iniciar OpenCode:

```bash
export CONTEXT7_API_KEY="tu-clave"
```

Después de ejecutar `install`, inicia OpenCode normalmente. OpenCode usa Bun para descargar automáticamente `@mohak34/opencode-notifier@0.2.8`, `opencode-subagent-statusline@1.2.0` y las dependencias del plugin local.

El esquema de OpenCode no admite `variant` en la raíz de `opencode.json`. La variante `high` se configura en el frontmatter de `ms-architect`; como es el agente predeterminado, las sesiones nuevas usan `openai/gpt-5.6-sol` con esa variante.

En `--scope project`, `opencode.json` y `tui.json` se escriben en la raíz del proyecto, mientras que agentes, skills, plugins y `package.json` viven en `.opencode/`. `opencode-notifier.json` solo se instala en scope global porque el plugin usa una ubicación global.

OpenCode, Codex y Claude mantienen copias físicas separadas de las diez skills portables de usuario. Esto permite aislar sus catálogos globales: OpenCode usa `opencode/skills`, Codex `.agents/skills` y Claude `.claude/skills`. En un repositorio, `.agents/skills` se trata como raíz portable compartida y se añade a cada registro. La adaptación `ms-skill-creator` queda reservada a Codex; OpenCode conserva el nombre nativo `skill-creator`.

Cuando OpenCode y Codex conviven, inicia OpenCode con `OPENCODE_DISABLE_EXTERNAL_SKILLS=1`. Así OpenCode no escanea los catálogos globales `~/.agents/skills` y `~/.claude/skills`, donde viven adaptaciones exclusivas de otros clientes. El plugin `ms-skill-registry.ts` vuelve a registrar explícitamente solo las skills compatibles de `.agents/skills` del repositorio actual, por lo que las skills de proyecto siguen disponibles. `ms-shared` no se instala como skill pública en Codex: sus reglas ya están embebidas donde se usan.

```bash
# Bash/Zsh
export OPENCODE_DISABLE_EXTERNAL_SKILLS=1

# Fish, persistente para el usuario
set -Ux OPENCODE_DISABLE_EXTERNAL_SKILLS 1
```

Al actualizar desde la instalación compartida anterior, el plan crea las copias privadas de OpenCode y desvincula su propiedad de `.agents/skills` sin borrar las copias que pertenecen a Codex. Los archivos modificados después de la instalación se omiten y nunca se borran automáticamente.

## Comandos

| Comando | Función |
|---|---|
| `list` | Muestra el catálogo incluido |
| `doctor` | Valida catálogo, instalación administrada, duplicados y reglas de secretos |
| `plan` | Clasifica cada destino como crear, actualizar, adoptar, sin cambios o conflicto |
| `install` | Aplica el plan de forma transaccional |
| `status` | Detecta archivos correctos, modificados o ausentes |
| `uninstall` | Elimina archivos creados y restaura archivos reemplazados |
| `workflow status` | Lee un ledger `ms-progress/v1` sin inferir estado desde prosa |
| `workflow next` | Devuelve una única próxima acción segura o detiene el flujo |
| `review fingerprint` | Calcula una huella SHA-256 del worktree (o staged) sin exponer el diff |
| `skill-registry refresh` | Refresca `.atl/skill-registry.md` con cache y precedencia de proyecto |

Opciones comunes:

```text
--target opencode|claude|codex|all
--scope user|project
--project /ruta
--home /home/alternativo
--force
--yes
--json
```

## Invocación por plataforma

OpenCode mantiene la experiencia original:

```text
/ms-status mi-cambio
/ms-continue mi-cambio
@ms-scout localiza el flujo de autenticación
```

Claude Code expone los workflows como slash skills. Cada `/ms-*` se ejecuta en un contexto aislado con el agente declarado por el workflow; los flujos generales usan `ms-architect` y `/ms-skills` usa `ms-codex` con escritura limitada al registro. También puedes iniciar una sesión completa con el arquitecto como agente principal:

```text
/ms-status mi-cambio
/ms-continue mi-cambio
claude --agent ms-architect
```

Codex usa skills para ejecutar workflows desde la tarea padre. Esto permite que el arquitecto delegue directamente sin aumentar la profundidad de subagentes:

```text
$ms-architect implementa este cambio
$ms-status mi-cambio
$ms-continue mi-cambio
```

## Seguridad y conflictos

- El catálogo usa una lista cerrada. Empaqueta configuración portable, pero nunca `.env`, claves, credenciales, cachés, locks generados, `node_modules` ni estado de sesiones/plugins.
- OpenCode recibe permisos granulares autocontenidos por agente. Se preservan sus comandos permitidos y se añaden denegaciones para secretos.
- Los assets de agentes son la fuente canónica del prompt: solo contienen `description` y el cuerpo de instrucciones.
- `src/core/agent-catalog.ts` asigna modo, perfil de modelo y perfil de capacidades; `src/core/model-profiles.ts` y `src/core/profiles.ts` definen esos perfiles una sola vez para todos los adaptadores.
- OpenCode compone su política funcional desde `src/core/opencode-role-permissions.ts` y añade las denegaciones de secretos desde `src/core/permissions.ts`.
- Claude Code recibe `disallowedTools` por rol y un guard `PreToolUse` compartido. El guard bloquea secretos y comandos peligrosos también en agentes escritores, restringe las escrituras documentales y aplica una allowlist de Bash a los agentes de solo lectura. Cada workflow usa el guard del rol con el que se ejecuta.
- Codex recibe un perfil nativo por agente: `:read-only`, `:workspace` o lectura con rutas concretas de escritura, además de `web_search = "cached"|"disabled"`. `rules/ms-secrets.rules` bloquea una matriz best-effort de volcados del entorno y lectores habituales (`cat`, `head`, `sed`, `awk`, `rg` y `grep`) sobre variantes sensibles; `doctor` valida bloqueos y casos permitidos como `.env.example` y `README.md`.
- Los ejecutores pueden trabajar en el workspace, los agentes de lectura bloquean mutaciones directas y los documentadores solo escriben mediante las herramientas de edición en sus rutas asignadas.
- `.env.example` sigue permitido; entornos reales, credenciales, keychains, llaves privadas y directorios `secrets/` se bloquean.
- La carga del catálogo rechaza claves privadas y patrones comunes de tokens.
- Nunca se sobrescribe un archivo ajeno por defecto.
- `--force` guarda el contenido actual antes de sustituirlo.
- Cada escritura usa un archivo temporal y `rename` atómico.
- Los destinos y backups se validan contra roots permitidos y se rechazan symlinks.
- El estado se guarda con modo `0600` en `~/.ms-agent-kit/state.json` o `<proyecto>/.ms-agent-kit/state.json`.
- Los backups se guardan con modo `0600`; los agentes, skills, políticas y documentación usan `0644`.
- `uninstall` no toca un archivo que haya sido modificado después de instalarlo.

Los agentes incorporan una sola copia de las reglas compartidas y su política de permisos en el artefacto generado. OpenCode conserva `docs/agents-shared.md` como referencia humana, pero no lo vuelve a cargar globalmente. Claude Code y Codex no requieren modificar `settings.json`, `CLAUDE.md`, `AGENTS.md` ni `config.toml`. Para OpenCode, el instalador administra intencionalmente `opencode.json`, `tui.json` y los archivos de configuración indicados arriba.

Los hooks de Claude se aplican a los agentes `ms-*` y a sus slash workflows. Las sesiones normales de Claude Code fuera de esos componentes conservan los permisos definidos por el usuario en `~/.claude/settings.json`; el instalador no reemplaza ese archivo.

Las reglas de Codex son una defensa práctica, no un aislamiento absoluto frente a evasiones deliberadas mediante intérpretes, opciones o comandos indirectos. `execpolicy` solo expresa prefijos de tokens exactos: la matriz cubre cantidades, programas y patrones comunes, pero no puede representar cualquier variante arbitraria sin denegar globalmente usos seguros de `head`, `sed`, `awk`, `rg` o `grep`. Las versiones actuales tampoco permiten desactivar Bash, preguntas o el catálogo global de skills por custom agent, ni separar WebFetch de WebSearch; `web_search` sigue la capacidad `webSearch` más restrictiva. Además, los permisos y overrides activos de la tarea padre pueden prevalecer. El instalador conserva instrucciones explícitas, perfiles de filesystem y `execpolicy` para los casos habituales. Un bloqueo no eludible requiere una política administrada `requirements.toml` instalada por un administrador del sistema.

Si uno de esos archivos ya existe con contenido distinto, la instalación se detiene con conflicto. `--force` crea un backup y lo reemplaza completo; úsalo solo después de revisar `plan`. `uninstall` restaura el backup si el archivo no fue modificado posteriormente.

## Límites intencionales

El instalador distribuye el toolkit portable, no aplicaciones ni credenciales. No instala los binarios de OpenCode, Claude Code o Codex, no registra cuentas o proveedores y no persiste claves API. Context7 queda configurado mediante `{env:CONTEXT7_API_KEY}`; los paquetes externos se declaran, pero los descarga OpenCode al arrancar.

Los plugins locales `ms-model-variants.ts` y `ms-skill-registry.ts` sí se incluyen porque forman parte del comportamiento de los agentes en OpenCode y no contienen credenciales. El primero cachea durante 24 horas solo los providers conectados. El segundo mantiene el índice común `.atl/skill-registry.md` una vez inicializado y expone `ms_skill_registry_refresh` para que `/ms-skills` no dependa de un binario global. La primera ejecución explícita añade `.atl/` a `.gitignore`; Claude y Codex refrescan el mismo archivo mediante el fallback CLI.

La allowlist de Bash de Claude evita comandos directos de mutación, redirecciones, encadenamiento y expansión de shell en agentes de lectura. No convierte la ejecución de tests o scanners en un sandbox de filesystem: esas herramientas pueden generar cachés o reportes como parte de su comportamiento normal. Para aislamiento estricto usa el sandbox o una política administrada de Claude Code.

## Modelos

- OpenCode materializa el modelo y la variante definidos por el perfil central de cada agente.
- Claude Code usa `model: inherit` para respetar el modelo elegido en la sesión.
- Codex hereda el modelo de la tarea padre y materializa `model_reasoning_effort` desde el mismo perfil central.

Este criterio evita instalar identificadores de modelo que puedan no estar habilitados en otra cuenta.

## Referencias

- [Gentle AI](https://github.com/Gentleman-Programming/gentle-ai)
- [Agentes de OpenCode](https://opencode.ai/docs/agents/)
- [Permisos de OpenCode](https://opencode.ai/docs/permissions/)
- [Skills de OpenCode](https://opencode.ai/docs/skills)
- [Plugins de OpenCode](https://opencode.ai/docs/plugins/)
- [TUI de OpenCode](https://opencode.ai/docs/tui/)
- [MCP de OpenCode](https://opencode.ai/docs/mcp-servers/)
- [Subagentes de Claude Code](https://code.claude.com/docs/en/sub-agents)
- [Configuración y permisos de Claude Code](https://code.claude.com/docs/en/settings)
- [Skills de Claude Code](https://code.claude.com/docs/en/slash-commands)
- [Customización de Codex](https://learn.chatgpt.com/docs/customization/overview)
- [Subagentes de Codex](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Referencia de configuración de Codex](https://learn.chatgpt.com/docs/config-file/config-reference)
