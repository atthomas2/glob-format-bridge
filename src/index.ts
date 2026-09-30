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

// Number of consecutive backslashes immediately before position `end`.
function backslashesBefore(text: string, end: number): number {
  let count = 0
  while (end - count > 0 && text[end - count - 1] === "\\") count += 1
  return count
}

// git drops trailing spaces from a line unless the last one is escaped with
// a backslash ("foo\ " keeps its space). An even number of backslashes before
// the space means they escape each other and the space is not protected.
function trimTrailingSpaces(line: string): string {
  let end = line.length
  while (end > 0 && line[end - 1] === " ") {
    if (backslashesBefore(line, end - 1) % 2 === 1) break
    end -= 1
  }
  return line.slice(0, end)
}

// Inverse of trimTrailingSpaces for output: protect trailing spaces that
// came from a JSON pattern so the ignore file doesn't silently lose them.
function escapeTrailingSpaces(pattern: string): string {
  const match = /( +)$/.exec(pattern)
  if (!match) return pattern
  const runStart = pattern.length - match[1].length
  const alreadyEscaped = backslashesBefore(pattern, runStart) % 2 === 1
  const firstPlain = alreadyEscaped ? 1 : 0
  return (
    pattern.slice(0, runStart) +
    (alreadyEscaped ? " " : "") +
    "\\ ".repeat(match[1].length - firstPlain)
  )
}

export function parseIgnore(content: string): ParseResult {
  const entries: GlobEntry[] = []
  const warnings: ParseWarning[] = []
  const lines = content.split(/\r?\n/)

  lines.forEach((rawLine, index) => {
    const line = trimTrailingSpaces(rawLine)
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
    } else if (pattern.startsWith("\\#") || pattern.startsWith("\\!")) {
      // Only meaningful at the start of the line. The unescaped form is what
      // the JSON side should see; formatIgnore puts the backslash back.
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
  const lines = entries.map((entry) => {
    if (entry.kind === "comment") return `# ${entry.text}`
    let pattern = escapeTrailingSpaces(entry.pattern)
    // A leading # or ! would otherwise read back as a comment or negation.
    // After a "!" prefix neither is special, so leave those alone.
    if (!entry.negate && (pattern.startsWith("#") || pattern.startsWith("!"))) {
      pattern = "\\" + pattern
    }
    return `${entry.negate ? "!" : ""}${pattern}`
  })
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
