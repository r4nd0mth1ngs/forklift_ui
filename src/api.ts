// Typed access to the `forklift` CLI, layered over the three Rust primitives
// (detect_binary / run_json / run_text). The Rust side is intentionally generic; every
// command-specific type and argument list lives here, next to the UI that uses it.
//
// This mirrors forklift's stable machine interface (docs/MACHINE_INTERFACE.md): the
// `data` payloads below are the documented `--json` shapes, verified against the CLI.

import { invoke } from "@tauri-apps/api/core";

// ---- Errors -----------------------------------------------------------------

/** A classified forklift failure. `code` is stable and safe to branch on. */
export interface ForkliftError {
  code: string;
  message: string;
  next_step?: string;
}

export function isForkliftError(value: unknown): value is ForkliftError {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

// ---- Binary detection -------------------------------------------------------

export interface BinaryInfo {
  path: string;
  version: string;
  source: string;
}

const BIN_KEY = "forklift.bin";
let binOverride: string | undefined = localStorage.getItem(BIN_KEY) ?? undefined;

export function getBinOverride(): string | undefined {
  return binOverride;
}

export function setBinOverride(value?: string): void {
  binOverride = value && value.trim() ? value.trim() : undefined;
  if (binOverride) localStorage.setItem(BIN_KEY, binOverride);
  else localStorage.removeItem(BIN_KEY);
}

export function detectBinary(): Promise<BinaryInfo> {
  return invoke<BinaryInfo>("detect_binary", { binOverride });
}

/** Install forklift from its repo (the official installer script). Returns the output. */
export function installForklift(): Promise<string> {
  return invoke<string>("install_forklift");
}

// ---- Signing passphrase -----------------------------------------------------
// Held in memory only (never localStorage). Passed through to `forklift` as
// FORKLIFT_KEY_PASSPHRASE so a protected key can be unlocked / a new key protected
// without a terminal prompt. Harmless for commands that don't sign.

let signingPassphrase: string | undefined;

export function setSigningPassphrase(value?: string): void {
  signingPassphrase = value && value.length ? value : undefined;
}
export function hasSigningPassphrase(): boolean {
  return signingPassphrase !== undefined;
}

// ---- Primitives -------------------------------------------------------------

function json<T>(warehouse: string | undefined, args: string[]): Promise<T> {
  return invoke<T>("run_json", { binOverride, warehouse, args, passphrase: signingPassphrase });
}

function text(warehouse: string | undefined, args: string[]): Promise<string> {
  return invoke<string>("run_text", { binOverride, warehouse, args, passphrase: signingPassphrase });
}

// ---- Command payload types --------------------------------------------------

export type ChangeKind = "untracked" | "modified" | "deleted" | "added" | string;

export interface Change {
  kind: ChangeKind;
  path: string;
}

export interface Stocktake {
  head: string | null;
  pallet: string;
  staged?: Change[];
  staged_count: number;
  unstaged?: Change[];
  unstaged_count: number;
  summary: boolean;
}

export interface DiffFiles {
  files: Change[];
  mode: string;
}

export interface ParcelAction {
  action: string; // "author" | "stack " | ...
  operator: string;
  timestamp: string;
  /** Present once trust is established. */
  class?: string;
  display_name?: string;
  supervisor?: string;
}

export interface HistoryEntry {
  parcel: string;
  description: string | null;
  actions: ParcelAction[];
}

export interface History {
  entries: HistoryEntry[];
}

export interface PalletRef {
  name: string;
  current: boolean;
}

export interface Pallets {
  current: string;
  current_unborn: boolean;
  pallets: PalletRef[];
}

export interface StackResult {
  pallet: string;
  parcel: string;
}

export interface OfficeState {
  enrolled: boolean;
  // When enrolled, forklift returns users/keys; kept loose until wired into the panel.
  users?: unknown[];
  keys?: unknown[];
  [key: string]: unknown;
}

export interface Tag {
  name: string;
  subject?: string;
  message?: string;
  tagger?: string;
  [key: string]: unknown;
}

export interface Tags {
  tags: Tag[];
}

/** keygen / enroll / rotate return a human message (with the admit/link lines to share). */
export interface OfficeMessage {
  message: string;
}

export type Role = "admin" | "writer" | "reader";
export type IdentityClassFlag = "agent" | "bot" | "service";

export interface HaulSummary {
  id: string;
  title: string;
  source: string;
  target: string;
  status: string; // open | merged | closed
  approvals: number;
}

export interface Hauls {
  hauls: HaulSummary[];
  state: string;
}

export interface HaulReview {
  author: string;
  body: string;
  verdict: string; // approve | request-changes | comment
}

export interface HaulThreadItem {
  author: string;
  body: string;
  kind: string; // comment | review
}

export interface HaulDetail {
  id: string;
  title: string;
  description: string | null;
  source: string;
  target: string;
  status: string;
  opened_by: string;
  head: string;
  reviews: HaulReview[];
  thread: HaulThreadItem[];
}

export type HaulState = "open" | "merged" | "closed" | "all";
export type ReviewVerdict = "approve" | "request-changes" | "comment";

// ---- Remaining command payloads ---------------------------------------------

export interface BlameLine {
  number: number;
  content: string;
  parcel: string;
}
export interface BlameParcelInfo {
  operator: string;
  timestamp: string;
  [key: string]: unknown;
}
export interface Blame {
  lines: BlameLine[];
  parcels: Record<string, BlameParcelInfo>;
}

export interface ConflictFile {
  path: string;
  markers: boolean;
  base?: string;
  ours?: string;
  theirs?: string;
}
export interface Conflicts {
  conflicts: ConflictFile[];
}

export interface ParkList {
  parked: unknown[];
}

export interface Bay {
  name: string;
  path?: string;
  pallet?: string;
  [key: string]: unknown;
}
export interface Bays {
  bays: Bay[];
}

export interface ConfigEntry {
  key: string;
  value?: string;
  scope?: string;
}
export interface ConfigList {
  entries: ConfigEntry[];
}

export interface ProfileInfo {
  name: string;
  identifier: string;
  local_keys: number;
}
export interface ProfileList {
  default?: ProfileInfo;
  profiles: ProfileInfo[];
}

export interface ManifestShow {
  entries?: unknown[];
  [key: string]: unknown;
}

export interface SelfUpdate {
  applied: boolean;
  current: string;
  latest?: string;
  update_available: boolean;
  install_method?: string;
  update_command?: string;
  message?: string;
}

// ---- Typed command surface --------------------------------------------------

export const fk = {
  // Working tree & staging
  stocktake: (wh: string) => json<Stocktake>(wh, ["stocktake"]),
  diffFiles: (wh: string, staged = false) =>
    json<DiffFiles>(wh, staged ? ["diff", "--staged"] : ["diff"]),
  /** Human-readable line-level diff (forklift only renders hunks in prose). */
  diffText: (wh: string, path?: string, staged = false) =>
    text(wh, ["diff", ...(staged ? ["--staged"] : []), ...(path ? [path] : [])]),
  /** Diff between two revisions (pallet names or parcel hashes). */
  diffRevsText: (wh: string, a: string, b: string, path?: string) =>
    text(wh, ["diff", a, b, ...(path ? [path] : [])]),
  load: (wh: string, path: string) => json(wh, ["load", path]),
  unload: (wh: string, path: string) => json(wh, ["unload", path]),
  restore: (wh: string, path: string, staged = false) =>
    json(wh, staged ? ["restore", "--staged", path] : ["restore", path]),

  // Commit & history
  stack: (wh: string, description: string) => json<StackResult>(wh, ["stack", description]),
  history: (wh: string, revision?: string) =>
    json<History>(wh, revision ? ["history", revision] : ["history"]),
  undo: (wh: string) => json(wh, ["undo"]),

  // Pallets (branches)
  pallets: (wh: string, all = false) => json<Pallets>(wh, all ? ["palletize", "--all"] : ["palletize"]),
  shift: (wh: string, pallet: string) => json(wh, ["shift", pallet]),
  palletize: (wh: string, name: string, revision?: string) =>
    json(wh, revision ? ["palletize", name, revision] : ["palletize", name]),
  consolidate: (wh: string, pallet: string) => json(wh, ["consolidate", pallet]),
  cherryPick: (wh: string, revision: string, message?: string) =>
    json(wh, ["cherry-pick", revision, ...(message ? ["-m", message] : [])]),
  deliver: (wh: string, target: string, message?: string) =>
    json(wh, ["deliver", target, ...(message ? ["-m", message] : [])]),

  // Working-tree extras
  blame: (wh: string, path: string, rev?: string) =>
    json<Blame>(wh, rev ? ["blame", "--rev", rev, path] : ["blame", path]),
  conflicts: (wh: string) => json<Conflicts>(wh, ["conflicts"]),
  peek: (wh: string, hash: string) => text(wh, ["peek", hash]),
  peekInventory: (wh: string, path: string) => text(wh, ["peek", "--inventory", path]),

  // Park (stash)
  park: (wh: string) => json(wh, ["park"]),
  parkPop: (wh: string) => json(wh, ["park", "pop"]),
  parkList: (wh: string) => json<ParkList>(wh, ["park", "list"]),

  // Config
  configList: (wh: string) => json<ConfigList>(wh, ["config"]),
  configSet: (wh: string, key: string, value: string, global = false) =>
    json(wh, ["config", ...(global ? ["--global"] : []), key, value]),
  configUnset: (wh: string, key: string, global = false) =>
    json(wh, ["config", ...(global ? ["--global"] : []), "--unset", key]),

  // Profiles
  profileList: (wh: string) => json<ProfileList>(wh, ["profile", "list"]),
  profileCreate: (wh: string, name: string, o: { displayName?: string; id?: string }) =>
    json(wh, ["profile", "create", name, ...(o.displayName ? ["--name", o.displayName] : []), ...(o.id ? ["--id", o.id] : [])]),
  profileUse: (wh: string, name: string) => json(wh, ["profile", "use", name]),

  // Bays (worktrees)
  bays: (wh: string) => json<Bays>(wh, ["bay"]),
  bayAdd: (wh: string, name: string, path?: string) => json(wh, ["bay", "add", name, ...(path ? [path] : [])]),
  bayRemove: (wh: string, name: string) => json(wh, ["bay", "remove", name]),

  // Manifest (post-metadata: notes, approvals, AI provenance)
  manifestShow: (wh: string, revision: string) => json<ManifestShow>(wh, ["manifest", "show", revision]),
  manifestNote: (wh: string, revision: string, message: string) => json(wh, ["manifest", "note", revision, "-m", message]),
  manifestApprove: (wh: string, revision: string, message?: string) =>
    json(wh, ["manifest", "approve", revision, ...(message ? ["-m", message] : [])]),
  manifestProvenance: (wh: string, revision: string, o: { model: string; tool?: string; session?: string; transcript?: string; message?: string }) =>
    json(wh, [
      "manifest", "provenance", revision, "--model", o.model,
      ...(o.tool ? ["--tool", o.tool] : []),
      ...(o.session ? ["--session", o.session] : []),
      ...(o.transcript ? ["--transcript", o.transcript] : []),
      ...(o.message ? ["-m", o.message] : []),
    ]),

  // Git interop / clone / update (some need no warehouse)
  franchise: (directory: string, url: string, o: { pallet?: string; token?: string }) =>
    json<unknown>(undefined, ["franchise", url, directory, ...(o.pallet ? ["--pallet", o.pallet] : []), ...(o.token ? ["--token", o.token] : [])]),
  importGit: (wh: string, path: string) => json(wh, ["import-git", path]),
  exportGit: (wh: string, path: string) => json(wh, ["export-git", path]),
  selfUpdate: (check: boolean) => json<SelfUpdate>(undefined, ["self-update", ...(check ? ["--check"] : [])]),

  // Remote
  lift: (wh: string) => json(wh, ["lift"]),
  lower: (wh: string) => json(wh, ["lower"]),
  configGet: (wh: string, key: string) => json<{ key: string; value: string }>(wh, ["config", key]),

  // Trust / office
  office: (wh: string) => json<OfficeState>(wh, ["office"]),
  audit: (wh: string, pallet?: string) => json(wh, pallet ? ["audit", pallet] : ["audit"]),
  officeEnroll: (wh: string, o: { offline?: boolean; protect?: boolean }) =>
    json<OfficeMessage>(wh, ["office", "enroll", ...(o.offline ? ["--offline"] : []), ...(o.protect ? ["--passphrase"] : [])]),
  officeKeygen: (wh: string, protect: boolean) =>
    json<OfficeMessage>(wh, ["office", "keygen", ...(protect ? ["--passphrase"] : [])]),
  officeAdmit: (wh: string, o: {
    operator: string; publicKey: string; pop: string; role: Role;
    pallets: string[]; klass?: IdentityClassFlag; supervisor?: string;
  }) =>
    json(wh, [
      "office", "admit", o.operator, o.publicKey, o.pop,
      "--role", o.role,
      ...o.pallets.flatMap((p) => ["--pallet", p]),
      ...(o.klass ? [`--${o.klass}`] : []),
      ...(o.supervisor ? ["--supervisor", o.supervisor] : []),
    ]),
  officeLink: (wh: string, publicKey: string, pop: string) => json(wh, ["office", "link", publicKey, pop]),
  officeAuthorize: (wh: string, operator: string, publicKey: string, pop: string) =>
    json(wh, ["office", "authorize", operator, publicKey, pop]),
  officeRole: (wh: string, identifier: string, role: Role, pallets: string[]) =>
    json(wh, ["office", "role", identifier, role, ...pallets.flatMap((p) => ["--pallet", p])]),
  officeRotate: (wh: string, o: { offline?: boolean; protect?: boolean }) =>
    json<OfficeMessage>(wh, ["office", "rotate", ...(o.offline ? ["--offline"] : []), ...(o.protect ? ["--passphrase"] : [])]),
  officeRetire: (wh: string, o: { keyId: string; compromised?: boolean; offline?: boolean }) =>
    json(wh, ["office", "retire", o.keyId, ...(o.compromised ? ["--compromised"] : []), ...(o.offline ? ["--offline"] : [])]),
  officeRegenesis: (wh: string, confirm: boolean) => json<OfficeMessage>(wh, ["office", "regenesis", ...(confirm ? ["--confirm"] : [])]),
  officeAcceptRegenesis: (wh: string, confirm: boolean) =>
    json<OfficeMessage>(wh, ["office", "accept-regenesis", ...(confirm ? ["--confirm"] : [])]),

  // Tags
  tags: (wh: string) => json<Tags>(wh, ["tag", "list"]),
  tagShow: (wh: string, name: string) => json<Tag>(wh, ["tag", "show", name]),
  tagCreate: (wh: string, o: { name: string; revision?: string; message?: string }) =>
    json(wh, ["tag", "create", o.name, ...(o.revision ? [o.revision] : []), ...(o.message ? ["-m", o.message] : [])]),

  // Hauls (pull requests)
  hauls: (wh: string, state: HaulState = "open") => json<Hauls>(wh, ["haul", "list", "--state", state]),
  haulShow: (wh: string, id: string) => json<HaulDetail>(wh, ["haul", "show", id]),
  haulOpen: (wh: string, o: { target: string; source?: string; title: string; message?: string }) =>
    json<{ id: string; source: string; target: string; title: string }>(wh, [
      "haul", "open",
      "--target", o.target,
      ...(o.source ? ["--source", o.source] : []),
      "--title", o.title,
      ...(o.message ? ["-m", o.message] : []),
    ]),
  haulComment: (wh: string, id: string, message: string) => json(wh, ["haul", "comment", id, "-m", message]),
  haulReview: (wh: string, id: string, verdict: ReviewVerdict) =>
    json(wh, [
      "haul", "review", id,
      ...(verdict === "request-changes" ? ["--request-changes"] : verdict === "comment" ? ["--comment"] : []),
    ]),
  haulMerge: (wh: string, id: string) => json(wh, ["haul", "merge", id]),
  haulClose: (wh: string, id: string) => json(wh, ["haul", "close", id]),
  haulReopen: (wh: string, id: string) => json(wh, ["haul", "reopen", id]),
};
