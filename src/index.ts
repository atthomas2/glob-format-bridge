// Core conversion logic between the two glob-list formats:
//
//   "ignore" - line-based, like .gitignore/.npmignore/.dockerignore:
//     # comment
//     node_modules/
//     !node_modules/keep-this/
//
//   "json"   - an array a script can consume directly, e.g. for a
//     package.json "files" list or a custom build config:
//     [ { "comment": "comment" }, { "pattern": "node_modules/" }, ... ]
//
// Both formats round-trip through the same GlobEntry[] shape so comments
// and negation survive a conversion in either direction.

export type GlobEntry =
  | { kind: "comment"; text: string }
  | { kind: "pattern"; pattern: string; negate: boolean }

export type Format = "ignore" | "json"

export interface ParseWarning {
  line: number
  message: string
}

export interface ParseResult {
  entries: GlobEntry[]
  warnings: ParseWarning[]
}

export function parseIgnore(content: string): ParseResult {
  const entries: GlobEntry[] = []
  const warnings: ParseWarning[] = []
  const lines = content.split(/\r?\n/)

  lines.forEach((rawLine, index) => {
    // gitignore trims trailing whitespace unless it's backslash-escaped;
    // that edge case is rare enough to leave for later.
    const line = rawLine.replace(/\s+$/, "")
    if (line.trim() === "") return

    if (line.startsWith("#")) {
      entries.push({ kind: "comment", text: line.slice(1).trim() })
      return
    }

    let pattern = line
    let negate = false
    if (pattern.startsWith("!")) {
      negate = true
      pattern = pattern.slice(1)
    }
    if (pattern.startsWith("\\#") || pattern.startsWith("\\!")) {
      pattern = pattern.slice(1)
    }
    if (pattern === "") {
      warnings.push({ line: index + 1, message: "pattern is empty after stripping negation" })
      return
    }
    entries.push({ kind: "pattern", pattern, negate })
  })

  return { entries, warnings }
}

export function parseJsonList(content: string): ParseResult {
  const warnings: ParseWarning[] = []
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch (err) {
    throw new Error(`invalid JSON: ${(err as Error).message}`)
  }
  if (!Array.isArray(data)) {
    throw new Error("expected top-level JSON array of entries")
  }

  const entries: GlobEntry[] = data.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`entry ${index} is not an object`)
    }
    const obj = raw as Record<string, unknown>
    if (typeof obj.comment === "string" && obj.pattern === undefined) {
      return { kind: "comment", text: obj.comment }
    }
    if (typeof obj.pattern !== "string") {
      throw new Error(`entry ${index} is missing a "pattern" string`)
    }
    if (obj.negate !== undefined && typeof obj.negate !== "boolean") {
      throw new Error(`entry ${index} has a non-boolean "negate" field`)
    }
    return { kind: "pattern", pattern: obj.pattern, negate: obj.negate === true }
  })

  return { entries, warnings }
}

export function formatIgnore(entries: GlobEntry[]): string {
  const lines = entries.map((entry) =>
    entry.kind === "comment" ? `# ${entry.text}` : `${entry.negate ? "!" : ""}${entry.pattern}`
  )
  return lines.join("\n") + "\n"
}

export function formatJsonList(entries: GlobEntry[]): string {
  const data = entries.map((entry) =>
    entry.kind === "comment"
      ? { comment: entry.text }
      : entry.negate
        ? { pattern: entry.pattern, negate: true }
        : { pattern: entry.pattern }
  )
  return JSON.stringify(data, null, 2) + "\n"
}

export interface ConvertStats {
  patternCount: number
  negatedCount: number
  commentCount: number
}

export function summarize(entries: GlobEntry[]): ConvertStats {
  let patternCount = 0
  let negatedCount = 0
  let commentCount = 0
  for (const entry of entries) {
    if (entry.kind === "comment") {
      commentCount += 1
    } else {
      patternCount += 1
      if (entry.negate) negatedCount += 1
    }
  }
  return { patternCount, negatedCount, commentCount }
}

export function parse(content: string, format: Format): ParseResult {
  return format === "json" ? parseJsonList(content) : parseIgnore(content)
}

export function render(entries: GlobEntry[], format: Format): string {
  return format === "json" ? formatJsonList(entries) : formatIgnore(entries)
}

export function detectFormat(filePath: string): Format {
  return filePath.toLowerCase().endsWith(".json") ? "json" : "ignore"
}

export function otherFormat(format: Format): Format {
  return format === "json" ? "ignore" : "json"
}
