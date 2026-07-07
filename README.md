# Forklift GUI

A desktop GUI that sits on top of the [Forklift](https://github.com/lonic-software/forklift)
VCS. Built with [Tauri](https://tauri.app) (Rust) + React + TypeScript.

It is a **thin, decoupled** front end: it never links `forklift-core` or touches the
on-disk format. Instead it drives the `forklift` CLI through its stable, versioned
machine interface (`forklift … --json`, see the Forklift repo's `docs/MACHINE_INTERFACE.md`).
That contract — one JSON envelope per command, stable `error.code`s, deterministic exit
codes — is the *only* thing this app couples to, so it keeps working across Forklift
internal changes.

```
┌──────────────┐   invoke    ┌─────────────────┐   spawn + --json   ┌────────────┐
│  React UI    │ ─────────▶  │  Rust backend   │ ─────────────────▶ │  forklift  │
│  (src/)      │ ◀───────── │  (src-tauri/)    │ ◀───────────────── │  CLI binary│
└──────────────┘  typed JSON └─────────────────┘   envelope / text   └────────────┘
```

## How it works

The Rust backend (`src-tauri/src/forklift.rs`) exposes just three primitives:

- `detect_binary` — locate the `forklift` binary and read its version.
- `run_json(warehouse, args)` — run a subcommand with `--json`, return its `data`
  payload, or an `Err` carrying the stable `{ code, message, next_step }` on failure.
- `run_text(warehouse, args)` — run in human mode and strip ANSI (used for the
  line-level diff, which Forklift only renders as prose).

Every command-specific type and argument list lives in the TypeScript layer
(`src/api.ts`), next to the UI that uses it. Adding a Forklift command to the GUI is
usually a one-line addition to the `fk` object there — no Rust changes.

### Binary resolution

The backend finds `forklift` in this order:

1. an explicit path set in **Settings** (persisted in `localStorage`),
2. the `FORKLIFT_BIN` environment variable,
3. `forklift` on `PATH`,
4. a dev fallback: a sibling `../forklift/target/release/forklift` build.

## Features

| Panel | Forklift commands | Notes |
|-------|-------------------|-------|
| **Changes** | `stocktake`, `load`, `unload`, `restore`, `stack`, `diff` | Stage/unstage, discard, inline line-level diff, commit box (⌘↵) |
| **History** | `history` + `office` | Parcel log with a graph rail; joins the office registry to badge each author's **identity class** (human / agent / bot / service) and role |
| **Pallets** | `palletize`, `shift` | Branch list, switch, create (sidebar) |
| **Remote** | `lift`, `lower` | Push / pull from the top bar |
| **Office** | `office`, `audit` | Signed identities, roles, keys; one-click offline `audit` of the signed history |
| **Tags** | `tag list` | Signed release tags (read-only) |
| **Hauls** | `haul list` | Pull requests (read-only) |

## Develop

Prerequisites: [Rust](https://rustup.rs), Node + [pnpm](https://pnpm.io), and a
`forklift` binary (see resolution order above).

```sh
pnpm install
pnpm tauri dev      # run the app with hot reload
pnpm tauri build    # produce a distributable bundle
pnpm build          # typecheck + build the frontend only
```

Run the backend's tests (they exercise the real `forklift` binary end-to-end):

```sh
cd src-tauri && cargo test
```

## Roadmap

- **Phase 1 (done):** core commit workflow — changes, diff, commit, history, pallets.
- **Phase 2 (done):** branches + remote (shift/palletize, lift/lower).
- **Phase 3 (in progress):** the differentiators — identity-aware history, office/trust
  viewer, tags, hauls (read-only).
- **Next:** write flows for tags/hauls (create, comment, review, merge), a blame view,
  conflict resolution UI (`conflicts` gives content-addressed sides), `consolidate`
  from the pallet list, `park` (stash), and `undo`.

## License

MIT OR Apache-2.0, matching Forklift.
