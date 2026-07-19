import { createHash, randomBytes } from "node:crypto"
import { chmod, lstat, mkdir, open, readFile, rename, rm, rmdir, stat } from "node:fs/promises"
import path from "node:path"
import { assertNoSymlinkEscape } from "./security.js"

export interface ExistingFile {
  content: Buffer
  hash: string
  mode: number
}

export function hashContent(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex")
}

export async function readExistingFile(filePath: string): Promise<ExistingFile | null> {
  try {
    const linkInfo = await lstat(filePath)
    if (linkInfo.isSymbolicLink()) {
      throw new Error(`Se rechaza un archivo administrado que es un enlace simbólico (symlink): ${filePath}`)
    }
    if (!linkInfo.isFile()) {
      throw new Error(`El destino existe y no es un archivo regular: ${filePath}`)
    }
    const content = await readFile(filePath)
    const info = await stat(filePath)
    return { content, hash: hashContent(content), mode: info.mode & 0o777 }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

export async function atomicWriteFile(
  root: string,
  filePath: string,
  content: Buffer,
  mode: number,
): Promise<void> {
  await assertNoSymlinkEscape(root, filePath)
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o755 })
  await assertNoSymlinkEscape(root, filePath)

  const temporaryPath = path.join(
    path.dirname(filePath),
    `.ms-agent-kit-${process.pid}-${randomBytes(6).toString("hex")}.tmp`,
  )
  const handle = await open(temporaryPath, "wx", mode)
  try {
    await handle.writeFile(content)
    await handle.sync()
  } finally {
    await handle.close()
  }

  try {
    await chmod(temporaryPath, mode)
    await rename(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

export async function removeManagedFile(root: string, filePath: string): Promise<void> {
  const resolvedRoot = path.resolve(root)
  const resolvedFilePath = path.resolve(filePath)
  if (resolvedFilePath === resolvedRoot) {
    throw new Error(`Se rechaza eliminar la raíz administrada: ${root}`)
  }

  await assertNoSymlinkEscape(root, filePath)
  await rm(filePath, { force: true })

  let directory = path.dirname(resolvedFilePath)
  while (directory !== resolvedRoot) {
    try {
      const info = await lstat(directory)
      if (info.isSymbolicLink() || !info.isDirectory()) return
      await rmdir(directory)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "ENOENT") {
        directory = path.dirname(directory)
        continue
      }
      if (code === "ENOTEMPTY" || code === "EEXIST" || code === "ENOTDIR") return
      throw error
    }
    directory = path.dirname(directory)
  }
}
