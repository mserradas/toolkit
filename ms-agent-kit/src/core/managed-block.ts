import { TextDecoder } from "node:util"
import { hashContent } from "./files.js"

export type LeadingSeparator = "" | "\n" | "\r\n"

export interface ManagedBlockRange {
  markerStart: number
  markerEnd: number
}

export type ManagedBlockInspection =
  | { status: "absent" }
  | { status: "complete"; range: ManagedBlockRange }
  | { status: "incomplete" | "duplicate" | "inverted" | "multiple" }

export type ExternalSatisfaction = "absent" | "satisfied" | "conflict"

const BLOCK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/
const OPEN_PREFIX = "# >>> ms-agent-kit managed-block:"
const OPEN_SUFFIX = " >>>"
const CLOSE_PREFIX = "# <<< ms-agent-kit managed-block:"
const CLOSE_SUFFIX = " <<<"

interface Marker {
  kind: "open" | "close" | "invalid"
  id: string
  start: number
  end: number
}

export function validateBlockId(blockId: string): void {
  if (!BLOCK_ID_PATTERN.test(blockId)) {
    throw new Error(`Identificador de bloque administrado inválido: ${blockId}`)
  }
}

export function managedBlockMarkers(blockId: string): { open: string; close: string } {
  validateBlockId(blockId)
  return {
    open: `${OPEN_PREFIX}${blockId}${OPEN_SUFFIX}`,
    close: `${CLOSE_PREFIX}${blockId}${CLOSE_SUFFIX}`,
  }
}

function canonicalBody(body: Buffer): Buffer {
  if (body.length === 0 || body[body.length - 1] !== 0x0a) {
    return Buffer.concat([body, Buffer.from("\n")])
  }
  return body
}

export function renderManagedBlock(
  blockId: string,
  body: Buffer,
  leadingSeparator: LeadingSeparator = "",
): Buffer {
  const markers = managedBlockMarkers(blockId)
  return Buffer.concat([
    Buffer.from(leadingSeparator),
    Buffer.from(`${markers.open}\n`),
    canonicalBody(body),
    Buffer.from(`${markers.close}\n`),
  ])
}

function markerFromLine(line: Buffer, start: number, end: number): Marker | null {
  let contentEnd = line.length
  if (contentEnd > 0 && line[contentEnd - 1] === 0x0a) contentEnd -= 1
  if (contentEnd > 0 && line[contentEnd - 1] === 0x0d) contentEnd -= 1
  const text = line.subarray(0, contentEnd).toString("ascii")
  if (text.startsWith(OPEN_PREFIX) && text.endsWith(OPEN_SUFFIX)) {
    return { kind: "open", id: text.slice(OPEN_PREFIX.length, -OPEN_SUFFIX.length), start, end }
  }
  if (text.startsWith(CLOSE_PREFIX) && text.endsWith(CLOSE_SUFFIX)) {
    return { kind: "close", id: text.slice(CLOSE_PREFIX.length, -CLOSE_SUFFIX.length), start, end }
  }
  if (text.includes(OPEN_PREFIX) || text.includes(CLOSE_PREFIX)) {
    return { kind: "invalid", id: "", start, end }
  }
  return null
}

type MultilineString = "basic" | "literal" | null

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1
  }
  return backslashes % 2 === 1
}

function scanMultilineState(line: string, initial: MultilineString): MultilineString {
  let state = initial
  let cursor = 0
  while (cursor < line.length) {
    if (state) {
      const delimiter = state === "basic" ? '\"\"\"' : "'''"
      const closing = line.indexOf(delimiter, cursor)
      if (closing === -1) return state
      if (state === "basic" && isEscaped(line, closing)) {
        cursor = closing + 1
        continue
      }
      state = null
      cursor = closing + delimiter.length
      continue
    }

    const character = line[cursor]!
    if (character === "#") return null
    if (line.startsWith('\"\"\"', cursor)) {
      state = "basic"
      cursor += 3
      continue
    }
    if (line.startsWith("'''", cursor)) {
      state = "literal"
      cursor += 3
      continue
    }
    if (character === '"' || character === "'") {
      const quote = character
      cursor += 1
      while (cursor < line.length) {
        if (line[cursor] === quote && (quote === "'" || !isEscaped(line, cursor))) {
          cursor += 1
          break
        }
        cursor += 1
      }
      continue
    }
    cursor += 1
  }
  return state
}

function findMarkers(content: Buffer): Marker[] {
  const markers: Marker[] = []
  let start = 0
  let multiline: MultilineString = null
  for (let index = 0; index <= content.length; index += 1) {
    if (index !== content.length && content[index] !== 0x0a) continue
    const end = index === content.length ? index : index + 1
    const line = content.subarray(start, end)
    const marker = markerFromLine(line, start, end)
    if (marker) {
      markers.push(multiline ? { ...marker, kind: "invalid" } : marker)
    }
    multiline = scanMultilineState(line.toString("utf8"), multiline)
    start = end
  }
  return markers
}

