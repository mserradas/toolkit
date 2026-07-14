import path from "node:path"
import type { Artifact, ArtifactKind, SourceSkill, Target } from "../core/types.js"
import { renderMarkdown } from "../core/frontmatter.js"

export function textArtifact(input: {
  target: Target
  kind: ArtifactKind
  name: string
  root: string
  destination: string
  content: string | Buffer
  mode?: number
}): Artifact {
  return {
    target: input.target,
    kind: input.kind,
    name: input.name,
    root: input.root,
    destination: input.destination,
    content: Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, "utf8"),
    mode: input.mode ?? 0o644,
  }
}

export function copySkillArtifacts(
  target: Target,
  skill: SourceSkill,
  skillsRoot: string,
): Artifact[] {
  const destinationRoot = path.join(skillsRoot, skill.name)
  return skill.files.map((file) =>
    textArtifact({
      target,
      kind: "skill",
      name: skill.name,
      root: skillsRoot,
      destination: path.join(destinationRoot, file.relativePath),
      content: file.content,
      mode: file.mode,
    }),
  )
}

export function copySharedSkillArtifacts(
  target: Target,
  skill: SourceSkill,
  skillsRoot: string,
): Artifact[] {
  const name = skill.name === "skill-creator" ? "ms-skill-creator" : skill.name
  const destinationRoot = path.join(skillsRoot, name)
  return skill.files.map((file) =>
    textArtifact({
      target,
      kind: "skill",
      name,
      root: skillsRoot,
      destination: path.join(destinationRoot, file.relativePath),
      content:
        file.relativePath === "SKILL.md" && name !== skill.name
          ? renderMarkdown({ ...skill.frontmatter, name }, skill.body)
          : file.content,
      mode: file.mode,
    }),
  )
}

export function embeddedAgentBody(sharedRules: string, body: string, compatibility: string): string {
  return [
    "# Reglas Compartidas MS",
    sharedRules.trim(),
    "# Compatibilidad De Plataforma",
    compatibility.trim(),
    "# Instrucciones Del Agente",
    body.trim(),
  ].join("\n\n")
}
