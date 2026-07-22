import { describe, expect, it } from "vitest"
import {
  chooseLeadingSeparator,
  insertManagedBlock,
  inspectExternalCodexContext7,
  inspectManagedBlock,
  managedBlockMarkers,
  ownedRange,
  removeManagedBlock,
  renderManagedBlock,
  replaceManagedBlock,
} from "../src/core/managed-block.js"

const blockId = "codex-context7"
const body = Buffer.from('[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\n')

describe("managed block helper", () => {
  it("renders deterministic markers and validates block ids", () => {
    expect(managedBlockMarkers(blockId)).toEqual({
      open: "# >>> ms-agent-kit managed-block:codex-context7 >>>",
      close: "# <<< ms-agent-kit managed-block:codex-context7 <<<",
    })
    expect(renderManagedBlock(blockId, Buffer.from("value = true"), "\n").toString()).toBe(
      "\n# >>> ms-agent-kit managed-block:codex-context7 >>>\n" +
        "value = true\n" +
        "# <<< ms-agent-kit managed-block:codex-context7 <<<\n",
    )
    expect(() => renderManagedBlock("Bad id", body)).toThrow(/inválido/)
  })

  it.each([
    [Buffer.alloc(0), "", ""],
    [Buffer.from("prefix\n"), "", "prefix\n"],
    [Buffer.from("prefix\r\n"), "", "prefix\r\n"],
    [Buffer.from("prefix"), "\n", "prefix"],
    [Buffer.from("first\r\nlast"), "\r\n", "first\r\nlast"],
  ] as const)("inserts after the exact original bytes %#", (original, separator, prefix) => {
    expect(chooseLeadingSeparator(original)).toBe(separator)
    const inserted = insertManagedBlock(original, blockId, body)
    expect(inserted.subarray(0, original.length).equals(original)).toBe(true)
    expect(inserted.toString().startsWith(prefix)).toBe(true)
    const inspection = inspectManagedBlock(inserted, blockId)
    expect(inspection.status).toBe("complete")
    if (inspection.status !== "complete") return
    expect(ownedRange(inserted, inspection.range, separator)?.content).toEqual(
      renderManagedBlock(blockId, body, separator),
    )
  })

  it("replaces and removes only the owned range, including its separator", () => {
    const prefix = Buffer.from([0x00, 0xff, 0x70, 0x72, 0x65])
    const suffix = Buffer.from([0x73, 0x75, 0x66, 0x00])
    const original = Buffer.concat([
      prefix,
      renderManagedBlock(blockId, Buffer.from("old = true\n"), "\n"),
      suffix,
    ])
    const inspection = inspectManagedBlock(original, blockId)
    expect(inspection.status).toBe("complete")
    if (inspection.status !== "complete") return

    const replaced = replaceManagedBlock(
      original,
      inspection.range,
      blockId,
      Buffer.from("new = true\n"),
      "\n",
    )
    expect(replaced.subarray(0, prefix.length).equals(prefix)).toBe(true)
    expect(replaced.subarray(-suffix.length).equals(suffix)).toBe(true)
    const replacedInspection = inspectManagedBlock(replaced, blockId)
    expect(replacedInspection.status).toBe("complete")
    if (replacedInspection.status !== "complete") return
    expect(removeManagedBlock(replaced, replacedInspection.range, "\n")).toEqual(
      Buffer.concat([prefix, suffix]),
    )
  })

  it("classifies absent, incomplete, inverted, duplicated and second blocks", () => {
    const markers = managedBlockMarkers(blockId)
    expect(inspectManagedBlock(Buffer.from("plain\n"), blockId).status).toBe("absent")
    expect(inspectManagedBlock(Buffer.from(`${markers.open}\n`), blockId).status).toBe("incomplete")
    expect(inspectManagedBlock(Buffer.from(`${markers.open} trailing\n`), blockId).status).toBe(
      "incomplete",
    )
    expect(
      inspectManagedBlock(Buffer.from(`${markers.close}\n${markers.open}\n`), blockId).status,
    ).toBe("inverted")
    expect(
      inspectManagedBlock(
        Buffer.from(`${markers.open}\n${markers.close}\n${markers.open}\n${markers.close}\n`),
        blockId,
      ).status,
    ).toBe("duplicate")
    expect(
      inspectManagedBlock(
        Buffer.concat([renderManagedBlock(blockId, body), renderManagedBlock("another", body)]),
        blockId,
      ).status,
    ).toBe("multiple")
  })

  it.each(["'''", '\"\"\"'])(
    "treats marker-looking lines inside %s multiline strings as ambiguous",
    (delimiter) => {
      const markers = managedBlockMarkers(blockId)
      const content = Buffer.from(
        `example = ${delimiter}\n${markers.open}\nvalue\n${markers.close}\n${delimiter}\n`,
      )
      expect(inspectManagedBlock(content, blockId).status).toBe("incomplete")
    },
  )
})