export function inspectManagedBlock(content: Buffer, blockId: string): ManagedBlockInspection {
  validateBlockId(blockId)
  const markers = findMarkers(content)
  if (markers.length === 0) return { status: "absent" }
  if (markers.some((marker) => marker.kind === "invalid")) return { status: "incomplete" }

  const matching = markers.filter((marker) => marker.id === blockId)
  if (matching.length === 0) return { status: "multiple" }
  if (markers.some((marker) => marker.id !== blockId)) return { status: "multiple" }

  const opens = matching.filter((marker) => marker.kind === "open")
  const closes = matching.filter((marker) => marker.kind === "close")
  if (opens.length === 0 || closes.length === 0) return { status: "incomplete" }
  if (opens.length > 1 || closes.length > 1) return { status: "duplicate" }
  const open = opens[0]!
  const close = closes[0]!
  if (close.start < open.start) return { status: "inverted" }
  return { status: "complete", range: { markerStart: open.start, markerEnd: close.end } }
}

function separatorBuffer(separator: LeadingSeparator): Buffer {
  return Buffer.from(separator)
}

export function ownedRange(
  content: Buffer,
  range: ManagedBlockRange,
  leadingSeparator: LeadingSeparator,
): { start: number; end: number; content: Buffer; hash: string } | null {
  const separator = separatorBuffer(leadingSeparator)
  const start = range.markerStart - separator.length
  if (start < 0 || !content.subarray(start, range.markerStart).equals(separator)) return null
  const owned = content.subarray(start, range.markerEnd)
  return { start, end: range.markerEnd, content: owned, hash: hashContent(owned) }
}

export function chooseLeadingSeparator(content: Buffer): LeadingSeparator {
  if (content.length === 0 || content[content.length - 1] === 0x0a) return ""
  return content.includes(Buffer.from("\r\n")) ? "\r\n" : "\n"
}

export function insertManagedBlock(
  content: Buffer,
  blockId: string,
  body: Buffer,
  leadingSeparator = chooseLeadingSeparator(content),
): Buffer {
  return Buffer.concat([content, renderManagedBlock(blockId, body, leadingSeparator)])
}

export function replaceManagedBlock(
  content: Buffer,
  range: ManagedBlockRange,
  blockId: string,
  body: Buffer,
  leadingSeparator: LeadingSeparator,
): Buffer {
  const owned = ownedRange(content, range, leadingSeparator)
  if (!owned) throw new Error("El separador del bloque administrado cambió")
  return Buffer.concat([
    content.subarray(0, owned.start),
    renderManagedBlock(blockId, body, leadingSeparator),
    content.subarray(owned.end),
  ])
}

export function removeManagedBlock(
  content: Buffer,
  range: ManagedBlockRange,
  leadingSeparator: LeadingSeparator,
): Buffer {
  const owned = ownedRange(content, range, leadingSeparator)
  if (!owned) throw new Error("El separador del bloque administrado cambió")
  return Buffer.concat([content.subarray(0, owned.start), content.subarray(owned.end)])
}

function withoutRange(content: Buffer, range?: ManagedBlockRange): Buffer {
  if (!range) return content
  return Buffer.concat([content.subarray(0, range.markerStart), content.subarray(range.markerEnd)])
}

