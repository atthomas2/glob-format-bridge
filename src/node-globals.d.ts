// Hand-rolled ambient declarations for the handful of Node built-ins this
// project touches. Pulling in @types/node just for `process` and two fs
// functions felt like the wrong trade for a zero-dependency tool.

declare const process: {
  argv: string[]
  stdout: { write(chunk: string): void }
  stderr: { write(chunk: string): void }
  exit(code: number): never
}

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string
  export function writeFileSync(path: string, data: string, encoding: "utf8"): void
}
