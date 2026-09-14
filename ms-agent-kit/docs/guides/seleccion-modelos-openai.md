# Modelos OpenAI para los doce agentes de ms-agent-kit

La asignación propuesta conserva nueve de las doce combinaciones actuales. Recomienda probar Astra medium en `ms-debugger`, Astra high en `ms-security-auditor` y Terra medium en `ms-tester`. Mantiene Astra high en `ms-architect` y `ms-discovery`, Terra high en `ms-fastlane` y Sol medium en `ms-writer`.

Esta es una hipótesis práctica basada en las responsabilidades de los agentes y la evidencia publicada consultada el **2026-09-11**. No demuestra una configuración óptima ni una mejora de velocidad local. No se ejecutaron comparaciones A/B ni se aplicaron cambios.

El objetivo es reducir el tiempo hasta un resultado correcto. Ese tiempo incluye inferencia, herramientas, delegaciones, reintentos e intervención humana. Un modelo con mayor velocidad de emisión puede tardar más si produce más texto, toma decisiones incorrectas o necesita correcciones.

## Qué permiten concluir las fuentes

OpenAI presenta Astra como su modelo de mayor capacidad para trabajo de principio a fin. Dentro de la familia 5.6, Sol ocupa el nivel superior, Terra busca equilibrar capacidad y coste, y Luna prioriza el coste para volúmenes altos. Esta clasificación ayuda a elegir candidatos; no sustituye una evaluación de los agentes. [1], [2], [3], [4]

Los resultados de OpenAI muestran que la ventaja depende de la tarea. En Terminal-Bench 4.0, Astra obtiene 57,9 % frente a 37,3 % de Sol; en DeepSWE v1.1, 74,1 % frente a 72,7 %. Las diferencias son 20,6 y 1,4 puntos porcentuales, respectivamente. OpenAI declara las mejores puntuaciones a cualquier esfuerzo: no son resultados de una única variante high. No corresponde trasladarlos a cualquier tarea de programación ni atribuirlos a una variante concreta. [7]

El anuncio de la familia 5.6 publica 72,7 % para Sol, 69,6 % para Terra y 67,2 % para Luna en DeepSWE v1.1. Aunque coincida el nombre del benchmark, juntar anuncios de fechas distintas no crea una comparación controlada de los cuatro modelos. Tampoco debe compararse Terminal-Bench 2.1 con Terminal-Bench 4.0. [8]

La conclusión útil es limitada: Astra merece consideración para decisiones difíciles y trabajo ambiguo; Terra y Luna siguen siendo candidatos cuando la tarea está bien delimitada. La elección final requiere evaluar calidad antes de optimizar velocidad y coste. [6]

## Modelos, variantes y precios

Los siguientes precios son de la API estándar, en USD por millón de tokens. No representan el precio de una suscripción de ChatGPT ni permiten calcular directamente su consumo de cuota.

| Modelo e identificador para OpenCode | Esfuerzos documentados | Entrada | Entrada en caché | Salida |
|---|---|---:|---:|---:|
| Astra — `openai/gpt-6-astra` | low, medium, high, xhigh, max | 10,00 | 1,00 | 50,00 |
| Sol — `openai/gpt-5.6-sol` | none, low, medium, high, xhigh, max | 4,00 | 0,40 | 20,00 |
| Terra — `openai/gpt-5.6-terra` | none, low, medium, high, xhigh, max | 2,00 | 0,20 | 12,00 |
| Luna — `openai/gpt-5.6-luna` | none, low, medium, high, xhigh, max | 0,20 | 0,02 | 1,20 |

Fuentes: fichas oficiales de [Astra][1], [Sol][2], [Terra][3] y [Luna][4]. La ficha de Sol indica precios promocionales vigentes hasta al menos el 2026-11-21. Astra tiene condiciones adicionales para entradas superiores a 272.000 tokens; la tabla no modela esos casos.

El esfuerzo regula el trabajo interno de razonamiento. `high` no implica la misma capacidad ni un presupuesto fijo de tokens entre modelos. Aumentarlo puede elevar latencia y consumo, pero no garantiza una mejora proporcional de calidad. [5]

La siguiente interpretación es una propuesta de uso, no una garantía del proveedor:

| Esfuerzo | Cuándo probarlo |
|---|---|
| none | Extracción o formato mecánico con validación externa. No disponible oficialmente en Astra. |
| low | Operaciones claras, contexto acotado y criterios explícitos. |
| medium | Análisis habitual y decisiones de complejidad moderada. |
| high | Ambigüedad, consecuencias importantes o fallos observados con medium. |
| xhigh / max | Excepciones justificadas por evaluaciones; no un valor general por defecto. |

