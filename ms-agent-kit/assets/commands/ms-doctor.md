---
description: Diagnostica salud de OpenCode, agentes ms-*, skills, plugins y permisos
agent: ms-architect
---

Eres `ms-architect` ejecutando `/ms-doctor`. Este comando es de solo lectura.

Argumento: `$ARGUMENTS`

## Objetivo

Haz un health check práctico de la configuración OpenCode y, si aplica, del proyecto actual. No corrijas nada.

## Reglas

- No edites archivos.
- No crees artefactos.
- No instales dependencias.
- No ejecutes tests, linters, formatters, builds, servidores, migraciones, commits ni pushes.
- No invoques subagentes.
- Usa solo lectura, `rg`, `grep`, `jq`, git read-only y `opencode debug`.
- Si un comando no está permitido o falla, reporta el fallo y continúa con inspección por archivos.

## Inspección

Revisa lo mínimo necesario:

- `~/.config/opencode/opencode.json` si existe
- `~/.config/opencode/tui.json` si existe
- `~/.config/opencode/package.json` si existe
- `~/.config/opencode/opencode-notifier.json` si existe
- `~/.config/opencode/agents/ms-*.md`
- `~/.config/opencode/commands/*.md`
- `~/.config/opencode/docs/agents-shared.md`
- `~/.config/opencode/docs/agents.md`
- `~/.config/opencode/plugins/*.ts`
- `~/.config/opencode/cache/model-variants.json` si existe
- `skills/*/SKILL.md` y `.atl/skill-registry.md` si existe en el proyecto actual

Usa `opencode debug agent <agente>` para validar al menos:

- `ms-architect`
- `ms-codex`
- `ms-fastlane`
- `ms-tester`
- `ms-debugger`
- `ms-plan`
- `ms-discovery`

Si `$ARGUMENTS` incluye `full`, valida todos los agentes `ms-*`.

## Checks

Evalúa:

- JSON válido en `opencode.json`, `tui.json`, `package.json` y `opencode-notifier.json` cuando existan.
- Agentes cargan sin error.
- Colores válidos.
- `ms-architect` tiene `question: allow` y permisos de solo lectura.
- Subagentes no orquestadores tienen `task: deny`.
- Cada agente generado contiene denegaciones de secretos y `opencode.json` conserva la denylist global.
- `docs/agents-shared.md` está cargado en `instructions`.
- Comandos `/ms-status`, `/ms-models`, `/ms-doctor` y `/ms-skills` existen.
- Plugin `ms-model-variants` existe y el cache está presente o se informa cómo generarlo.
- Plugins npm Warp y notifier están declarados con versión.
- `opencode-subagent-statusline` está declarado y habilitado en `tui.json`.
- MCP `context7` está habilitado y usa `{env:CONTEXT7_API_KEY}` en vez de una clave literal.
- `package.json` declara una versión compatible de `@opencode-ai/plugin`.
- Skills instaladas tienen frontmatter mínimo `name` y `description`.
- Si existe `.atl/skill-registry.md`, parece actualizado respecto a skills locales.

## Salida

Devuelve:

```text
## MS Doctor

Estado general: OK | advertencias | requiere atención

Config:
  opencode.json: OK | no encontrado | fallo
  tui.json: OK | no encontrado | fallo
  instructions compartidas: OK | fallo
  permisos de secretos: OK | advertencia | fallo

Agentes:
| Agente | Carga | Permisos clave | Observación |
|---|---|---|---|

Comandos:
| Comando | Estado | Observación |
|---|---|---|

Skills:
  Instaladas: <n>
  Registry: encontrado | no encontrado | desactualizado | N/A
  Observaciones: []

Plugins / cache:
  ms-model-variants: OK | no encontrado | cache pendiente
  Warp: OK | no declarado
  notifier: OK | no declarado | config ausente
  subagent-statusline: OK | no declarado | deshabilitado

MCP:
  context7: OK | no configurado (opcional) | deshabilitado | fallo

Riesgos:
- <solo riesgos reales>

Acciones recomendadas:
1. <acción concreta o "ninguna">
```

Sé conciso. Prioriza fallos accionables sobre inventario largo.
