import { describe, expect, it } from "vitest"
import { openCodeRolePermission } from "../src/core/opencode-role-permissions.js"
import { staticCommandDecision } from "../src/core/command-preflight.js"
import { capabilityProfile, gitInspectionCommands } from "../src/core/profiles.js"
import {
  OPENCODE_SECRET_BASH_RULES,
  OPENCODE_SECRET_READ_RULES,
  SECRET_BASENAME_PATTERNS,
  SENSITIVE_PATH_SEGMENTS,
  isSensitivePath,
} from "../src/core/permissions.js"

describe("bounded documentary inspection", () => {
  for (const [role, profileName, directory] of [["ms-designer", "design-writer", ".agents/docs/design"], ["ms-spec", "spec-writer", ".agents/docs/spec"]] as const) {
    it(`${role} permits only exact inspection commands in every permission profile`, () => {
      const profile = capabilityProfile(profileName)
      expect(profile.shell).toBe(true)
      expect(profile.gitInspectionPaths).toEqual([directory])
      const commands = gitInspectionCommands(profile)
      expect(commands).toHaveLength(3)
      expect(commands).toContain("git status --short")
      for (const permissionProfile of ["strict", "balanced", "trusted"] as const) {
        const bash = openCodeRolePermission(role, permissionProfile).bash as Record<string, string>
        expect(bash).toEqual({ "*": "deny", ...Object.fromEntries(commands.map((command) => [command, "allow"])), "pwd": "allow", "ls -d .": "allow", "command -v ms-agent-kit": "allow" })
        for (const probe of ["pwd", "ls -d .", "command -v ms-agent-kit"]) {
          expect(staticCommandDecision(probe, role, { projectRoot: "/repo", homeDir: "/home", assetsRoot: "/assets", scope: "project", permissionProfile }), probe).toBe("allow")
        }
        for (const denied of ["pwd -P", "ls", "ls -d /repo", "ls -d ..", "ls -d . .env", "ls .env", "ls -la .", "command -v node", "command -v ms-agent-kit extra", "command ms-agent-kit", "command -v ms-agent-kit && pwd", "pwd; ls -d .", "ls -d $(pwd)", "pwd > out", "sh -c pwd", "bash -c pwd", "env pwd", "npm test", "npm run build"]) {
          expect(bash[denied] ?? bash["*"], denied).toBe("deny")
        }
        for (const denied of ["git diff", "git status", "git reset --hard", "git diff -- src", "git diff -- .env", "git diff --output=/tmp/leak -- .agents/docs/design", "git status --short && cat .env", "ms-agent-kit project inspect", `git --no-pager diff --no-ext-diff --no-textconv -- ${directory}/../spec`, `git --no-pager diff --no-ext-diff --no-textconv -- ${directory}`, `git --no-pager diff --no-ext-diff --no-textconv --check -- ${directory}`]) {
          expect(bash[denied] ?? bash["*"], denied).toBe("deny")
        }
      }
    })
  }
})

describe("exact kit executable lookup", () => {
  const decision = (role: string, command: string, profile: "strict" | "balanced" | "trusted") => {
    const bash = openCodeRolePermission(role, profile).bash
    if (typeof bash !== "object" || bash === null) return bash
    return Object.entries(bash).filter(([pattern]) => new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(command)).at(-1)?.[1]
  }
  it("allows only the fixed lookup in existing shell policies and preserves denials", () => {
    for (const profile of ["strict", "balanced", "trusted"] as const) {
      for (const role of ["ms-architect", "ms-codex", "ms-fastlane", "ms-tester", "ms-scout", "ms-debugger", "ms-security-auditor"]) {
        expect(decision(role, "command -v ms-agent-kit", profile), `${profile}: ${role}`).toBe("allow")
        for (const command of ["command ms-agent-kit", "command -v ms-agent-kit extra", "command -v node"]) {
          const bash = openCodeRolePermission(role, profile).bash as Record<string, string>
          expect(decision(role, command, profile), `${role}: ${command}`).toBe(bash["*"])
        }
        for (const command of ["command -v ms-agent-kit && pwd", "command -v ms-agent-kit; pwd", "command -v ms-agent-kit > out", "command -v $(cat .env)"]) {
          expect(decision(role, command, profile), `${role}: ${command}`).not.toBe("allow")
        }
      }
      for (const role of ["ms-plan", "ms-discovery", "ms-writer"]) expect(decision(role, "command -v ms-agent-kit", profile), role).toBe("deny")
    }
  })
})

