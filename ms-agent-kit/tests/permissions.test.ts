import { describe, expect, it } from "vitest"
import { SENSITIVE_PATH_SEGMENTS, isSensitivePath } from "../src/core/permissions.js"

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



  it("classifies only the approved shared configuration paths", () => {
    for (const segments of SENSITIVE_PATH_SEGMENTS) {
      const target = segments.join("/")
      expect(isSensitivePath(target)).toBe(true)
      expect(isSensitivePath(`nested/${target}`)).toBe(true)
    }
    expect(isSensitivePath(".git/configuration")).toBe(false)
    expect(isSensitivePath(".claude/settings.json")).toBe(false)
    expect(isSensitivePath(".claude/settings.json.example")).toBe(false)
  })


})
