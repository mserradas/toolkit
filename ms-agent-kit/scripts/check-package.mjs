import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

function portablePath(value) {
  return value.split(path.sep).join("/");
}

async function regularFiles(root, outputRoot) {
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`El paquete no admite enlaces simbólicos: ${absolutePath}`);
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(portablePath(path.relative(packageRoot, absolutePath)));
      }
    }
  }

  await visit(path.join(packageRoot, root));
  return files.map((file) => portablePath(path.join(outputRoot, path.relative(root, file))));
}

function compareFiles(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((file) => !actualSet.has(file));
  const unexpected = actual.filter((file) => !expectedSet.has(file));

  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      [
        "El contenido del paquete no coincide con el catálogo esperado.",
        missing.length > 0 ? `Faltan: ${missing.join(", ")}` : "",
        unexpected.length > 0 ? `Sobran: ${unexpected.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

const sourceFiles = await regularFiles("src", "src");
const expectedDist = sourceFiles.map((file) => file.replace(/^src\//, "dist/").replace(/\.ts$/, ".js"));
const expectedAssets = await regularFiles("assets", "assets");
const expectedPackageFiles = [
  "LICENSE",
  "README.md",
  "package.json",
  ...expectedAssets,
  ...expectedDist,
].sort();

const npmCache = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-npm-cache-"));
const windows = process.platform === "win32";
const npmCommand = windows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const npmArguments = windows
  ? ["/d", "/s", "/c", "npm pack --dry-run --json --ignore-scripts"]
  : ["pack", "--dry-run", "--json", "--ignore-scripts"];

try {
  const result = spawnSync(
    npmCommand,
    npmArguments,
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: npmCache },
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `npm pack terminó con código ${String(result.status)}`);
  }

  const reports = JSON.parse(result.stdout);
  const report = reports[0];
  if (!report || !Array.isArray(report.files)) {
    throw new Error("npm pack no devolvió un inventario de archivos válido");
  }

  const actualPackageFiles = report.files.map((file) => file.path).sort();
  compareFiles(expectedPackageFiles, actualPackageFiles);

  process.stdout.write(
    `Paquete verificado: ${actualPackageFiles.length} archivos, ${String(report.size)} bytes comprimidos\n`,
  );
} finally {
  await rm(npmCache, { recursive: true, force: true });
}