describe("balanced routine verification", () => {
  const context = { projectRoot: "/repo", homeDir: "/home", assetsRoot: "/assets", scope: "project" as const }
  const decision = (command: string, role: "ms-codex" | "ms-fastlane" | "ms-tester", permissionProfile: "strict" | "balanced" | "trusted") => staticCommandDecision(command, role, { ...context, permissionProfile })

  it("permite lecturas y builds concretos de fastlane sin cambiar strict", () => {
    for (const command of ["rg TODO src", "cat README.md", "head -n 20 README.md", "tail -n 20 README.md", "wc -l README.md", "file README.md", "stat README.md", "pnpm build", "pnpm run build", "npm run build", "yarn build", "bun run build"]) {
      expect(decision(command, "ms-fastlane", "strict"), command).toBe("deny")
      for (const profile of ["balanced", "trusted"] as const) expect(decision(command, "ms-fastlane", profile), command).toBe("allow")
    }
  })

  it("autoriza solo entrypoints locales conocidos y conserva restricciones por rol", () => {
    for (const role of ["ms-codex", "ms-fastlane", "ms-tester"] as const) {
      for (const command of ["node node_modules/vitest/vitest.mjs run", "node ./node_modules/vitest/vitest.mjs run tests/my-unit.test.ts", "node node_modules/eslint/bin/eslint.js src", "node node_modules/jest/bin/jest.js tests/unit.test.ts", "node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit"]) {
        expect(decision(command, role, "strict"), `${role}: ${command}`).not.toBe("allow")
        for (const profile of ["balanced", "trusted"] as const) expect(decision(command, role, profile), `${role}: ${command}`).toBe("allow")
      }
      for (const command of ["node -e alert", "node -r ./hook.js node_modules/vitest/vitest.mjs run", "node --loader ./hook.mjs node_modules/vitest/vitest.mjs run", "node random.js", "node node_modules/vitest/vitest.mjs run-extra", "node node_modules/vitest/vitest.mjs.other run"]) expect(decision(command, role, "balanced"), command).not.toBe("allow")
    }
    for (const profile of ["balanced", "trusted"] as const) {
      for (const command of ["node node_modules/vitest/vitest.mjs run -u", "node node_modules/vitest/vitest.mjs run tests/unit.test.ts -u", "node node_modules/jest/bin/jest.js --updateSnapshot", "node node_modules/eslint/bin/eslint.js src --fix", "node node_modules/typescript/bin/tsc", "node node_modules/typescript/bin/tsc --noEmit false", "node node_modules/typescript/bin/tsc --noEmit --noEmit=false", "node node_modules/typescript/bin/tsc --noEmit --noemit false"]) expect(decision(command, "ms-tester", profile), command).toBe("deny")
      for (const role of ["ms-codex", "ms-fastlane"] as const) expect(decision("node node_modules/typescript/bin/tsc -p tsconfig.build.json", role, profile)).toBe("allow")
    }
  })

  it("mantiene secretos y denegaciones después de los permisos nuevos", () => {
    for (const profile of ["balanced", "trusted"] as const) {
      for (const role of ["ms-codex", "ms-fastlane", "ms-tester"] as const) {
        const bash = { ...(openCodeRolePermission(role, profile).bash as Record<string, string>), ...OPENCODE_SECRET_BASH_RULES }
        const match = (command: string) => Object.entries(bash).filter(([pattern]) => new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(command)).at(-1)?.[1]
        for (const command of ["node node_modules/vitest/vitest.mjs run && echo done", "node node_modules/vitest/vitest.mjs run; echo done", "node node_modules/vitest/vitest.mjs run > result.txt", "node node_modules/vitest/vitest.mjs run $(cat .env)", "node node_modules/vitest/vitest.mjs run .env", "git push", "rm -rf src"]) expect(match(command), `${role}: ${command}`).toBe("deny")
      }
      for (const command of ["docker compose up", "make deploy", "npm install", "cat .env", "rg TODO secrets/token"]) expect(decision(command, "ms-fastlane", profile), command).toBe("deny")
    }
  })

  it("bloquea snapshots y destinos de reporte explícitos en los nuevos runners del tester", () => {
    for (const profile of ["balanced", "trusted"] as const) {
      for (const prefix of ["node node_modules/", "node ./node_modules/"]) {
        for (const runner of ["vitest/vitest.mjs run", "jest/bin/jest.js"]) {
          const command = prefix + runner
          for (const argument of ["--update", "--update=true", "-u", "-u=true", "--updateSnapshot", "--outputFile src/index.ts", "--outputFile=src/index.ts", "--outputFile.junit=src/index.ts", "--output-file src/index.ts", "--coverage.reportsDirectory src", "--coverage.reportsDirectory=src", "--coverageDirectory=src"]) {
            expect(decision(`${command} ${argument}`, "ms-tester", profile), argument).toBe("deny")
            expect(decision(`${command} tests/unit.test.ts ${argument}`, "ms-tester", profile), argument).toBe("deny")
          }
          for (const file of ["tests/my-unit.test.ts", "tests/outputFile.test.ts", "tests/--update-helper.test.ts", "tests/coverageDirectory.test.ts"]) expect(decision(`${command} ${file}`, "ms-tester", profile), file).toBe("allow")
        }
        const eslint = `${prefix}eslint/bin/eslint.js`
        for (const argument of ["-o src/index.ts", "-osrc/index.ts", "--output-file src/index.ts", "--output-file=src/index.ts"]) {
          expect(decision(`${eslint} ${argument} .`, "ms-tester", profile), argument).toBe("deny")
          expect(decision(`${eslint} . ${argument}`, "ms-tester", profile), argument).toBe("deny")
        }
        for (const file of ["src/my-output.ts", "src/output-file.ts", "src/--output-file-helper.ts"]) expect(decision(`${eslint} ${file}`, "ms-tester", profile), file).toBe("allow")
      }
    }
  })
})

