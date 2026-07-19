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
- `~/.codex/skills/*/SKILL.md`, limitando el inventario a las skills administradas por el kit ms-*.
- En scope de proyecto, `.codex/config.toml`, `.codex/agents/`, `.codex/rules/`, `.agents/skills/` y los `AGENTS.md` aplicables.

Comprueba TOML y frontmatter válidos; agentes personalizados presentes y con roles coherentes; workers sin capacidad de subdelegación; política de secretos instalada; skills `ms-architect`, `ms-status`, `ms-continue` y `ms-doctor` legibles; e instrucciones `AGENTS.md` sin contradicciones evidentes con el kit. Con argumento `full`, incluye todos los agentes; en otro caso usa los siete mínimos.

No inspecciones OpenCode ni Claude Code, no ejecutes `opencode debug` y no cuentes skills internas, plugins o cachés ajenos al kit.

## Salida

```text
## MS Doctor · Codex
Estado general: OK | advertencias | requiere atención

Config: <resumen>
Agentes personalizados: <tabla de estructura y rol>
Skills administradas por el kit ms-*: <n válidas>/<n instaladas>
Reglas de secretos: <resumen>
AGENTS.md aplicables: <resumen>
Riesgos: <solo riesgos reales>
Acciones recomendadas: <acciones concretas o "ninguna">
```
