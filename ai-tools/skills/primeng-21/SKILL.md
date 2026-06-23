---
name: primeng-21
description: >
  Este skill guia a un LLM para crear y refactorizar UI en Angular v21 usando PrimeNG como libreria de componentes. Trigger: Usar cuando el usuario pida construir, ajustar o revisar componentes UI con PrimeNG, o solicite buenas prácticas y antipatrones de uso de PrimeNG.
license: Apache-2.0
metadata:
  author: mserradas
  version: "1.0"
  auto_invoke: "Desarrollo de UI con PrimeNG"
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, WebFetch, WebSearch, Task
---

## Objetivo

- Usar PrimeNG para componentes UI sin romper el tema.
- Mantener consistencia visual, accesibilidad y performance.

## Flujo base

1. Identificar el componente PrimeNG adecuado antes de escribir HTML custom.
2. Importar el modulo PrimeNG en el componente standalone y usarlo en la plantilla.
3. Aplicar personalización con `class` (no se permite `styleClass`) y/o `pt` según soporte del componente.
4. Ajustar tema/tokens antes de sobrescribir clases internas.
5. Verificar accesibilidad (labels, foco, aria) y estados (loading/disabled).

## Buenas practicas

- Usar PrimeNG para controles interactivos (inputs, tablas, dialogs, overlays).
- **No usar `styleClass`**: usar `class` para contenedores y `pt` para estilos internos; mantener overrides locales.
- Reutilizar tokens del tema (CSS vars) para color/espaciado.
- Mantener jerarquia visual con tipografia del tema; evitar mezclar tipografias.
- Consultar props, slots y eventos en la documentacion de PrimeNG antes de crear wrappers.
- Coordinar con el skill `angular-21` para patrones de Angular (standalone, OnPush, signals).
- Coordinar con el skill `tailwind-4` solo si se usa Tailwind en el layout.

## Antipatrones

- Reimplementar componentes ya disponibles en PrimeNG.
- Usar `styleClass` en componentes PrimeNG.
- Sobrescribir clases internas con selectores profundos o `!important` (incluye `::ng-deep`).
- Mezclar frameworks de UI o estilos globales que rompan el tema.
- Usar inline styles o CSS ad-hoc para layout en lugar de utilidades consistentes.
- Acoplar logica de negocio a componentes presentacionales.