describe("equivalent package-manager runner safeguards", () => {
  const context = { projectRoot: "/repo", homeDir: "/home", assetsRoot: "/assets", scope: "project" as const }

  it("aplica los mismos bloqueos al tester con pnpm exec y npx local", () => {
    for (const permissionProfile of ["balanced", "trusted"] as const) {
      for (const prefix of ["pnpm exec", "npx --no-install"]) {
        for (const runner of ["vitest run", "jest"]) {
          const command = `${prefix} ${runner}`
          for (const argument of ["-u", "-u=true", "--update", "--update=true", "--outputFile=src/index.ts", "--outputFile.junit=src/index.ts", "--output-file src/index.ts", "--coverage.reportsDirectory=src", "--coverageDirectory=src"]) {
            for (const invocation of [`${command} ${argument}`, `${command} tests/unit.test.ts ${argument}`]) expect(staticCommandDecision(invocation, "ms-tester", { ...context, permissionProfile }), invocation).toBe("deny")
          }
          for (const file of ["tests/my-unit.test.ts", "tests/--update-helper.test.ts", "tests/outputFile.test.ts"]) expect(staticCommandDecision(`${command} ${file}`, "ms-tester", { ...context, permissionProfile }), file).toBe("allow")
        }
        for (const argument of ["-o src/index.ts", "-osrc/index.ts", "--output-file=src/index.ts"]) expect(staticCommandDecision(`${prefix} eslint . ${argument}`, "ms-tester", { ...context, permissionProfile }), argument).toBe("deny")
        expect(staticCommandDecision(`${prefix} eslint src/my-output.ts`, "ms-tester", { ...context, permissionProfile })).toBe("allow")
      }
    }
  })

  it("no cambia strict ni los permisos de implementación para el caso de regresión", () => {
    expect(staticCommandDecision("pnpm exec vitest run -u", "ms-tester", { ...context, permissionProfile: "strict" })).toBe("allow")
    for (const role of ["ms-codex", "ms-fastlane"] as const) expect(staticCommandDecision("pnpm exec vitest run -u", role, { ...context, permissionProfile: "balanced" })).toBe("allow")
  })
})

