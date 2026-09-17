/** Allow ordinary project work by default; keep the exceptional risks explicit. */
export const DEVELOPMENT_ROLES = ["ms-architect", "ms-codex", "ms-fastlane", "ms-tester", "ms-debugger", "ms-scout"] as const

export function developmentBash(role: string, original: unknown): unknown {
  if (!(DEVELOPMENT_ROLES as readonly string[]).includes(role)) return original
  const rules: Record<string, "allow" | "ask" | "deny"> = { "*": "allow" }
  for (const command of [
    "ms-agent-kit install", "ms-agent-kit uninstall", "sudo", "su", "doas", "rm", "rmdir", "shred", "dd", "mkfs",
    "brew", "apt", "apt-get", "dnf", "yum", "pacman", "systemctl", "launchctl", "shutdown", "reboot",
    "ssh", "scp", "rsync", "git reset", "git clean", "git restore", "git rebase", "git config",
    "npm publish", "pnpm publish", "yarn publish", "bun publish", "cargo publish", "docker push",
    "terraform apply", "terraform destroy", "kubectl apply", "kubectl delete",
    "alembic upgrade", "alembic downgrade", "alembic stamp",
    "uv run alembic upgrade", "uv run alembic downgrade", "uv run alembic stamp",
  ]) rules[`${command} *`] = "ask"
  for (const pattern of [
    "git push -uf*", "git push -fu*", "git fetch *:*", "git fetch *+*", "git *--force*", "git * -f*", "git push *:*", "git push *+*", "git push *--delete*", "git push *--mirror*",
    "git branch -D *", "git switch -C *", "git *--discard-changes*", "git checkout -- *",
    "git commit *--amend*", "git commit *--no-verify*", "git commit -n*", "git commit -a*n*",
    "git *--upload-pack*", "git *--exec*",
    "* --global*", "* -g *", "* -g", "* --location*", "* --system*",
    "curl *| sh*", "curl *| bash*", "wget *| sh*", "wget *| bash*",
  ]) rules[pattern] = "ask"
  // Delivery belongs to the architect; a worker can request approval instead of
  // hitting an unconditional denial when explicitly asked to deliver directly.
  if (role !== "ms-architect") rules["git push *"] = "ask"
  if (role === "ms-tester") {
    for (const pattern of ["* --fix*", "* --write*", "* --update*", "*vitest* -u*", "*jest* -u*", "* --noEmit false*", "* --noEmit=false*", "* --noemit false*", "* --noemit=false*", "* --coverage.reportsDirectory*", "* --coverageDirectory*", "* --outputFile*", "* --output-file*", "*eslint* -o*"]) rules[pattern] = "deny"
  }
  return rules
}

export const DEFAULT_VERIFICATION_OUTPUTS = ["coverage", "test-results", "playwright-report", ".pytest_cache", ".ruff_cache", ".mypy_cache", "node_modules/.cache", "node_modules/.vite"] as const
