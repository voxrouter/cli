// __VERSION__ is replaced at compile time by `bun build --define`. The
// release workflow passes the tag's version; local `bun src/index.ts` runs
// have no define and fall through to "0.0.0-dev". This keeps the source in
// git matching what's compiled — no CI sed-rewriting source.

declare const __VERSION__: string;

export const VERSION: string =
  typeof __VERSION__ === "string" ? __VERSION__ : "0.0.0-dev";