describe("sensitive path policy", () => {
  it("classifies approved secret filenames in roots and subdirectories", () => {
    const filenames = [
      "id_rsa",
      "id_dsa",
      "id_ecdsa",
      "id_ed25519",
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
    ]

    for (const filename of filenames) {
      expect(isSensitivePath(filename), filename).toBe(true)
      expect(isSensitivePath(`config/nested/${filename}`), filename).toBe(true)
    }
  })

  it("keeps safe templates, diagnostics, and ordinary files readable", () => {
    for (const filename of [
      ".env.example",
      ".env.sample",
      ".env.template",
      "README.md",
      "terraform.tfvars",
      "service-account.md",
      ".claude/settings.json",
      ".git/configuration",
      ".claude/settings.json.example",
    ]) {
      expect(isSensitivePath(filename), filename).toBe(false)
    }
  })

  it("materializes the shared basename policy for OpenCode read and Bash", () => {
    for (const pattern of SECRET_BASENAME_PATTERNS) {
      expect(OPENCODE_SECRET_READ_RULES[pattern]).toBe("deny")
      expect(OPENCODE_SECRET_READ_RULES[`**/${pattern}`]).toBe("deny")
      expect(OPENCODE_SECRET_BASH_RULES[`* ${pattern}`]).toBe("deny")
      expect(OPENCODE_SECRET_BASH_RULES[`* */${pattern}`]).toBe("deny")
      expect(OPENCODE_SECRET_BASH_RULES[`* **/${pattern}`]).toBe("deny")
    }
    expect(OPENCODE_SECRET_READ_RULES).not.toHaveProperty(".claude/settings.json")
  })

  it("classifies only the approved shared configuration paths", () => {
    for (const segments of SENSITIVE_PATH_SEGMENTS) {
      const target = segments.join("/")
      expect(isSensitivePath(target)).toBe(true)
      expect(isSensitivePath(`nested/${target}`)).toBe(true)
      expect(OPENCODE_SECRET_READ_RULES[target]).toBe("deny")
      expect(OPENCODE_SECRET_READ_RULES[`**/${target}`]).toBe("deny")
      expect(OPENCODE_SECRET_BASH_RULES[`* ${target}`]).toBe("deny")
      expect(OPENCODE_SECRET_BASH_RULES[`* */${target}`]).toBe("deny")
      expect(OPENCODE_SECRET_BASH_RULES[`* **/${target}`]).toBe("deny")
    }
    expect(isSensitivePath(".git/configuration")).toBe(false)
    expect(isSensitivePath(".claude/settings.json")).toBe(false)
    expect(isSensitivePath(".claude/settings.json.example")).toBe(false)
    expect(OPENCODE_SECRET_READ_RULES).not.toHaveProperty(".claude/settings.json")
  })

  it("derives root, one-level, and multi-level Bash rules from canonical paths", () => {
    for (const pattern of [
      ".env",
      ".aws/credentials",
      ".ssh/**",
      "secrets/**",
      "*.pem",
    ]) {
      expect(OPENCODE_SECRET_BASH_RULES[`* ${pattern}`]).toBe("deny")
      expect(OPENCODE_SECRET_BASH_RULES[`* */${pattern}`]).toBe("deny")
      expect(OPENCODE_SECRET_BASH_RULES[`* **/${pattern}`]).toBe("deny")
    }

    expect(Object.keys(OPENCODE_SECRET_BASH_RULES)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("*/**/")]),
    )
  })
})
