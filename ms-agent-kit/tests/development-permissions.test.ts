import { describe, expect, it } from "vitest"
import { commandPreflight } from "../src/core/command-preflight.js"
import { openCodeRolePermission } from "../src/core/opencode-role-permissions.js"
import { OPENCODE_SECRET_BASH_RULES } from "../src/core/permissions.js"
import type { PermissionProfile } from "../src/core/types.js"
import { reviewCommentReads } from "./fixtures/github-review-api.js"

function decision(command: string, role = "ms-architect", profile: PermissionProfile = "balanced"): string {
  // OpenCode evaluates each shell command separately. These fixtures use plain
  // operators outside quotes; quoted arguments and dynamic forms stay intact.
  if (!/["'`$]/.test(command) && /&&|\|\||[;|]/.test(command)) {
    const decisions = command.split(/&&|\|\||[;|]/).map((part) => decision(part.trim(), role, profile))
    return decisions.includes("deny") ? "deny" : decisions.includes("ask") ? "ask" : "allow"
  }
  const rules = { ...openCodeRolePermission(role, profile).bash as Record<string, string>, ...OPENCODE_SECRET_BASH_RULES }
  return Object.entries(rules).reduce((result, [pattern, action]) => {
    // Match OpenCode's native wildcard semantics, including backslash
    // normalization, ? and an optional trailing space + wildcard.
    let regex = pattern.replaceAll("\\", "/").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")
    if (regex.endsWith(" .*")) regex = regex.slice(0, -3) + "( .*)?"
    return new RegExp(`^${regex}$`, "s").test(command.replaceAll("\\", "/")) ? action : result
  }, "deny")
}

describe("permissive development profiles", () => {
  const context = { projectRoot: "/repo", homeDir: "/home", assetsRoot: "/assets", scope: "project" as const }
  const roles = ["ms-architect", "ms-codex", "ms-fastlane", "ms-tester", "ms-debugger", "ms-scout"]

  it("uses a compact allow-by-default policy with identical safety rules in balanced and trusted", () => {
    for (const role of roles) {
      const balanced = openCodeRolePermission(role, "balanced")
      expect(balanced.bash).toEqual(openCodeRolePermission(role, "trusted").bash)
      expect((balanced.bash as Record<string, string>)["*"]).toBe("allow")
      expect(Object.keys(balanced.bash as object).length).toBeLessThan(160)
      for (const command of ["custom-local-tool --check", "./scripts/verify.sh", "make custom-target", "docker compose run --rm tests", "node -e console.log(1)", "pnpm test", "npm install", "git status && git diff", "gh help run view", "gh run download 123", ...reviewCommentReads])
        expect(decision(command, role), `${role}: ${command}`).toBe("allow")
    }
  })

  it("keeps destructive, global and remote changes reviewable instead of denying them", () => {
    for (const role of roles) for (const command of ["rm -rf src", "sudo apt install package", "npm install -g tool", "npm publish", "git reset --hard", "git clean -fd", "git push --force origin main", "git push -uf origin main", "git commit --amend", "gh pr merge 42", "gh issue delete 42", "gh workflow run deploy.yml", "gh api -X DELETE repos/owner/repo", "gh api repos/owner/repo/issues -f body=text", "ms-agent-kit install --target all"])
      expect(decision(command, role), `${role}: ${command}`).toBe("ask")
  })

  it("permits architect delivery and preserves strict and non-shell role boundaries", () => {
    for (const command of ["git switch -c feature/work", "git add -A", "git commit -m update", "git push -u origin feature/work", "gh pr create --base develop --head feature/work", "gh issue edit 42 --body-file issue.md"])
      expect(decision(command), command).toBe("allow")
    expect(decision("git push origin feature", "ms-codex")).toBe("ask")
    expect(decision("gh issue create --title example", "ms-codex")).toBe("ask")
    expect(openCodeRolePermission("ms-architect").edit).toBe("deny")
    expect(openCodeRolePermission("ms-tester").edit).toBe("deny")
    expect(decision("git push origin feature", "ms-architect", "strict")).toBe("deny")
    expect(decision("npm install package", "ms-codex", "strict")).toBe("ask")
    expect(decision("gh issue list", "ms-designer")).toBe("deny")
  })

  it("retains secrets and tester source-write guards after broad allows", () => {
    for (const role of roles) for (const command of ["cat .env", "cat secrets/token", "gh auth token", "git status && cat .env"])
      expect(decision(command, role), `${role}: ${command}`).toBe("deny")
    for (const prefix of ["pnpm exec ", "npx --no-install ", "./node_modules/.bin/"]) for (const command of ["eslint --fix src", "prettier --write src", "tsc --noEmit=false", "jest --updateSnapshot", "jest --outputFile=src/index.js", "eslint -o src/index.js"])
      expect(decision(prefix + command, "ms-tester"), prefix + command).toBe("deny")
  })

  it("leaves OpenCode policy to the unprobed native client", () => {
    const operation = { command: "git status && git push origin feature", cwd: ".", source: "user" }
    expect(commandPreflight(operation, "opencode", "ms-architect", context)).toMatchObject({ decision: "unknown", effects: { status: "unknown" }, runtime: "unknown" })
    expect(commandPreflight({ ...operation, command: "git reset --hard" }, "opencode", "ms-architect", context).decision).toBe("unknown")
    expect(commandPreflight({ ...operation, command: "git reset --hard" }, "codex", "ms-architect", context).decision).toBe("unknown")
  })
})
