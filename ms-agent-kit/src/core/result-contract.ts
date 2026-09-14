/** Kept self-contained so the installed Claude guard embeds this exact validator. */
export function validateResultContract(message: unknown): Record<string, unknown> {
  const fail = (reason: string): never => { throw new Error(`Cierre bloqueado: ${reason}`) }
  if (typeof message !== "string" || message.length > 65_536) fail("contrato ausente o mayor de 65536 caracteres")
  const text = message as string
  const title = /^(?:#{1,6} )?Contrato para ms-architect\s*$/gm
  const titles = [...text.matchAll(title)]
  if (titles.length === 0) fail("falta Contrato para ms-architect")
  if (titles.length !== 1) fail("contrato duplicado o ambiguo")
  const tail = text.slice(titles[0]!.index! + titles[0]![0].length).trim()
  const block = /^```(?:yaml|json)\r?\n([\s\S]*?)\r?\n```$/.exec(tail)
  if (!block || block[1]!.includes("```")) fail("usa un único bloque terminal yaml o json después del título")

  // JSON.parse validates grammar; this token pass additionally rejects duplicate keys
  // (including escaped spellings) and bounds nesting before parsing.
  const json = (source: string): unknown => {
    const scopes: Array<Set<string> | null> = []
    const tokens = source.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g) ?? []
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]!
      if (token === "{" || token === "[") {
        scopes.push(token === "{" ? new Set() : null)
        if (scopes.length > 8) fail("JSON supera 8 niveles")
      } else if (token === "}" || token === "]") scopes.pop()
      else if (token.startsWith('"') && tokens[index + 1] === ":") {
        let key: string
        try { key = JSON.parse(token) as string } catch { return fail("JSON inválido") }
        const keys = scopes.at(-1)
        if (keys?.has(key)) fail("campo JSON duplicado")
        keys?.add(key)
      }
    }
    try { return JSON.parse(source) as unknown } catch { return fail("JSON inválido") }
  }
  const scalar = (source: string): unknown => {
    if (source.startsWith('"') || source.startsWith("[")) return json(source)
    if (source.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(source)) fail("string YAML inválido")
      return source.slice(1, -1).replaceAll("''", "'")
    }
    if (source === "null") return null
    if (!source || /^[!&*>{|%@`]/.test(source) || /:\s|\s#|[\[\]{}]/.test(source)) {
      fail("YAML fuera del formato cerrado; usa JSON para valores complejos")
    }
    return source
  }
  const source = block![1]!.trim()
  let parsed: unknown
  if (source.startsWith("{")) parsed = json(source)
  else {
    const mapping: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    let list: unknown[] | undefined
    for (const line of source.split(/\r?\n/)) {
      if (!line.trim()) continue
      const item = /^  - (.+)$/.exec(line)
      if (item && list) { list.push(scalar(item[1]!)); continue }
      const field = /^([a-z_]+):(?: (.+))?$/.exec(line)
      if (!field) fail("YAML fuera del formato cerrado; usa JSON para verification anidado")
      const key = field![1]!
      if (Object.hasOwn(mapping, key)) fail("campo YAML duplicado")
      list = field![2] === undefined ? [] : undefined
      mapping[key] = list ?? scalar(field![2]!)
    }
    parsed = mapping
  }
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
  const string = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 100 && value.every(string)
  if (!object(parsed)) fail("el contrato debe ser un objeto")
  const contract = parsed as Record<string, unknown>
  const fields = ["status", "summary", "evidence", "blockers", "risks", "questions", "next_action", "verification"]
  for (const key of Object.keys(contract)) if (!fields.includes(key)) fail("campo desconocido en contrato")
  if (typeof contract.status !== "string" || !["completed", "partial", "blocked", "needs_user_input", "failed", "not_applicable"].includes(contract.status)) fail("estado terminal inválido")
  if (!string(contract.summary)) fail("summary debe describir el resultado")
  for (const key of ["evidence", "blockers", "risks", "questions"]) if (!strings(contract[key])) fail(`${key} debe ser una lista de textos no vacíos (máximo 100)`)
  if (contract.next_action !== null && !string(contract.next_action)) fail("next_action debe ser texto o null")
  const evidence = contract.evidence as string[]
  const blockers = contract.blockers as string[]
  const questions = contract.questions as string[]
  // Omission is accepted for legacy contracts; the parent still checks gate coverage.
  const gates = contract.verification ?? []
  if (contract.verification === null || !Array.isArray(gates) || gates.length > 100) fail("verification debe ser una lista de hasta 100 gates")
  const identifiers = new Set<string>()
  for (const gate of gates as unknown[]) {
    if (!object(gate)) fail("cada gate debe ser un objeto")
    const check = gate as Record<string, unknown>
    for (const key of Object.keys(check)) if (!["gate", "owner", "required", "command", "result", "evidence", "workspace"].includes(key)) fail("campo desconocido de gate")
    if (!string(check.gate) || !string(check.owner)) fail("gate y owner deben ser textos no vacíos")
    if (identifiers.has(check.gate as string)) fail("gate duplicado: asigna un único propietario")
    identifiers.add(check.gate as string)
    if (typeof check.required !== "boolean") fail("required debe ser booleano")
    if (!Object.hasOwn(check, "command") || (check.command !== null && !string(check.command))) fail("command debe ser texto o null")
    if (!Object.hasOwn(check, "workspace") || (check.workspace !== null && !string(check.workspace))) fail("workspace debe ser texto o null")
    if (typeof check.result !== "string" || !["PASS", "FAIL", "TIMEOUT", "NOT_RUN"].includes(check.result)) fail("result debe ser PASS, FAIL, TIMEOUT o NOT_RUN")
    if (!strings(check.evidence) || (check.result !== "NOT_RUN" && check.evidence.length === 0)) fail("el resultado ejecutado requiere evidence")
    if (contract.status === "completed" && check.required && check.result !== "PASS") fail("completed exige PASS en todos los gates obligatorios")
  }
  if (contract.status === "completed" && (!evidence.length || blockers.length || questions.length)) fail("completed exige evidencia y blockers/questions vacíos")
  if (["partial", "blocked", "failed"].includes(String(contract.status)) && (!blockers.length || !string(contract.next_action))) fail("partial, blocked y failed requieren blockers y next_action")
  if (contract.status === "needs_user_input" && !questions.length) fail("needs_user_input requiere preguntas concretas")
  return contract
}
