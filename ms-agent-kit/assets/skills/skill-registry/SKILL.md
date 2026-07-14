---
name: skill-registry
description: "Indexa skills disponibles por nombre, trigger y ruta exacta. Úsala después de instalar, quitar, mover o crear skills, o cuando un orquestador necesite elegir qué skills cargar."
---

# Skill Registry

Usa esta skill para mantener un índice local de skills que puedan cargar agentes y subagentes sin resumir ni reescribir su intención.

## Reglas

- El registry es un índice, no una versión compactada de las skills.
- `SKILL.md` sigue siendo la fuente de verdad.
- Registra nombre, descripción completa, scope y ruta exacta.
- Deduplica por `name`; la skill de proyecto gana sobre la global.
- No indexes `_shared`, `skill-registry` ni skills `sdd-*` salvo que el usuario lo pida explícitamente.
- No cargues una skill por nombre solamente: cruza su descripción/trigger con la tarea real.
- Al delegar, pasa rutas exactas de `SKILL.md`; no pegues resúmenes largos.

## Scopes

| Scope | Rutas habituales |
|---|---|
| Proyecto | `.agents/skills/*/SKILL.md` (canónica), `skills/*/SKILL.md`, `.opencode/skills/*/SKILL.md`, `.claude/skills/*/SKILL.md` |
| Usuario | `~/.agents/skills/*/SKILL.md` (canónica), `~/.config/opencode/skills/*/SKILL.md`, `~/.codex/skills/*/SKILL.md`, `~/.claude/skills/*/SKILL.md` |

## Salida Recomendada

Escribe `.atl/skill-registry.md` con:

```markdown
# Skill Registry

> Generated: YYYY-MM-DD
> Source: /ms-skills

| Skill | Scope | Trigger / description | Path |
|---|---|---|---|
| ... | project | ... | /absolute/path/SKILL.md |
```

## Contrato

Reporta:

- ruta del registry,
- cantidad de skills indexadas,
- duplicados omitidos,
- rutas escaneadas,
- si el índice se escribió o solo se inspeccionó.