En el kit inspeccionado, [el esquema de configuración](/Users/mserradas/Workspace/toolkit/ms-agent-kit/src/core/kit-config.ts:48) admite únicamente `low`, `medium` y `high`. La propuesta respeta ese contrato. El [adaptador de OpenCode](/Users/mserradas/Workspace/toolkit/ms-agent-kit/src/adapters/opencode.ts:144) transmite `model` y `variant`.

Que el catálogo de OpenCode ofrezca más esfuerzos no amplía automáticamente el esquema del kit. Los alias `-fast` inspeccionados seleccionan `serviceTier: priority`; no son una familia de inteligencia adicional. La documentación de Fast distingue el nivel de servicio del esfuerzo, contempla sobreprecio y posible descenso a `default`, y no ofrece SLA de latencia para Astra. [21]

Asimismo, `ultra` en el anuncio de 5.6 describe coordinación multiagente y no debe tratarse como otro `reasoning_effort`. [8]

## Índices y velocidad: evidencia orientativa

Artificial Analysis publica estos valores del Intelligence Index v4.3:

| Modelo | none | low | medium | high | xhigh | max |
|---|---:|---:|---:|---:|---:|---:|
| Astra | — | 46 | 50 | 51 | 53 | 53 |
| Sol | 28† | 34 | 39 | 42 | 44 | 47 |
| Terra | 22† | 28 | 30 | 34 | 38 | 42 |
| Luna | 17† | 22 | 25 | 32 | 35 | 38 |

Fuentes: fichas de [Astra][9], [Sol][10], [Terra][11] y [Luna][12].

† AA marca estas cifras como estimaciones pendientes de evaluación independiente; las variantes con razonamiento aparecen sin esa marca. La inspección visual de los gráficos confirma el rayado únicamente en `Non-reasoning`/`none` de Sol, Terra y Luna. Astra `none` se excluye porque no figura entre los esfuerzos admitidos por su documentación oficial.

Son puntuaciones de un índice agregado, no porcentajes de éxito de estos agentes. La metodología v4.3 reúne diez evaluaciones. No corresponde comparar sus valores con los índices v4.1 o v4.1.1 de anuncios anteriores como si una bajada numérica significara una regresión. Una diferencia de un punto tampoco demuestra significancia estadística. [13]

Las fichas individuales permiten comparar seis candidatos:

| Opción | Índice v4.3 | Emisión, tokens/s | TTFT según FAQ |
|---|---:|---:|---:|
| [Astra low][14] | 46 | 51,2 | 2,44 s |
| [Astra medium][15] | 50 | 49,9 | 5,25 s |
| [Astra high][16] | 51 | 49,8 | 40,11 s |
| [Sol medium][17] | 39 | 56,6 | 5,06 s |
| [Terra high][18] | 34 | 79,1 | 3,19 s |
| [Luna medium][19] | 25 | 104,4 | 2,95 s |

Estas métricas describen mediciones publicadas de acceso por API. La emisión mide la salida después del primer fragmento; no es el tiempo total de resolución. El sitio distingue las métricas de primer token y de comienzo de respuesta, por lo que conservamos la etiqueta concreta “TTFT según FAQ”.

No se debe extrapolar el valor de Astra high a cada llamada ni convertir estas cifras en una aceleración del flujo de trabajo. Contexto, carga, servicio, cantidad de tokens y herramientas cambian el resultado. Tampoco establecen la experiencia de Codex u OpenCode bajo una suscripción.

## Asignación propuesta

La columna actual corresponde a la [configuración personal inspeccionada](/Users/mserradas/.ms-agent-kit/config.yaml), destinada a OpenCode. No acredita qué modelo usan sesiones ya abiertas. Las responsabilidades proceden de las definiciones locales en [assets/agents](/Users/mserradas/Workspace/toolkit/ms-agent-kit/assets/agents). Son transferibles como criterio de selección entre clientes; sus nombres de modelo y opciones no se trasladan automáticamente.

La confianza indicada se refiere al ajuste entre responsabilidad y modelo, no a una ganancia de velocidad: esta última no se ha medido para ninguna fila.

