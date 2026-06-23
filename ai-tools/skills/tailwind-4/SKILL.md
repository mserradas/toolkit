---
name: tailwind-4
description: >
  Este skill guia a un LLM para aplicar buenas prácticas y evitar antipatrones al usar Tailwind CSS v4 en un proyecto Angular (con PrimeNG en el stack), enfocado en layout, espaciado y utilidades. Trigger: Usar cuando se pida trabajar con Tailwind 4 en la UI del proyecto (layout, estilos, ajustes visuales) o revisar prácticas/antipatrones de Tailwind.
license: Apache-2.0
metadata:
  author: mserradas
  version: "1.0"
  auto_invoke: "Buenas prácticas de Tailwind CSS v4"
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, WebFetch, WebSearch, Task
---

## Objetivo

- Aplicar Tailwind 4 para layout y utilidades sin romper el tema del proyecto.
- Mantener consistencia visual, accesibilidad y performance.

## Flujo base

1. Definir el layout con utilidades (grid/flex/spacing) antes de escribir CSS custom.
2. Usar clases en `class` y mantener overrides locales y predecibles.
3. Preferir tokens/vars del tema para colores y tipografia.
4. Evitar estilos globales cuando no sean imprescindibles.

## Buenas practicas

- Usar Tailwind para layout, espaciado y tipografia; no tocar estilos internos de la libreria de componentes.
- Centralizar reglas repetidas en clases reutilizables o `@apply` cuando sea estable.
- Mantener consistencia de escala (spacing/typography) con las utilidades del proyecto.
- Respetar estados accesibles (focus, hover, disabled) y contrastes del tema.
- Verificar responsividad con breakpoints definidos en Tailwind.
- Coordinar con el skill `primeng-21` cuando haya que ajustar componentes PrimeNG.

## Antipatrones

- Sobrescribir estilos internos de la libreria de componentes con selectores profundos o `!important`.
- Duplicar estilos: mezclar CSS custom innecesario con utilidades equivalentes.
- Romper el tema: colores o tipografias que ignoran tokens/vars.
- Usar clases excesivas en un solo elemento sin necesidad (dificulta mantenimiento).
- Repetir combinaciones largas sin extraer utilidades reutilizables.