describe("bounded Context7 satisfaction detector", () => {
  it("accepts comments, spacing, key order, quote styles and additional keys", () => {
    const external = Buffer.from(`
      [ mcp_servers . context7 ] # external
      enabled = true
      env_http_headers = { OTHER = 'value', 'CONTEXT7_API_KEY' = 'CONTEXT7_API_KEY' }
      # between values
      url = 'https://mcp.context7.com/mcp'
      timeout = 30
    `)
    expect(inspectExternalCodexContext7(external)).toBe("satisfied")
  })

  it.each([
    '[mcp_servers.context7]\nurl = "https://wrong.example/mcp"\nenv_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }\n',
    '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\nenv_http_headers = { "CONTEXT7_API_KEY" = "secret-value" }\n',
    '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\nurl = "https://mcp.context7.com/mcp"\nenv_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }\n',
    '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\nenv_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY", "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }\n',
    '[mcp_servers.context7]\nurl = "https://mcp.context7.com\\/mcp"\nenv_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }\n',
    '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\nenv_http_headers = {\n  "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY"\n}\n',
    '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\nenv_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }\n[mcp_servers.context7]\n',
    '[[mcp_servers.context7]]\nurl = "https://mcp.context7.com/mcp"\n',
    '["mcp_servers"."context7"]\nurl = "https://mcp.context7.com/mcp"\n',
  ])("protects a non-provably-equivalent table %#", (external) => {
    expect(inspectExternalCodexContext7(Buffer.from(external))).toBe("conflict")
  })

  it("distinguishes absence and invalid UTF-8", () => {
    expect(inspectExternalCodexContext7(Buffer.from("[other]\nvalue = true\n"))).toBe("absent")
    expect(inspectExternalCodexContext7(Buffer.from([0xff]))).toBe("conflict")
  })

  it.each([
    'mcp_servers.context7.url = "https://mcp.context7.com/mcp"\n',
    'mcp_servers.context7 = { url = "https://mcp.context7.com/mcp" }\n',
    '[mcp_servers]\ncontext7 = { url = "https://mcp.context7.com/mcp" }\n',
    '"mcp_servers".context7.url = "https://mcp.context7.com/mcp"\n',
    'mcp_servers."context7" = { url = "https://mcp.context7.com/mcp" }\n',
    '[mcp_servers]\n"context7" = { url = "https://mcp.context7.com/mcp" }\n',
    'mcp_servers = { context7 = { url = "https://mcp.context7.com/mcp" } }\n',
    '"mcp_ser\\u0076ers".context7.url = "https://mcp.context7.com/mcp"\n',
    '["mcp_ser\\u0076ers".context7]\nurl = "https://mcp.context7.com/mcp"\n',
    '["mcp_servers"]\n"context7" = { url = "https://mcp.context7.com/mcp" }\n',
    "['mcp_servers']\n'context7' = { url = 'https://mcp.context7.com/mcp' }\n",
    '"mcp_ser\\u0076ers" = { "con\\u0074ext7" = { url = "https://mcp.context7.com/mcp" } }\n',
    '[["mcp_ser\\u0076ers".context7]]\nurl = "https://mcp.context7.com/mcp"\n',
    '[["mcp_servers".context7]]\nurl = "https://mcp.context7.com/mcp"\n',
  ])("protects dotted or inline Context7 definitions %#", (external) => {
    expect(inspectExternalCodexContext7(Buffer.from(external))).toBe("conflict")
  })

  it("does not treat unrelated escaped keys as Context7 candidates", () => {
    expect(
      inspectExternalCodexContext7(
        Buffer.from(
          '"other\\u0076alue" = { nested = true }\n[["another\\u0076alue".entry]]\n',
        ),
      ),
    ).toBe("absent")
  })

  it("ignores a Context7 table inside the excluded managed range", () => {
    const content = renderManagedBlock(blockId, body)
    const inspection = inspectManagedBlock(content, blockId)
    expect(inspection.status).toBe("complete")
    if (inspection.status !== "complete") return
    expect(inspectExternalCodexContext7(content, inspection.range)).toBe("absent")
  })
})
