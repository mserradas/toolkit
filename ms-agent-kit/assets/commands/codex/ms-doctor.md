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

- `~/.codex/config.toml`, `agents/ms-*.toml`.
- `~/.ms-agent-kit/state.json` y los `~/.codex/skills/*/SKILL.md` que registre para Codex.
- En scope de proyecto, `.codex/config.toml`, `.codex/agents/`, `.agents/skills/` y los `AGENTS.md` aplicables.

Sin argumento `full`, valida estos siete roles mínimos:

- skill principal `ms-architect`;
- agentes TOML `ms-codex`, `ms-fastlane`, `ms-tester`, `ms-debugger`, `ms-plan` y `ms-discovery`.

Con argumento `full`, valida la skill principal y los 11 agentes TOML `ms-*`.

## Modelos

Lee solo `model` y `model_reasoning_effort` del TOML del agente afectado y los ajustes aplicables de Codex, indicando sus rutas. Un valor omitido se hereda de la tarea padre. Estos archivos acreditan configuración declarada, no el modelo efectivo de una sesión ni coincidencia con el catálogo del kit. `ms-architect` es una skill que hereda el modelo y el esfuerzo de la tarea principal; la skill no los impone. Sin observación real de sesión, el efectivo sigue `no comprobado`. Limita la salida a 2048 bytes; no vuelques prompts, configuración completa ni secretos. El kit no impone un contador de ciclos ni ordena detenerse al alcanzar uno. No cambies modelo o esfuerzo ni inicies sesiones para diagnosticar. El diagnóstico funciona sin el instalador del kit ni un comando global.

## Permisos Efectivos

El kit no genera `default_permissions`, tablas `permissions`, `sandbox_mode`, `approval_policy` ni `web_search` en sus agentes. La ausencia de `rules/ms-secrets.rules` es esperada: esa política antigua se retira durante la actualización administrada.

Los agentes heredan los permisos y ajustes de la tarea padre. Distingue archivos declarados y permisos efectivos observados; sin datos de la sesión, marca estos últimos como `no comprobado`. Las instrucciones de rol y las preferencias documentales o de verificación no conceden acceso nativo. No recomiendes crear perfiles por rol ni amplíes permisos por conjetura.

`unknown` en efectos o runtime no constituye una denegación ni exige otra aprobación para una verificación ya autorizada. No ejecutes comandos del proyecto durante doctor.

## Conteos Y Checks

- Cuenta como administrados únicamente los registros de `~/.ms-agent-kit/state.json` cuyo `target` sea `codex` o cuyo array `targets` contenga `codex`, cuyo tipo sea `skill` o `command` y cuya ruta esté bajo `~/.codex/skills/`. Verifica que cada archivo exista y tenga frontmatter válido.
- Si el estado no existe o no es legible, etiqueta el conteo como `visibles`, no `administradas`, y cuenta solo `~/.codex/skills/*/SKILL.md`; excluye `.system`, plugins, caches y otros clientes.
- Comprueba TOML válido, roles coherentes, prohibición instructiva de subdelegación, skills `ms-architect`, `ms-status` y `ms-doctor` legibles, e instrucciones `AGENTS.md` realmente aplicables al workspace.
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
Agentes personalizados: <tabla con modelo, herencia y estado efectivo>
Skills administradas por el kit ms-*: <n válidas>/<n instaladas>
Permisos nativos: <observados o no comprobados>
AGENTS.md aplicables: <resumen>
Riesgos: <solo riesgos reales>
Limitaciones del entorno: <sandbox, red, terminal o "ninguna">
Acciones recomendadas: <acciones concretas o "ninguna">
```
