#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs"
import { parse, render, summarize, detectFormat, otherFormat, Format } from "./index.js"

interface Args {
  // null means "read from stdin" - either no positional was given, or it was "-"
  file: string | null
  from?: Format
  to?: Format
  out?: string
  json: boolean
}

function parseArgs(argv: string[]): Args {
  const positionals: string[] = []
  let from: Format | undefined
  let to: Format | undefined
  let out: string | undefined
  let json = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case "--from":
        from = requireFormat(argv[++i], "--from")
        break
      case "--to":
        to = requireFormat(argv[++i], "--to")
        break
      case "--out":
        out = argv[++i]
        if (out === undefined) throw new Error("--out requires a file path")
        break
      case "--json":
        json = true
        break
      default:
        if (arg.startsWith("--")) throw new Error(`unknown flag: ${arg}`)
        positionals.push(arg)
    }
  }

  if (positionals.length > 1) {
    throw new Error("expected at most one input file argument")
  }

  const file = positionals.length === 0 || positionals[0] === "-" ? null : positionals[0]
  return { file, from, to, out, json }
}

function requireFormat(value: string | undefined, flag: string): Format {
  if (value !== "ignore" && value !== "json") {
    throw new Error(`${flag} must be "ignore" or "json"`)
  }
  return value
}

function usage(): string {
  return [
    "usage: globfmt [file] [--from ignore|json] [--to ignore|json] [--out <path>] [--json]",
    "",
    "  file     input file to convert; omit or pass \"-\" to read from stdin",
    "  --from   input format, inferred from the file extension when omitted",
    "           (required when reading from stdin, since there's no extension)",
    "  --to     output format, defaults to the other format when omitted",
    "  --out    write the result to a file instead of stdout",
    "  --json   emit a JSON report (stats, warnings, output) instead of plain text",
  ].join("\n")
}

function main(): void {
  let args: Args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n\n${usage()}\n`)
    process.exit(1)
  }

  if (args.file === null && args.from === undefined) {
    process.stderr.write(`error: --from is required when reading from stdin\n\n${usage()}\n`)
    process.exit(1)
  }

  const from = args.from ?? detectFormat(args.file as string)
  const to = args.to ?? otherFormat(from)
  const source = args.file ?? "(stdin)"

  let content: string
  try {
    content = args.file === null ? readFileSync(0, "utf8") : readFileSync(args.file, "utf8")
  } catch (err) {
    process.stderr.write(`error: could not read ${source}: ${(err as Error).message}\n`)
    process.exit(1)
  }

  let result
  try {
    result = parse(content, from)
  } catch (err) {
    process.stderr.write(`error: could not parse ${source} as ${from}: ${(err as Error).message}\n`)
    process.exit(1)
  }

  const output = render(result.entries, to)
  const stats = summarize(result.entries)

  if (args.out) {
    writeFileSync(args.out, output, "utf8")
  }

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          file: source,
          from,
          to,
          out: args.out ?? null,
          stats,
          warnings: result.warnings,
          output: args.out ? null : output,
        },
        null,
        2
      ) + "\n"
    )
    return
  }

  process.stderr.write(
    `converted ${stats.patternCount} pattern(s) (${stats.negatedCount} negated, ${stats.commentCount} comment(s)) from ${from} to ${to}\n`
  )
  for (const warning of result.warnings) {
    process.stderr.write(`warning: line ${warning.line}: ${warning.message}\n`)
  }
  if (args.out) {
    process.stderr.write(`wrote ${args.out}\n`)
  } else {
    process.stdout.write(output)
  }
}

main()
