import { constants } from "node:fs"
import { access, readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { frontmatterString, parseMarkdown } from "./frontmatter.js"
import { assertNoEmbeddedSecrets } from "./security.js"
import type { Catalog, SourceFile, SourceMarkdown, SourceSkill } from "./types.js"

export const DEFAULT_ASSETS_ROOT = fileURLToPath(new URL("../../assets", import.meta.url))

async function sourceFile(root: string, absolutePath: string): Promise<SourceFile> {
  const content = await readFile(absolutePath)
  assertNoEmbeddedSecrets(content.toString("utf8"), absolutePath)
  const info = await stat(absolutePath)
  return {
    relativePath: path.relative(root, absolutePath),
    content,
    mode: info.mode & 0o777,
  }
}

async function recursiveFiles(root: string): Promise<SourceFile[]> {
  const output: SourceFile[] = []

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(`No se permiten symlinks en assets: ${absolutePath}`)
      }
      if (entry.isDirectory()) {
        await visit(absolutePath)
      } else if (entry.isFile()) {
        output.push(await sourceFile(root, absolutePath))
      }
    }
  }

  await visit(root)
  return output
}

async function markdownFiles(directory: string): Promise<SourceMarkdown[]> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .sort((left, right) => left.name.localeCompare(right.name))

  return Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name)
      const raw = await readFile(absolutePath, "utf8")
      assertNoEmbeddedSecrets(raw, absolutePath)
      const parsed = parseMarkdown(raw)
      const fallbackName = path.basename(entry.name, ".md")
      return {
        name: frontmatterString(parsed.frontmatter, "name", fallbackName),
        fileName: entry.name,
        raw,
        body: parsed.body,
        frontmatter: parsed.frontmatter,
      }
    }),
  )
}

async function skillFiles(directory: string): Promise<SourceSkill[]> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))

  return Promise.all(
    entries.map(async (entry) => {
      const skillRoot = path.join(directory, entry.name)
      const skillPath = path.join(skillRoot, "SKILL.md")
      await access(skillPath, constants.R_OK)
      const raw = await readFile(skillPath, "utf8")
      assertNoEmbeddedSecrets(raw, skillPath)
      const parsed = parseMarkdown(raw)
      const name = frontmatterString(parsed.frontmatter, "name", entry.name)
      if (name !== entry.name) {
        throw new Error(`La skill ${skillPath} declara name=${name}; debe coincidir con el directorio`)
      }
      return {
        name,
        fileName: "SKILL.md",
        raw,
        body: parsed.body,
        frontmatter: parsed.frontmatter,
        files: await recursiveFiles(skillRoot),
      }
    }),
  )
}

export async function loadCatalog(assetsRoot = DEFAULT_ASSETS_ROOT): Promise<Catalog> {
  const [
    agents,
    commands,
    skills,
    sharedRules,
    documentation,
    openCodeConfigFiles,
    openCodePlugins,
  ] =
    await Promise.all([
      markdownFiles(path.join(assetsRoot, "agents")),
      markdownFiles(path.join(assetsRoot, "commands")),
      skillFiles(path.join(assetsRoot, "skills")),
      readFile(path.join(assetsRoot, "docs", "agents-shared.md"), "utf8"),
      recursiveFiles(path.join(assetsRoot, "docs")),
      recursiveFiles(path.join(assetsRoot, "opencode", "config")),
      recursiveFiles(path.join(assetsRoot, "opencode", "plugins")),
    ])

  assertNoEmbeddedSecrets(sharedRules, path.join(assetsRoot, "docs", "agents-shared.md"))

  return {
    agents,
    commands,
    skills,
    sharedRules,
    documentation,
    openCodeConfigFiles,
    openCodePlugins,
  }
}
