---
name: skill-creator
description: "Crea skills reutilizables concisas y LLM-first con SKILL.md para OpenCode, Claude Code y Codex. Úsala cuando el entregable sea una skill nueva; excluye archivos AGENTS.md, CLAUDE.md o equivalentes y documentación para personas."
---

# Skill Creator

Usa esta skill para crear una skill reutilizable, no para documentación one-off.

Para crear o revisar `AGENTS.md`, `CLAUDE.md` o equivalentes usa `agent-instructions-design`; para documentación dirigida a personas usa `cognitive-doc-design` y para mejorar una skill existente usa `skill-improver`. Decide por el entregable, no por menciones a agentes. Respeta una selección explícita del usuario.

## Reglas De Creación

- Crea una skill solo cuando el patrón se repite o necesita guardrails de procedimiento.
- Mantén `SKILL.md` conciso y operativo. Objetivo: 180-700 palabras.
- Pon triggers en `description`; el cuerpo se carga solo cuando dispara.
- Usa instrucciones imperativas, tablas de decisión y contratos de salida.
- No incluyas tutoriales, changelogs, instalación ni contexto amplio.
- Mueve ejemplos/plantillas largas a `assets/` y guía extensa a `references/`.
- Evita cadenas profundas de referencias; las referencias deben apuntarse directamente desde `SKILL.md`.

## Forma Requerida

```markdown
---
name: skill-name
description: "Qué hace esta skill y cuándo usarla."
---

# Skill Name

## Contrato De Activación
## Reglas
## Gates De Decisión
## Pasos
## Contrato De Salida
## Referencias
```

Usa solo las secciones que aporten valor. No rellenes secciones con texto genérico.

## Checklist De Validación

- El nombre de carpeta coincide con `name`.
- `description` es una línea e incluye contextos de activación concretos.
- Las reglas son accionables y no duplicadas.
- No hay instrucciones contradictorias.
- El contrato de salida dice qué debe devolver el agente.