function simpleTomlString(value: string): string | null {
  const match = value.match(/^(["'])([^"'\\\r\n]*)\1$/)
  return match ? match[2]! : null
}

function parseInlineHeaders(value: string): Map<string, string> | null {
  const match = value.match(/^\{([\s\S]*)\}$/)
  if (!match) return null
  const entries = new Map<string, string>()
  const source = match[1]!.trim()
  if (source === "") return entries
  for (const part of source.split(",")) {
    const assignment = part.match(/^\s*(?:([A-Za-z0-9_-]+)|(["'])([^"'\\\r\n]*)\2)\s*=\s*(.*?)\s*$/)
    if (!assignment) return null
    const key = assignment[1] ?? assignment[3]!
    const parsedValue = simpleTomlString(assignment[4]!)
    if (parsedValue === null || entries.has(key)) return null
    entries.set(key, parsedValue)
  }
  return entries
}

interface ParsedTomlKeyPath {
  segments: Array<string | null>
  quoted: boolean
}

function parseTomlKeyPath(
  source: string,
  terminator: "assignment" | "end",
): ParsedTomlKeyPath | null {
  const segments: Array<string | null> = []
  let quoted = false
  let cursor = 0
  const skipWhitespace = (): void => {
    while (cursor < source.length && /\s/.test(source[cursor]!)) cursor += 1
  }

  skipWhitespace()
  if (source[cursor] === "#") return null
  while (cursor < source.length) {
    skipWhitespace()
    const character = source[cursor]
    let segment = ""
    let ambiguous = false
    if (character === '"' || character === "'") {
      quoted = true
      const quote = character
      cursor += 1
      while (cursor < source.length && source[cursor] !== quote) {
        if (quote === '"' && source[cursor] === "\\") {
          ambiguous = true
          cursor += 1
          if (cursor >= source.length) return null
        }
        segment += source[cursor]!
        cursor += 1
      }
      if (source[cursor] !== quote) return null
      cursor += 1
    } else {
      const start = cursor
      while (cursor < source.length && /[A-Za-z0-9_-]/.test(source[cursor]!)) cursor += 1
      if (cursor === start) return null
      segment = source.slice(start, cursor)
    }
    segments.push(ambiguous ? null : segment)
    skipWhitespace()
    if (source[cursor] === ".") {
      cursor += 1
      continue
    }
    if (terminator === "assignment") {
      return source[cursor] === "=" ? { segments, quoted } : null
    }
    return cursor === source.length ? { segments, quoted } : null
  }
  return null
}

export function inspectExternalCodexContext7(
  content: Buffer,
  excludedRange?: ManagedBlockRange,
): ExternalSatisfaction {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(withoutRange(content, excludedRange))
  } catch {
    return "conflict"
  }

  const lines = text.split(/\r?\n/)
  let inContext7 = false
  let tables = 0
  let url: string | null = null
  let headers: Map<string, string> | null = null
  let urlCount = 0
  let headersCount = 0
  let currentTable: Array<string | null> = []

  for (const line of lines) {
    const header = line.match(/^\s*\[([\s\S]*?)\]\s*(?:#.*)?$/)
    if (header) {
      const source = header[1]!
      const name = source.replace(/\s+/g, "")
      const parsed = parseTomlKeyPath(source, "end")
      if (!parsed) {
        if (
          (name.includes("mcp_servers") && name.includes("context7")) ||
          (source.includes("\\") && /mcp|context7/i.test(source))
        ) {
          return "conflict"
        }
        currentTable = []
        inContext7 = false
        continue
      }
      const [root, child] = parsed.segments
      const targetsContext7 =
        (root === "mcp_servers" || root === null) &&
        (child === "context7" || child === null)
      if (targetsContext7 && parsed.segments.length >= 2) {
        if (
          parsed.segments.length !== 2 ||
          parsed.quoted ||
          root === null ||
          child === null
        ) {
          return "conflict"
        }
      }
      if (
        name !== "mcp_servers.context7" &&
        name.includes("mcp_servers") &&
        name.includes("context7")
      ) {
        return "conflict"
      }
      currentTable = parsed.segments
      inContext7 = name === "mcp_servers.context7" && !parsed.quoted
      if (inContext7) tables += 1
      continue
    }
    if (/^\s*\[/.test(line) && line.includes("mcp_servers") && line.includes("context7")) {
      return "conflict"
    }
    const parsedAssignment = parseTomlKeyPath(line, "assignment")
    if (!inContext7 && parsedAssignment) {
      const assignmentKey = parsedAssignment.segments
      const [root, child] = assignmentKey
      if (
        currentTable.length === 0 &&
        ((root === "mcp_servers" &&
          (assignmentKey.length === 1 || child === "context7" || child === null)) ||
          (root === null &&
            (child === "context7" ||
              child === null ||
              line.includes("context7") ||
              (assignmentKey.length === 1 &&
                /=\s*\{/.test(line) &&
                /mcp|context7/i.test(line)))))
      ) {
        return "conflict"
      }
      if (
        (currentTable[0] === "mcp_servers" || currentTable[0] === null) &&
        (root === "context7" || root === null)
      ) {
        return "conflict"
      }
    }
    if (!inContext7 || /^\s*(?:#.*)?$/.test(line)) continue

    const assignment = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.*?)\s*(?:#.*)?$/)
    if (!assignment) return "conflict"
    const key = assignment[1]!
    const value = assignment[2]!
    if (key === "url") {
      urlCount += 1
      url = simpleTomlString(value)
      if (url === null) return "conflict"
    } else if (key === "env_http_headers") {
      headersCount += 1
      headers = parseInlineHeaders(value)
      if (!headers) return "conflict"
    }
  }

  if (tables === 0) return "absent"
  if (tables !== 1 || urlCount !== 1 || headersCount !== 1) return "conflict"
  return url === "https://mcp.context7.com/mcp" &&
    headers?.get("CONTEXT7_API_KEY") === "CONTEXT7_API_KEY"
    ? "satisfied"
    : "conflict"
}
