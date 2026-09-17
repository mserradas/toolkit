---
name: ms-doctor
description: Diagnostica OpenCode, sus agentes ms-*, comandos, skills y permisos
agent: ms-architect
---

Eres `ms-architect` ejecutando `/ms-doctor` en OpenCode. Este diagnóstico es de solo lectura.

Argumento: `$ARGUMENTS`

## Reglas

- No edites archivos, crees artefactos, instales dependencias ni invoques subagentes.
- No ejecutes verificaciones del proyecto. Usa solo lectura, `rg`, `jq`, git read-only y `opencode debug`. El diagnóstico funciona sin el instalador del kit ni un comando global.
- Presupuesto agregado de salida de herramientas: <= 16 KiB (16384 bytes) en modo normal; <= 32 KiB (32768 bytes) con `full`. Lleva la cuenta de máximos reservados incluyendo errores y lecturas de archivos, sin inventar un consumo medido. Antes de cada consulta reserva su máximo; si no cabe, detente y marca lo pendiente como `no comprobado`. `full` amplía cobertura, nunca detalle ni cuerpos.
- Proyecta JSON dentro de la misma tubería antes de incorporarlo al chat. Nunca ejecutes debug sin filtro ni uses `head` sobre JSON crudo. Los filtros siguientes limitan bytes UTF-8, incluida la nueva línea; no aumentes sus topes. Acota también cualquier consulta adicional al presupuesto restante.
- Si `opencode debug` no está disponible, falla sin JSON válido o faltan permisos/`jq`, declara el límite y continúa con consultas focales por archivos. Una tubería sin JSON de salida queda `no comprobado`, aunque `jq` termine con código 0. No vuelques ni reintentes con salida completa. Un JSON válido con `ok: false` es evidencia de problemas, aunque el comando termine con código 1.
- No leas prompts de agentes ni `content` de skills en una configuración correcta. Solo ante una inconsistencia concreta lee el fragmento imprescindible, dentro del presupuesto y sin secretos. Un dato omitido, truncado o no acreditado queda `no comprobado`, nunca OK por inferencia.

## 1. Carga nativa resumida

Valida los siete agentes mínimos: `ms-architect`, `ms-codex`, `ms-fastlane`, `ms-tester`, `ms-debugger`, `ms-plan` y `ms-discovery`. Con `full`, cubre todos los `ms-*` del inventario de nombres. Usa una consulta por agente, cambiando solo el nombre; no cargues sus archivos completos para obtenerlo. Inspecciona el scope de la tarea; no inspecciones usuario y proyecto sin motivo.

```sh
opencode debug agent ms-architect 2>/dev/null | jq -c --argjson cap 1536 '
{name, mode, color, model, variant: (.variant // "no comprobado"), steps: (.steps // "no comprobado"),
 tools: (if (.tools | type) == "object" and ([.tools[] | type == "boolean"] | all) then
   {enabled: ([.tools[] | select(.)] | length), disabled: ([.tools[] | select(. == false)] | length),
    core: (.tools | with_entries(select(.key | IN("read","bash","edit","write","task","skill","question","todowrite","webfetch","websearch"))))}
   else "no comprobado" end),
 permissions: (if (.permission | type) == "array" then
   .permission | group_by(.permission) | map({key: .[0].permission, value:
     ((group_by(.action) | map({key: .[0].action, value: length}) | from_entries)
      + {default: ([.[] | select(.pattern == "*") | .action] | last), last: .[-1].action})}) | from_entries
   else "no comprobado" end)}
| if (tojson | utf8bytelength) + 1 <= $cap then . else {status:"no comprobado",reason:"presupuesto de salida"} end
' 2>/dev/null
```

`tools.core` muestra disponibilidad, no autorización para cada invocación. En permisos, los recuentos por acción, el último wildcard (`default`) y la última acción (`last`) permiten detectar discrepancias, pero no acreditan equivalencia de patrones ni precedencia de todas las reglas. Ante un bloqueo concreto, comprueba por consulta focal la regla que lo causa; proyecta solo `permission`, `pattern`, `action` para la herramienta afectada, con el mismo guard de bytes. Si no cabe, registra `no comprobado`.

Cuenta skills efectivamente visibles con esta consulta; no sumes instalaciones de Claude o Codex. `total` cuenta todo el catálogo y `items` muestra una página de cuatro metadatos. Cambia `offset` solo si una inconsistencia requiere otra página; nunca incluyas `content`.

```sh
opencode debug skill 2>/dev/null | jq -c --argjson cap 2048 --argjson offset 0 '
if type == "array" then
  {total: length, offset: $offset, items: .[$offset:$offset+4] | map({name: .name[:64], description: .description[:96], location: .location[:160]})}
else {status:"no comprobado",reason:"formato de skills inesperado"} end
| if (tojson | utf8bytelength) + 1 <= $cap then . else {status:"no comprobado",reason:"presupuesto de salida"} end
' 2>/dev/null
```

## 2. Modelos

Usa `model` y `variant` de la consulta anterior como configuración resuelta por OpenCode. Para una discrepancia, lee solo esos campos del frontmatter del agente y de la configuración aplicable; conserva la fuente de cada dato. El modelo y esfuerzo efectivos de la sesión siguen `no comprobado` sin observación real. No inicies sesiones, cambies modelos ni infieras integridad administrada a partir de la presencia de un archivo.

## 3. Comprobaciones focales

Usa el presupuesto restante para lo no acreditado: JSON válido de `~/.config/opencode/opencode.json` y `tui.json`, reglas compartidas incorporadas una sola vez, comandos `ms-status` y `ms-doctor`, notificaciones propias de la TUI desactivadas, ausencia de `@mohak34/opencode-notifier` y MCP `context7` sin clave literal. En scope de proyecto usa las rutas equivalentes bajo `.opencode/` y su configuración.

Consulta primero existencia, claves, recuentos o booleanos mediante `jq`/`rg`; no vuelques configuración, catálogos, prompts ni credenciales. Para reglas compartidas usa recuentos de sus marcadores, no el cuerpo. Lee fragmentos solo si aparece una inconsistencia. Un plugin configurado no demuestra carga de caché; un MCP configurado no demuestra conectividad. Identifica cada límite en el informe.

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
No comprobado: <datos omitidos o pendientes y motivo>
Salida de herramientas: <máximo reservado / presupuesto; consumo real no medido>
Riesgos: <solo riesgos reales>
Acciones recomendadas: <acciones concretas o "ninguna">
```
