---
name: ms-doctor
description: Diagnostica Codex, sus agentes ms-*, skills, reglas y configuración
agent: ms-architect
---

Eres `ms-architect` ejecutando `$ms-doctor` en Codex. Este diagnóstico es de solo lectura y se ejecuta en la tarea principal.

Argumento: `$ARGUMENTS`

## Reglas

- No edites archivos, crees artefactos, instales dependencias ni invoques subagentes.
- No ejecutes verificaciones del proyecto. Usa solo lectura y comandos de diagnóstico de Codex disponibles.
- Respeta el sandbox actual. Reporta por separado lo confirmado, lo inferido por archivos y lo no verificable.

## Inspección

Revisa solo el contexto Codex:

- `~/.codex/config.toml`, `agents/ms-*.toml` y `rules/ms-secrets.rules`.
- `~/.ms-agent-kit/state.json` y los `~/.codex/skills/*/SKILL.md` que registre para Codex.
- En scope de proyecto, `.codex/config.toml`, `.codex/agents/`, `.codex/rules/`, `.agents/skills/` y los `AGENTS.md` aplicables.

Sin argumento `full`, valida estos siete roles mínimos:

- skill principal `ms-architect`;
- agentes TOML `ms-codex`, `ms-fastlane`, `ms-tester`, `ms-debugger`, `ms-plan` y `ms-discovery`.

Con argumento `full`, valida la skill principal y los 12 agentes TOML `ms-*`.

## Permisos Efectivos

No clasifiques un agente usando solo `extends`. Resuelve el perfil indicado por `default_permissions` así:

1. Aplica primero el perfil padre declarado en `extends`.
2. Aplica después las reglas del perfil hijo en `filesystem`.
3. Conserva las denegaciones de secretos; una concesión amplia no debe anularlas.

`extends = ":read-only"` es compatible con un productor cuando el perfil hijo concede `write` en todas sus rutas de ownership:

| Agente | Escrituras requeridas |
|---|---|
| `ms-plan` | `docs/prd/**` |
| `ms-designer` | `docs/design/**` |
| `ms-progress` | `.atl/status/**`, `.gitignore` |
| `ms-spec` | `docs/spec/**` |
| `ms-writer` | `README.md`, `CHANGELOG.md`, `docs/changelog/**`, `docs/guides/**`, `docs/api/**`, `docs/release-notes/**` |

Marca incompatibilidad solo si falta una concesión requerida, una denegación la bloquea o Codex rechaza el perfil. No recomiendes cambiar estos agentes a `:workspace` cuando los overrides acotados están completos.

Para `ms-tester`, `:read-only` es intencional: puede ejecutar verificaciones que no escriben. Indica una limitación condicional, no una incompatibilidad, si un comando concreto del proyecto necesita generar cachés o artefactos; no ejecutes ese comando durante doctor ni amplíes permisos por conjetura.

## Conteos Y Checks

- Cuenta como administrados únicamente los registros de `~/.ms-agent-kit/state.json` cuyo owner incluya `codex`, cuyo tipo sea `skill` o `command` y cuya ruta esté bajo `~/.codex/skills/`. Verifica que cada archivo exista y tenga frontmatter válido.
- Si el estado no existe o no es legible, etiqueta el conteo como `visibles`, no `administradas`, y cuenta solo `~/.codex/skills/*/SKILL.md`; excluye `.system`, plugins, caches y otros clientes.
- Comprueba TOML válido, roles coherentes, prohibición instructiva de subdelegación, política de secretos instalada, skills `ms-architect`, `ms-status`, `ms-continue` y `ms-doctor` legibles, e instrucciones `AGENTS.md` realmente aplicables al workspace.
- Puedes ejecutar `codex --strict-config doctor --json --all`. Trata fallos de red, WebSocket, `TERM=dumb`, aliases de PATH o bases inaccesibles desde el sandbox como límites del entorno hasta reproducirlos fuera de él.

No inspecciones OpenCode ni Claude Code, no ejecutes `opencode debug` y no cuentes skills internas, plugins o cachés ajenos al kit.

## Severidad

- `requiere atención`: fallo confirmado del kit que impide cargar o cumplir un rol.
- `advertencias`: riesgo real y accionable del kit que no bloquea todos los roles.
- `OK`: configuración del kit coherente; las limitaciones exclusivas del sandbox se reportan aparte y no cambian este estado.

## Salida

```text
## MS Doctor · Codex
Estado general: OK | advertencias | requiere atención

Config: <resumen>
Agentes personalizados: <tabla con perfil base, overrides de escritura y estado efectivo>
Skills administradas por el kit ms-*: <n válidas>/<n instaladas>
Reglas de secretos: <resumen>
AGENTS.md aplicables: <resumen>
Riesgos: <solo riesgos reales>
Limitaciones del entorno: <sandbox, red, terminal o "ninguna">
Acciones recomendadas: <acciones concretas o "ninguna">
```
