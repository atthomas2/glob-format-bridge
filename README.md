# globfmt

Converts a list of glob patterns between the two shapes I keep running into:

- **ignore-style files** - `.gitignore`, `.npmignore`, `.dockerignore`,
  `.prettierignore`: one pattern per line, `#` comments, `!` negation.
- **JSON arrays** - what you need when a pattern list has to live inside a
  config file or get built up by a script, e.g. a custom `"files"` list or
  build tool config that only speaks JSON.

Keeping both in sync by hand is where the mistakes creep in: a negated line
gets flattened, a comment gets dropped, someone forgets to double the
backslashes in the JSON version. `globfmt` parses one format into a plain
list of entries and renders it back out in the other, so nothing gets lost
in between.

## Usage

```
$ cat .gitignore
# dependencies
node_modules/
# but keep vendored fixtures
!node_modules/.fixtures/

$ globfmt .gitignore --to json
[
  {
    "comment": "dependencies"
  },
  {
    "pattern": "node_modules/"
  },
  {
    "comment": "but keep vendored fixtures"
  },
  {
    "pattern": "node_modules/.fixtures/",
    "negate": true
  }
]
```

The input format is inferred from the file extension (`.json` means JSON,
anything else is treated as ignore-style), and the output format defaults to
whichever format that isn't. Both can be set explicitly with `--from` and
`--to`.

By default the tool prints a one-line human-readable summary to stderr and
the converted content to stdout. Pass `--json` to get a single machine-
readable report on stdout instead, useful when another script needs the
result and the stats together:

```
$ globfmt patterns.json --to ignore --json
{
  "ok": true,
  "file": "patterns.json",
  "from": "json",
  "to": "ignore",
  "out": null,
  "stats": {
    "patternCount": 2,
    "negatedCount": 1,
    "commentCount": 2
  },
  "warnings": [],
  "output": "# dependencies\nnode_modules/\n# but keep vendored fixtures\n!node_modules/.fixtures/\n"
}
```

Write the converted output straight to a file instead of stdout with `--out`:

```
$ globfmt .gitignore --to json --out patterns.json
```

The input file can also be piped in on stdin - omit it or pass `-`. Since
there's no filename to infer a format from, `--from` is required in that case:

```
$ cat .gitignore | globfmt --from ignore --to json
```

## Building

No dependencies to install - clone it and run:

```
$ npm run build
$ node dist/cli.js .gitignore --to json
```

## Format reference

An ignore-style pattern:

```
!vendor/keep-this.log
```

becomes:

```json
{ "pattern": "vendor/keep-this.log", "negate": true }
```

A `negate` field is only present (and `true`) for negated patterns; plain
patterns just have `pattern`. Standalone comment lines become
`{ "comment": "..." }` entries, in the same position they appeared in the
source file, so round-tripping a file through both formats reproduces it.
