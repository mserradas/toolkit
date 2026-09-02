import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const defaultAssets = fileURLToPath(new URL("../", import.meta.url))

async function measure(assetsRoot) {
  const files = []
  async function visit(relative) {
    const entries = await readdir(path.join(assetsRoot, relative), { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const child = path.posix.join(relative, entry.name)
      if (entry.isDirectory()) await visit(child)
      else if (entry.isFile() && entry.name.endsWith(".md")) await add(child)
    }
  }
  async function add(relative) {
    const bytes = await readFile(path.join(assetsRoot, relative))
    files.push({ path: relative, bytes: bytes.length, characters: [...bytes.toString("utf8")].length, sha256: createHash("sha256").update(bytes).digest("hex") })
  }
  for (const group of ["agents", "commands", "skills"]) await visit(group)
  await add("docs/agents-shared.md")
  files.sort((a, b) => a.path.localeCompare(b.path, "en"))
  return {
    schema_version: 1,
    kind: "source_inventory",
    scope: "agents/**/*.md, commands/**/*.md, skills/**/*.md, docs/agents-shared.md",
    totals: { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), characters: files.reduce((sum, file) => sum + file.characters, 0) },
    files,
  }
}

try {
  let assetsRoot = defaultAssets
  let baselinePath
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!value || !["--assets", "--baseline"].includes(flag)) throw new Error("Uso: node measure-prompts.mjs [--assets /ruta/assets] [--baseline /ruta/antes.json]")
    if (flag === "--assets") assetsRoot = path.resolve(value)
    else baselinePath = value
  }
  const snapshot = await measure(assetsRoot)
  if (baselinePath) {
    const baseline = JSON.parse(await readFile(baselinePath, "utf8"))
    if (baseline.schema_version !== 1 || baseline.kind !== snapshot.kind || baseline.scope !== snapshot.scope || !Array.isArray(baseline.files)) throw new Error("Línea base incompatible con el inventario de fuentes")
    const oldFiles = new Map()
    for (const file of baseline.files) {
      if (!file || typeof file.path !== "string" || oldFiles.has(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !Number.isSafeInteger(file.characters) || file.characters < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("Línea base con entradas inválidas")
      oldFiles.set(file.path, file)
    }
    const currentFiles = new Map(snapshot.files.map((file) => [file.path, file]))
    snapshot.comparison = {
      bytes_delta: snapshot.totals.bytes - baseline.files.reduce((sum, file) => sum + file.bytes, 0),
      characters_delta: snapshot.totals.characters - baseline.files.reduce((sum, file) => sum + file.characters, 0),
      added: snapshot.files.filter((file) => !oldFiles.has(file.path)).map((file) => file.path),
      removed: baseline.files.filter((file) => !currentFiles.has(file.path)).map((file) => file.path),
      changed: snapshot.files.filter((file) => oldFiles.has(file.path) && oldFiles.get(file.path).sha256 !== file.sha256).map((file) => file.path),
    }
  }
  console.log(JSON.stringify(snapshot, null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
