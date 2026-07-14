---
description: Refresca o revisa el índice de skills del proyecto
agent: ms-codex
---

Eres `ms-codex` ejecutando `/ms-skills`.

Argumento: `$ARGUMENTS`

## Objetivo

Mantener un índice local de skills inspirado en Gentle AI, pero simple: `.atl/skill-registry.md`.

Modos:

- Sin argumentos o `refresh`: escanea skills y escribe `.atl/skill-registry.md`.
- `check` o `list`: escanea y reporta sin escribir.

## Alcance Permitido

Puedes escribir solo:

- `.atl/skill-registry.md`

No edites:

- skills existentes,
- agentes,
- comandos,
- `opencode.json`,
- `tui.json`,
- `.gitignore`,
- archivos de código del proyecto.

No ejecutes instalaciones ni comandos mutantes. Usa lectura/glob/grep y herramientas de edición de OpenCode. Si necesitas crear `.atl/`, hazlo únicamente como parte de escribir `.atl/skill-registry.md`.

## Fuentes A Escanear

Escanea si existen:

- `.agents/skills/*/SKILL.md`
- `skills/*/SKILL.md`
- `.opencode/skills/*/SKILL.md`
- `.claude/skills/*/SKILL.md`
- `~/.agents/skills/*/SKILL.md`
- `~/.config/opencode/skills/*/SKILL.md`
- `~/.codex/skills/*/SKILL.md`
- `~/.claude/skills/*/SKILL.md`

## Reglas

- Lee solo frontmatter y primeras líneas necesarias para extraer `name` y `description`.
- Si falta `name`, usa el nombre de carpeta.
- Si falta `description`, marca `sin description`.
- Deduplica por `name`; prioridad: proyecto > usuario y, dentro del mismo scope, `.agents/skills` > rutas específicas de cliente.
- Excluye `_shared`, `skill-registry` y `sdd-*` salvo que `$ARGUMENTS` incluya `--include-internal`.
- Usa rutas absolutas en la tabla para que `ms-architect` pueda pasarlas a subagentes.
- No resumas la skill ni inventes triggers.

## Formato Del Archivo

```markdown
# Skill Registry

> Generated: YYYY-MM-DD
> Source: /ms-skills
> Contract: índice de skills; cada `SKILL.md` sigue siendo la fuente de verdad.

| Skill | Scope | Trigger / description | Path |
|---|---|---|---|
| cognitive-doc-design | user | Diseña documentación clara... | /Users/.../SKILL.md |
```

## Salida

Devuelve:

```text
## MS Skills

Modo: refresh | check
Registry: .atl/skill-registry.md | no escrito
Skills indexadas: <n>
Duplicados omitidos: <n>
Rutas escaneadas:
  - <ruta>: <n>
Observaciones:
  - <faltan descriptions, duplicados, rutas no existentes, etc.>
```

Termina con resumen breve de cambios. No incluyas contenido completo del registry en la respuesta.
