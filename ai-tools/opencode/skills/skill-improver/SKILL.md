---
name: skill-improver
description: "Audita y mejora skills existentes. Úsala para reviews de calidad de skills, claridad de triggers, fixes de frontmatter, recorte de cuerpo, gates de decisión y refactors LLM-first."
---

# Skill Improver

Usa esta skill al auditar o mejorar archivos `SKILL.md` existentes.

## Modo Por Defecto

Por defecto, audita sin modificar. Edita archivos solo cuando el usuario pida aplicar cambios explícitamente.

## Checklist De Auditoría

- El frontmatter tiene `name` válido y `description` de una línea.
- `description` incluye contextos de activación concretos.
- El cuerpo es operativo, no tutorial.
- Las reglas son específicas y verificables.
- Los gates de decisión usan tablas cuando hay ramificación real.
- El contrato de salida es explícito.
- Ejemplos o contexto largo se mueven a `references/` o `assets/`.
- Las referencias apuntan a archivos locales y solo se cargan cuando aportan.
- No hay policy, trigger o regla de dominio inventada.

## Severidad

| Severidad | Significado |
|---|---|
| Alta | La skill puede disparar mal, no disparar cuando debe o causar comportamiento inseguro |
| Media | La skill funciona, pero gasta contexto o deja ambigüedad importante |
| Baja | Mejora de estilo, claridad o mantenibilidad |

## Contrato De Salida

Devuelve:

- Skills auditadas y rutas.
- Hallazgos agrupados por severidad.
- Cambios exactos propuestos.
- Archivos modificados, solo si se pidió modo apply.
- Ambigüedades que requieren decisión humana.
