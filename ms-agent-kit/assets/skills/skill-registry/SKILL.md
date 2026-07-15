---
name: skill-registry
description: "Indexa skills instaladas en roots estándar por nombre, trigger y ruta exacta. Úsala después de instalar, quitar, mover o crear skills, o cuando un orquestador necesite elegir qué skills cargar."
---

# Skill Registry

Mantén un único índice local de skills instaladas en las roots estándar que puedan consultar los orquestadores de OpenCode, Claude Code y Codex.

## Contrato

- El registry es un índice, no una versión compactada de las skills.
- `SKILL.md` sigue siendo la fuente de verdad.
- Escribe `.atl/skill-registry.md` y usa `.atl/.skill-registry.cache.json` para la huella.
- No declares `target` ni generes archivos por cliente.
- Registra nombre, descripción completa, scope y ruta exacta.
- Deduplica por `name`: una skill del proyecto gana sobre cualquier copia de usuario; entre roots del mismo scope gana la primera.
- Excluye `skill-registry` y los workflows internos `ms-architect`, `ms-continue`, `ms-doctor`, `ms-models`, `ms-shared`, `ms-skill-creator`, `ms-skills` y `ms-status`.
- Mantén `ms-project-init`: es una skill portable que sí puede seleccionar un orquestador.
- No cargues una skill solo por nombre. Cruza la descripción con la tarea real.
- Al delegar, pasa rutas exactas de `SKILL.md`; no pegues resúmenes largos.

## Roots

Escanea un solo nivel con el layout `<root>/<skill>/SKILL.md`. Primero revisa las roots del proyecto:

- `skills/<skill>/SKILL.md`
- `.opencode/skills/<skill>/SKILL.md`
- `.claude/skills/<skill>/SKILL.md`
- `.codex/skills/<skill>/SKILL.md`
- `.agents/skills/<skill>/SKILL.md`

Después escanea las roots de usuario:

- `~/.agents/skills/<skill>/SKILL.md`
- `~/.config/opencode/skills/<skill>/SKILL.md`
- `~/.claude/skills/<skill>/SKILL.md`
- `~/.codex/skills/<skill>/SKILL.md`

El registro puede contener rutas nativas de distintos clientes porque solo sirve para resolver qué contrato leer. La instalación sigue copiando cada skill compatible a la raíz nativa de cada cliente. No indexa skills internas anidadas, built-ins ni caches de plugins: cada cliente gestiona esas capacidades fuera de este contrato portable.

En OpenCode, el plugin registra explícitamente las skills portables compatibles de `.agents/skills` del proyecto. Esto permite mantener `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` sin perder skills del repositorio.

## Formato

```markdown
# Skill Registry

> Schema: ms-skill-registry/v3
> Fingerprint: <sha256>
> Precedencia: una skill de proyecto reemplaza una skill global con el mismo nombre.
> Uso: índice común de skills instaladas en roots estándar de OpenCode, Claude Code y Codex.

| Skill | Trigger / descripción | Scope | Ruta |
|---|---|---|---|
| ... | ... | project | `.agents/skills/example/SKILL.md` |
```

## Resultado

Reporta la ruta del registry, cantidad de skills indexadas, huella y si se actualizó o hubo cache hit.
