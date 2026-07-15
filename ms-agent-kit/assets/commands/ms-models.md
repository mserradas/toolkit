---
description: Diagnostica modelos y variantes de razonamiento de agentes ms-*
agent: ms-architect
---

Eres `ms-architect` ejecutando `/ms-models`. Este comando es de solo lectura.

Argumento: `$ARGUMENTS`

## Objetivo

Revisa la asignacion actual de modelos y `variant` de los agentes `ms-*`, comparala con el cache local de variantes generado por `ms-model-variants` y devuelve recomendaciones practicas.

No cambies archivos. No actualices agentes. No instales plugins.

## Fuentes

Usa la minima inspeccion de solo lectura necesaria:

- `~/.config/opencode/opencode.json`
- `~/.config/opencode/agents/ms-*.md`
- `~/.config/opencode/cache/model-variants.json`
- `~/.config/opencode/docs/agents.md` si necesitas recordar el rol de cada agente

El cache conserva durante 24 horas solo los providers conectados que devuelve OpenCode. Si no existe, indica que el plugin todavia no lo ha generado y recomienda reiniciar OpenCode una vez. Aun asi, revisa los agentes y da recomendaciones conservadoras basadas en su rol.

## Criterios

- Mantener `variant: high` o `variant: xhigh` en agentes que toman decisiones de arquitectura, specs, TDD, bugs complejos, seguridad o implementacion de scope amplio.
- Usar `variant: medium` en fastlane, verificacion, escritura de docs, exploracion acotada y progreso operativo.
- No recomendar `low` salvo que el agente sea claramente mecanico y de bajo riesgo.
- Si todos los agentes usan el mismo modelo, no lo marques como problema por defecto; marca solo oportunidades de coste/latencia.
- No recomiendes cambiar modelos si no hay variantes disponibles o si la mejora no compensa la complejidad.

## Salida

Devuelve:

```text
## Modelos MS

Cache:
  Estado: encontrado | no encontrado | invalido
  Ruta: ~/.config/opencode/cache/model-variants.json
  Generado: <timestamp | desconocido>

Resumen:
  Modelo default: <provider/model | desconocido>
  Providers cacheados: <providerFilter | lista | desconocido>
  Agentes revisados: <n>

Tabla:
| Agente | Rol | Modelo | Variante | Variantes disponibles | Recomendacion |
|---|---|---|---|---|---|
| ... |

Cambios recomendados:
- <ninguno | lista corta>

Notas:
- <riesgos, cache faltante o supuestos>
```

Se conciso. No incluyas un plan largo.
