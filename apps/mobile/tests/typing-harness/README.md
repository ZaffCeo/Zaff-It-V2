# Search-bar typing regression harness (jsdom, sandbox-only)

Proves the customer home search `TextInput` accepts typed text at the real DOM level
(react-native-web renders an `<input>` in jsdom) and that the typewriter
placeholder timer chain keeps ticking.

Run (from repo root, needs `npm i --no-save jsdom esbuild` first):

    node apps/mobile/tests/typing-harness/driver.mjs

- `TYPED VALUE: "doodh aur atta"` + `RESULT: TYPING_OK` = pass.
- Placeholder may read FROZEN in jsdom: React-19 concurrent scheduler commits
  stall in jsdom (environment artifact) — the tick counter (`TW TICKS`) proves
  the chain is alive; visual animation must be confirmed on a real browser/preview.
- Native-only expo modules + reanimated + flash-list + safe-area-context are
  stubbed under `stubs/` — this harness never ships in the app bundle
  (`tsconfig.json` includes only `src/**`).