| Agente y responsabilidad | Actual | Base propuesta | Motivo y alternativa | Confianza |
|---|---|---|---|---|
| `ms-architect`: clasificar, coordinar, decidir y revisar evidencia | Astra high | Astra high | Un error de decisión propaga retrabajo. Probar medium en coordinación rutinaria. | Media-alta |
| `ms-discovery`: cuestionar supuestos y diseñar validación de producto | Astra high | Astra high | Conserva la preferencia de calidad en decisiones estratégicas. Medium sería un experimento para entrevistas breves. | Media |
| `ms-plan`: entrevistar y definir el qué y por qué en un PRD | Astra medium | Astra medium | Capacidad de síntesis sin elevar siempre el esfuerzo. High ante contradicciones estructurales. | Media-alta |
| `ms-designer`: decisiones persistentes, alternativas y TDD | Astra medium | Astra medium | Adecuado como punto inicial para comparar contratos y arquitectura. High si intervienen varios sistemas o restricciones incompatibles. | Media-alta |
| `ms-debugger`: reproducir, contrastar hipótesis y encontrar causa raíz | Terra high | **Astra medium** | Probar mayor capacidad de análisis ante incertidumbre. High para carreras o causas especialmente ambiguas. | Media |
| `ms-security-auditor`: revisión focal de permisos, autenticación y datos | Astra medium | **Astra high** | Preferencia de rigor por el coste de falsos negativos; sin benchmark que pruebe esta variante para el rol. Comparar medium en revisiones acotadas con riesgos conocidos. | Media |
| `ms-codex`: implementar una misión aprobada y verificarla | Terra high | Terra high | Encaja con especificaciones cerradas. Comparar Astra low en cambios claros y medium ante trabajo transversal o retrabajo. | Media-alta |
| `ms-spec`: comportamiento funcional y aceptación | Terra high | Terra high | Suficiente candidato cuando el PRD está aprobado. Astra medium ante conflictos semánticos. | Media |
| `ms-fastlane`: cambios claros de bajo riesgo y comprobación focal | Terra high | Terra high | Respeta la preferencia vigente. Probar medium en cambios mecánicos; devolver los casos fuera de alcance al arquitecto. | Media |
| `ms-scout`: mapa del repositorio, dependencias e impacto | Terra medium | Terra medium | La búsqueda dirigida y el contexto acotado favorecen este punto inicial. Astra low o medium para impacto transversal difícil. | Media-alta |
| `ms-tester`: ejecutar comprobaciones e interpretar resultados | Astra low | **Terra medium** | Candidato conservador para detectar toolchain, validar evidencia y clasificar fallos. Astra low si los logs o la evidencia requieren análisis más complejo. | Media |
| `ms-writer`: documentación de consumidor desde evidencia verificada | Sol medium | Sol medium | Prioriza claridad y coherencia editorial. Astra medium si aparecen contradicciones entre fuentes, devolviendo decisiones al arquitecto. | Media-alta |

La tabla no obliga a utilizar los cuatro modelos. Luna medium merece un piloto limitado en `ms-tester` cuando los comandos estén prescritos, las salidas sean acotadas y el sistema verifique los estados. El rol también valida la vigencia de un PASS y distingue fallos introducidos, preexistentes o indeterminados: no basta con leer el código de salida. Su menor coste no justifica adoptarlo antes de medir falsas aprobaciones. Cuando domina el tiempo de ejecución de comandos, cambiar de modelo puede tener poco efecto.

Astra high en arquitectura y discovery sigue siendo una elección de calidad. No hay evidencia local para afirmar que high termine antes que medium. Del mismo modo, el cambio en seguridad expresa una preferencia de rigor, no una mejora demostrada.

## Cómo validar los cambios

La primera ronda propuesta compara tres decisiones:

1. `ms-debugger`: Terra high frente a Astra medium.
2. `ms-tester`: Astra low frente a Terra medium.
3. `ms-architect`: Astra high frente a Astra medium.

Cuatro tareas representativas por rol, dos opciones y tres repeticiones producen **72 ejecuciones**. Es un diseño inicial, no un tamaño de muestra que garantice significancia. Conviene ejecutarlo por fases y detenerlo si aparecen falsas aprobaciones, incumplimientos de alcance o consumo incompatible con la cuota disponible.

Cada comparación debe conservar el mismo estado del repositorio, instrucciones, herramientas, permisos, límites, condiciones de caché y servicio. Alternar el orden reduce el sesgo de probar siempre una opción primero. Registrar cambios inevitables permite evitar conclusiones basadas en condiciones distintas.

Los casos deben evaluar el contrato real del agente:

- **Debugger:** causa conocida y estable, hipótesis plausibles y evidencia suficiente para descartar explicaciones incorrectas.
- **Tester:** resultados `PASS`, `FAIL`, `TIMEOUT` y `NOT_RUN`, además de denegaciones. Una comprobación no ejecutada nunca puede convertirse en aprobación.
- **Architect:** clasificación correcta, respeto del alcance, delegaciones necesarias y aceptación sustentada en evidencia.

