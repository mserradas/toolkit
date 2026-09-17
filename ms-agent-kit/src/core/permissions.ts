export const SECRET_BASENAME_PATTERNS = [
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "secrets.yml",
  "secrets.yaml",
  "secrets.json",
  "secrets.toml",
  "terraform.tfstate*",
  "service-account*.json",
  "*.jks",
  "*.keystore",
  "local.settings.json",
] as const

export const SAFE_ENVIRONMENT_TEMPLATES = [
  ".env.example",
  ".env.sample",
  ".env.template",
] as const

export const SENSITIVE_PATH_SEGMENTS = [
  [".git", "config"],
  [".claude", "settings.local.json"],
] as const

function matchesSecretBasename(basename: string): boolean {
  return SECRET_BASENAME_PATTERNS.some((pattern) => {
    if (pattern.startsWith("*.")) return basename.endsWith(pattern.slice(1))
    if (pattern.endsWith("*")) return basename.startsWith(pattern.slice(0, -1))
    if (pattern.includes("*")) {
      const [prefix = "", suffix = ""] = pattern.split("*", 2)
      return basename.startsWith(prefix) && basename.endsWith(suffix)
    }
    return basename === pattern
  })
}

export function isSensitivePath(input: string): boolean {
  const normalized = input.replaceAll("\\", "/").replace(/^\.\//, "")
  const segments = normalized.split("/").filter(Boolean)
  const basename = segments.at(-1) ?? ""
  const safeEnvironmentTemplates = new Set<string>(SAFE_ENVIRONMENT_TEMPLATES)

  if (basename === ".env" || (basename.startsWith(".env.") && !safeEnvironmentTemplates.has(basename))) {
    return true
  }
  if (segments.some((segment) => ["secrets", ".ssh", ".credentials"].includes(segment))) {
    return true
  }
  if (
    SENSITIVE_PATH_SEGMENTS.some((candidate) =>
      segments.some(
        (segment, index) =>
          segment === candidate[0] && segments[index + 1] === candidate[1],
      ),
    )
  ) return true
  if (/\.(?:key|pem|p12|pfx)$/.test(basename)) return true
  if (matchesSecretBasename(basename)) return true

  return [
    ".aws/credentials",
    ".config/gh/hosts.yml",
    ".docker/config.json",
    ".kube/config",
    ".netrc",
    ".npmrc",
    ".pypirc",
    "credentials.json",
  ].some((candidate) => normalized === candidate || normalized.endsWith(`/${candidate}`))
}
