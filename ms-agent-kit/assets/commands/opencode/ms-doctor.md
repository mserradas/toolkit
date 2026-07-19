---
name: ms-doctor
description: Diagnostica OpenCode, sus agentes ms-*, comandos, skills y permisos
agent: ms-architect
---

Eres `ms-architect` ejecutando `/ms-doctor` en OpenCode. Este diagnóstico es de solo lectura.

Argumento: `$ARGUMENTS`

## Reglas

- No edites archivos, crees artefactos, instales dependencias ni invoques subagentes.
- No ejecutes verificaciones del proyecto. Usa solo lectura, `rg`, `jq`, git read-only y `opencode debug`.
- Si un comando falla o requiere permisos no disponibles, registra el límite y continúa por archivos.

## Inspección

Revisa solo el contexto OpenCode:

- `~/.config/opencode/opencode.json`, `tui.json` y `opencode-notifier.json` cuando existan.
- `~/.config/opencode/agents/ms-*.md`, `commands/ms-*.md`, `skills/*/SKILL.md` y `docs/agents*.md`.
- En scope de proyecto, las rutas equivalentes bajo `.opencode/` y la configuración OpenCode del repositorio.

Valida con `opencode debug agent` los siete agentes mínimos: `ms-architect`, `ms-codex`, `ms-fastlane`, `ms-tester`, `ms-debugger`, `ms-plan` y `ms-discovery`. Con argumento `full`, valida todos los `ms-*`. Usa `opencode debug skill` para contar las skills efectivamente visibles; no sumes instalaciones de Claude o Codex.

Comprueba JSON válido, carga y color de agentes, permisos por rol, denegaciones finales de secretos, reglas compartidas incorporadas una sola vez, comandos `ms-status`, `ms-continue` y `ms-doctor`, plugins declarados y MCP `context7` sin clave literal.

## Salida

```text
## MS Doctor · OpenCode
Estado general: OK | advertencias | requiere atención

Config: <resumen>
Agentes: <tabla de carga y permisos>
Comandos: <tabla breve>
Skills efectivas en OpenCode: <n>
Plugins / cache: <resumen>
MCP: <resumen>
Riesgos: <solo riesgos reales>
Acciones recomendadas: <acciones concretas o "ninguna">
```
