import YAML from "yaml"

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export interface MarkdownDocument {
  frontmatter: Record<string, unknown>
  body: string
}

export function parseMarkdown(input: string): MarkdownDocument {
  const match = FRONTMATTER.exec(input)
  if (!match) {
    return { frontmatter: {}, body: input.trim() }
  }

  const parsed = YAML.parse(match[1] ?? "")
  if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) {
    throw new Error("La cabecera `frontmatter` debe ser un objeto YAML")
  }

  return {
    frontmatter: (parsed ?? {}) as Record<string, unknown>,
    body: input.slice(match[0].length).trim(),
  }
}

export function renderMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const yaml = YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd()
  return `---\n${yaml}\n---\n\n${body.trim()}\n`
}

export function frontmatterString(
  frontmatter: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  const value = frontmatter[key]
  return typeof value === "string" ? value.trim() : fallback
}