La revisión debe separar fallos de razonamiento de bloqueos de entorno o política. Una denegación se registra y se respeta; no se intenta eludir para completar la muestra.

Medir primero correctitud en el primer intento y falsas aprobaciones. Después, tiempo total, mediana, rango observado, retrabajo, delegaciones, pasos, tokens e intervención humana. Con esta muestra inicial, un p90 sería poco estable: debe reservarse para una ampliación. En API se puede registrar coste; bajo suscripción, cuota consumida y bloqueos de uso son medidas distintas.

Una segunda ronda puede comparar Luna medium con Terra medium en tester si la primera establece un comportamiento fiable. La adopción debe exigir el nivel de calidad acordado y una reducción útil de tiempo o consumo; cualquier umbral elegido será un criterio operativo propio, no una ley estadística.

Antes de cambiar más modelos, conviene mantener un único responsable de cada verificación y eliminar lecturas o comprobaciones repetidas. OpenAI advierte que Astra puede sobreverificar tareas pequeñas cuando las instrucciones son excesivas. Ajustar el brief y las herramientas también forma parte de la optimización. [20]

## Fuentes

Todas las fuentes se consultaron el **2026-09-11**. Cuando no se indica fecha de publicación, la página consultada no aporta una fecha precisa en la evidencia utilizada.

1. OpenAI. [GPT-6 Astra — Model][1]. Documentación vigente.
2. OpenAI. [GPT-5.6 Sol — Model][2]. Documentación vigente.
3. OpenAI. [GPT-5.6 Terra — Model][3]. Documentación vigente.
4. OpenAI. [GPT-5.6 Luna — Model][4]. Documentación vigente.
5. OpenAI. [Reasoning models][5]. Documentación vigente.
6. OpenAI. [Model selection][6]. Documentación vigente.
7. OpenAI. [GPT-6 Astra][7]. Publicado el 2026-09-03.
8. OpenAI. [GPT-5.6][8]. Publicado el 2026-07-09; actualizaciones de precios del 2026-07-30 y 2026-08-21.
9. Artificial Analysis. [GPT-6 Astra — Release][9].
10. Artificial Analysis. [GPT-5.6 Sol — Release][10].
11. Artificial Analysis. [GPT-5.6 Terra — Release][11].
12. Artificial Analysis. [GPT-5.6 Luna — Release][12].
13. Artificial Analysis. [Intelligence benchmarking methodology][13]. Versión v4.3, septiembre de 2026.
14. Artificial Analysis. [GPT-6 Astra low][14].
15. Artificial Analysis. [GPT-6 Astra medium][15].
16. Artificial Analysis. [GPT-6 Astra high][16].
17. Artificial Analysis. [GPT-5.6 Sol medium][17].
18. Artificial Analysis. [GPT-5.6 Terra high][18].
19. Artificial Analysis. [GPT-5.6 Luna medium][19].
20. OpenAI. [Latest model guide][20]. Documentación vigente.
21. OpenAI. [Fast mode][21]. Documentación vigente.

[1]: https://developers.openai.com/api/docs/models/gpt-6-astra
[2]: https://developers.openai.com/api/docs/models/gpt-5.6-sol
[3]: https://developers.openai.com/api/docs/models/gpt-5.6-terra
[4]: https://developers.openai.com/api/docs/models/gpt-5.6-luna
[5]: https://developers.openai.com/api/docs/guides/reasoning
[6]: https://developers.openai.com/api/docs/guides/model-selection
[7]: https://openai.com/index/gpt-6-astra/
[8]: https://openai.com/index/gpt-5-6/
[9]: https://artificialanalysis.ai/models/releases/gpt-6-astra
[10]: https://artificialanalysis.ai/models/releases/gpt-5-6-sol
[11]: https://artificialanalysis.ai/models/releases/gpt-5-6-terra
[12]: https://artificialanalysis.ai/models/releases/gpt-5-6-luna
[13]: https://artificialanalysis.ai/methodology/intelligence-benchmarking
[14]: https://artificialanalysis.ai/models/gpt-6-astra-low
[15]: https://artificialanalysis.ai/models/gpt-6-astra-medium
[16]: https://artificialanalysis.ai/models/gpt-6-astra-high
[17]: https://artificialanalysis.ai/models/gpt-5-6-sol-medium
[18]: https://artificialanalysis.ai/models/gpt-5-6-terra-high
[19]: https://artificialanalysis.ai/models/gpt-5-6-luna-medium
[20]: https://developers.openai.com/api/docs/guides/latest-model
[21]: https://developers.openai.com/api/docs/guides/fast-mode
