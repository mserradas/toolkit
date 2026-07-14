export const TARGETS = ["opencode", "claude", "codex"] as const

export type Target = (typeof TARGETS)[number]
export type InstallScope = "user" | "project"

export type ArtifactKind =
  | "agent"
  | "command"
  | "configuration"
  | "skill"
  | "documentation"
  | "plugin"
  | "policy"

export interface Artifact {
  target: Target
  targets?: Target[]
  kind: ArtifactKind
  name: string
  destination: string
  root: string
  content: Buffer
  mode: number
}

export interface SourceFile {
  relativePath: string
  content: Buffer
  mode: number
}

export interface SourceMarkdown {
  name: string
  fileName: string
  raw: string
  body: string
  frontmatter: Record<string, unknown>
}

export interface SourceSkill extends SourceMarkdown {
  files: SourceFile[]
}

export interface Catalog {
  agents: SourceMarkdown[]
  commands: SourceMarkdown[]
  skills: SourceSkill[]
  sharedRules: string
  documentation: SourceFile[]
  openCodeConfigFiles: SourceFile[]
  openCodePlugins: SourceFile[]
}

export interface BuildContext {
  assetsRoot: string
  homeDir: string
  projectRoot: string
  scope: InstallScope
}

export type PlanAction = "create" | "update" | "adopt" | "unchanged" | "conflict"

export interface PlanItem {
  artifact: Artifact
  action: PlanAction
  reason: string
  currentHash?: string
  desiredHash: string
}

export interface InstallPlan {
  items: PlanItem[]
  obsolete: ObsoletePlanItem[]
  statePath: string
  stateDir: string
}

export interface OriginalFile {
  existed: boolean
  backupPath?: string
  mode?: number
}

export interface OwnedFile {
  target: Target
  targets?: Target[]
  kind: ArtifactKind
  name: string
  path: string
  root: string
  afterHash: string
  original: OriginalFile
  installedAt: string
}

export interface InstallState {
  schemaVersion: 1
  scope: InstallScope
  root: string
  files: OwnedFile[]
  updatedAt: string
}

export type ObsoleteAction = "remove" | "restore" | "detach" | "skip"

export interface ObsoletePlanItem {
  file: OwnedFile
  action: ObsoleteAction
  obsoleteTargets: Target[]
  remainingTargets: Target[]
  reason: string
  currentHash?: string
}

export interface InstallResult {
  created: number
  updated: number
  adopted: number
  unchanged: number
  removed: number
  restored: number
  detached: number
  skipped: number
  statePath: string
}

export interface UninstallResult {
  restored: string[]
  removed: string[]
  skipped: Array<{ path: string; reason: string }>
  statePath: string
}

export function owningTargets(value: { target: Target; targets?: Target[] }): Target[] {
  return [...new Set(value.targets ?? [value.target])]
}
