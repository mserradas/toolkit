export const SECRET_PATH_PATTERNS = [
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

export const OPENCODE_SECRET_READ_RULES = Object.fromEntries(
  SECRET_PATH_PATTERNS.map((pattern) => [pattern, "deny"]),
)

export const OPENCODE_SECRET_BASH_RULES: Record<string, "deny"> = {
  env: "deny",
  "env *": "deny",
  "printenv*": "deny",
  "* .env": "deny",
  "* */.env": "deny",
  "* **/.env": "deny",
  "* .env.local": "deny",
  "* */.env.local": "deny",
  "* **/.env.local": "deny",
  "* .env.*.local": "deny",
  "* */.env.*.local": "deny",
  "* **/.env.*.local": "deny",
  "* .env.development": "deny",
  "* */.env.development": "deny",
  "* **/.env.development": "deny",
  "* .env.production": "deny",
  "* */.env.production": "deny",
  "* **/.env.production": "deny",
  "* .env.staging": "deny",
  "* */.env.staging": "deny",
  "* **/.env.staging": "deny",
  "* .env.test": "deny",
  "* */.env.test": "deny",
  "* **/.env.test": "deny",
  "* **/secrets/**": "deny",
  "* **/.ssh/**": "deny",
  "* **/.aws/credentials": "deny",
  "* **/.config/gh/hosts.yml": "deny",
  "* **/credentials.json": "deny",
  "* **/*.key": "deny",
  "* **/*.pem": "deny",
  "* **/*.p12": "deny",
  "* **/*.pfx": "deny",
}

export function isSensitivePath(input: string): boolean {
  const normalized = input.replaceAll("\\", "/").replace(/^\.\//, "")
  const segments = normalized.split("/").filter(Boolean)
  const basename = segments.at(-1) ?? ""
  const safeEnvironmentTemplates = new Set([".env.example", ".env.sample", ".env.template"])

  if (basename === ".env" || (basename.startsWith(".env.") && !safeEnvironmentTemplates.has(basename))) {
    return true
  }
  if (segments.some((segment) => ["secrets", ".ssh", ".credentials"].includes(segment))) {
    return true
  }
  if (/\.(?:key|pem|p12|pfx)$/.test(basename)) return true

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
