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

export const SECRET_DIRECT_PATHS = [
  ".env",
  ".env.local",
  ".env.secret",
  ".env.development",
  ".env.production",
  ".env.staging",
  ".env.test",
  ".netrc",
  ".npmrc",
  ".pypirc",
  ".aws/credentials",
  ".config/gh/hosts.yml",
  ".docker/config.json",
  ".kube/config",
  ".ssh/id_rsa",
  ".ssh/id_dsa",
  ".ssh/id_ecdsa",
  ".ssh/id_ed25519",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "credentials.json",
  "secrets.yml",
  "secrets.yaml",
  "secrets.json",
  "secrets.toml",
  "terraform.tfstate",
  "terraform.tfstate.backup",
  "service-account.json",
  "service-account-prod.json",
  "app.jks",
  "app.keystore",
  "local.settings.json",
  ...SENSITIVE_PATH_SEGMENTS.map((segments) => segments.join("/")),
] as const

const BASE_SECRET_PATH_PATTERNS = [
  ".env",
  "**/.env",
  ".env.local",
  "**/.env.local",
  ".env.*.local",
  "**/.env.*.local",
  ".env.development",
  "**/.env.development",
  ".env.production",
  "**/.env.production",
  ".env.staging",
  "**/.env.staging",
  ".env.test",
  "**/.env.test",
  ".ssh/**",
  "**/.ssh/**",
  ".aws/credentials",
  "**/.aws/credentials",
  ".config/gh/hosts.yml",
  "**/.config/gh/hosts.yml",
  ".credentials/**",
  "**/.credentials/**",
  ".docker/config.json",
  "**/.docker/config.json",
  ".kube/config",
  "**/.kube/config",
  ".netrc",
  "**/.netrc",
  ".npmrc",
  "**/.npmrc",
  ".pypirc",
  "**/.pypirc",
  "Library/Keychains/**",
  "**/Library/Keychains/**",
  "credentials.json",
  "**/credentials.json",
  ".git/config",
  "**/.git/config",
  ".claude/settings.local.json",
  "**/.claude/settings.local.json",
  "secrets/**",
  "**/secrets/**",
  "*.key",
  "**/*.key",
  "*.pem",
  "**/*.pem",
  "*.p12",
  "**/*.p12",
  "*.pfx",
  "**/*.pfx",
] as const

export const SECRET_PATH_PATTERNS = [
  ...BASE_SECRET_PATH_PATTERNS,
  ...SECRET_BASENAME_PATTERNS.flatMap((pattern) => [pattern, `**/${pattern}`]),
] as const

export const OPENCODE_SECRET_READ_RULES = Object.fromEntries(
  SECRET_PATH_PATTERNS.map((pattern) => [pattern, "deny"]),
)

function openCodeBashPathVariants(patterns: readonly string[]): string[] {
  const rootPatterns = patterns.filter((pattern) => !pattern.startsWith("**/"))
  return [
    ...new Set(
      rootPatterns.flatMap((pattern) => [pattern, `*/${pattern}`, `**/${pattern}`]),
    ),
  ]
}

export const OPENCODE_SECRET_BASH_RULES: Record<string, "deny"> = Object.fromEntries([
  ["env", "deny"],
  ["env *", "deny"],
  ["printenv*", "deny"],
  ...openCodeBashPathVariants(SECRET_PATH_PATTERNS).map((pattern) => [
    `* ${pattern}`,
    "deny",
  ]),
])

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
