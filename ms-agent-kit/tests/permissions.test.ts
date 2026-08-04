import { describe, expect, it } from "vitest"
import {
  OPENCODE_SECRET_BASH_RULES,
  OPENCODE_SECRET_READ_RULES,
  SECRET_BASENAME_PATTERNS,
  isSensitivePath,
} from "../src/core/permissions.js"

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
      ".git/config",
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
    expect(OPENCODE_SECRET_READ_RULES).not.toHaveProperty(".git/config")
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
