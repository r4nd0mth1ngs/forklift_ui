// Settings & tools — a tabbed dialog. Some tabs need an open warehouse (config, profiles,
// git interop, object inspect); binary + updates work anywhere. Rendered outside the app
// context, so each tab manages its own load/reload and status locally.

import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  BinaryInfo, CompactResult, ConfigList, detectBinary, fk, getBinOverride, installForklift, PackProblem, ProfileList,
  ScopeStatus, SelfUpdate, setBinOverride, Shown, StoreHealth,
} from "../api";
import { asError, shortHash, useLoad } from "../common";
import { Modal, Field } from "./Modal";
import { TERMS, TermKey, useTerms, VOCABULARIES } from "../terms";

type Tab = "terms" | "binary" | "config" | "profiles" | "git" | "store" | "scope" | "inspect" | "updates";

export function SettingsModal(props: { wh?: string; binVersion?: string; onClose: () => void; onDetected: (info: BinaryInfo) => void }) {
  const [tab, setTab] = useState<Tab>("terms");
  const wh = props.wh;

  const allTabs: { key: Tab; label: string; needsWh?: boolean }[] = [
    { key: "terms", label: "Terminology" },
    { key: "binary", label: "Binary" },
    { key: "config", label: "Config", needsWh: true },
    { key: "profiles", label: "Profiles", needsWh: true },
    { key: "git", label: "Git", needsWh: true },
    { key: "store", label: "Store", needsWh: true },
    { key: "scope", label: "Scope", needsWh: true },
    { key: "inspect", label: "Inspect", needsWh: true },
    { key: "updates", label: "Updates" },
  ];
  const tabs = allTabs.filter((t) => !t.needsWh || wh);

  return (
    <Modal title="Settings & tools" onClose={props.onClose} wide>
      <div className="tabs" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      <div style={{ maxHeight: 460, overflow: "auto" }}>
        {tab === "terms" && <TerminologyTab />}
        {tab === "binary" && <BinaryTab onDetected={props.onDetected} />}
        {tab === "config" && wh && <ConfigTab wh={wh} />}
        {tab === "profiles" && wh && <ProfilesTab wh={wh} />}
        {tab === "git" && wh && <GitTab wh={wh} />}
        {tab === "store" && wh && <StoreTab wh={wh} />}
        {tab === "scope" && wh && <ScopeTab wh={wh} />}
        {tab === "inspect" && wh && <InspectTab wh={wh} />}
        {tab === "updates" && <UpdatesTab binVersion={props.binVersion} onDetected={props.onDetected} />}
      </div>
    </Modal>
  );
}

// ---- Terminology ------------------------------------------------------------

function TerminologyTab() {
  const { vocab, setVocab, custom, setCustomTerm, resetCustom, t } = useTerms();
  const keys = Object.keys(TERMS) as TermKey[];

  return (
    <>
      <Field label="Vocabulary" hint="Choose the names the whole UI speaks. Applies instantly.">
        <select className="select wide" value={vocab} onChange={(e) => setVocab(e.target.value as typeof vocab)}>
          {VOCABULARIES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </Field>

      {vocab === "custom" ? (
        <>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)", flex: 1 }}>Type your own alias for any term; blank falls back to the Forklift name.</span>
            <button className="btn ghost sm" onClick={resetCustom}>Reset all</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
            {keys.map((key) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: "0 0 96px", fontSize: 12, color: "var(--text-dim)", textAlign: "right" }} title={`Forklift: ${TERMS[key].forklift}`}>
                  {TERMS[key].forklift}
                </span>
                <input
                  className="text-input"
                  style={{ fontSize: 12, padding: "4px 7px" }}
                  value={custom[key] ?? ""}
                  placeholder={TERMS[key].forklift}
                  onChange={(e) => setCustomTerm(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>Preview of this vocabulary:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(["warehouse", "parcel", "pallet", "stack", "consolidate", "shift", "lift", "lower", "haul", "park", "tag", "bay", "office"] as TermKey[]).map((key) => (
              <span key={key} className="pill">{TERMS[key].forklift} → <strong style={{ color: "var(--text)" }}>{t(key)}</strong></span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Status({ text, ok }: { text: string | null; ok?: boolean }) {
  if (!text) return null;
  return <div className="hint" style={{ color: ok === false ? "var(--red)" : ok ? "var(--green)" : "var(--text-dim)" }}>{text}</div>;
}

// ---- Binary -----------------------------------------------------------------

function BinaryTab({ onDetected }: { onDetected: (info: BinaryInfo) => void }) {
  const [path, setPath] = useState(getBinOverride() ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | undefined>();
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setBinOverride(path);
    setStatus("Detecting…");
    setOk(undefined);
    try {
      const info = await detectBinary();
      setOk(true);
      setStatus(`Found forklift ${info.version} (${info.source}) at ${info.path}`);
      onDetected(info);
    } catch (e) {
      setOk(false);
      setStatus(asError(e).message);
    }
  };

  const install = async () => {
    setBusy(true);
    setStatus("Installing forklift from its repo…");
    setOk(undefined);
    try {
      await installForklift();
      const info = await detectBinary();
      setOk(true);
      setStatus(`Installed — forklift ${info.version} at ${info.path}`);
      onDetected(info);
    } catch (e) {
      setOk(false);
      setStatus(asError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field label="Path to the forklift binary" hint="Resolution: this override → FORKLIFT_BIN → the newest forklift found across ~/.local/bin, ~/.cargo/bin, Homebrew, PATH, and a sibling dev build.">
        <input value={path} placeholder="leave blank to auto-detect" onChange={(e) => setPath(e.target.value)} className="text-input" />
      </Field>
      <Status text={status} ok={ok} />
      <div className="actions">
        <button className="btn" onClick={install} disabled={busy} title="Run the forklift repo's installer (a prebuilt binary → ~/.local/bin)">
          {busy ? "Installing…" : "Install forklift"}
        </button>
        <button className="btn primary" onClick={test} disabled={busy}>Test &amp; save</button>
      </div>
    </>
  );
}

// ---- Config -----------------------------------------------------------------

/** The documented configuration reference (docs/guide/cli.md §9), for autocomplete only. */
const CONFIG_KEYS: [string, string][] = [
  ["operator.name", "Your display name (local only)"],
  ["operator.identifier", "Your on-chain operator id"],
  ["operator.profile", "The named profile this warehouse acts under"],
  ["remote.url", "The remote warehouse URL — may be a .onion"],
  ["remote.token", "Bearer token, when the remote requires one"],
  ["remote.tor", "Route over Tor: auto (only .onion) | on | off"],
  ["remote.torProxy", "Tor SOCKS proxy (default socks5h://127.0.0.1:9050)"],
  ["maintenance.auto", "Auto-compact after mutating commands"],
  ["maintenance.loose", "Loose-object count that triggers a compact"],
  ["maintenance.packs", "Pack count that triggers a repack"],
];

function ConfigTab({ wh }: { wh: string }) {
  const [reload, setReload] = useState(0);
  const { data, error } = useLoad<ConfigList>(() => fk.configList(wh), [wh, reload]);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [global, setGlobal] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const set = async () => {
    if (!key.trim()) return;
    try {
      await fk.configSet(wh, key.trim(), value, global);
      setStatus(`Set ${key.trim()}`);
      setKey(""); setValue("");
      setReload((n) => n + 1);
    } catch (e) { setStatus(asError(e).message); }
  };
  const unset = async (k: string, scope?: string) => {
    try {
      await fk.configUnset(wh, k, scope === "global");
      setReload((n) => n + 1);
    } catch (e) { setStatus(asError(e).message); }
  };

  return (
    <>
      {error && <Status text={error.message} ok={false} />}
      <div style={{ marginBottom: 14 }}>
        {(data?.entries ?? []).map((entry) => (
          <div key={entry.key + (entry.scope ?? "")} className="list-row" style={{ padding: "6px 0" }}>
            <div style={{ flex: 1, fontFamily: "var(--mono)", fontSize: 12 }}>
              <strong>{entry.key}</strong>
              {entry.scope && <span className="pill" style={{ marginLeft: 6 }}>{entry.scope}</span>}
              <div style={{ color: "var(--text-dim)" }}>{entry.value ?? <em style={{ color: "var(--text-faint)" }}>(unset)</em>}</div>
            </div>
            {entry.value != null && <button className="btn ghost sm danger" onClick={() => unset(entry.key, entry.scope)}>Unset</button>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label="Key">
          <input className="text-input" list="fk-config-keys" value={key} onChange={(e) => setKey(e.target.value)} placeholder="operator.name" />
          {/* The setter is generic on purpose; this is only discoverability for the documented keys. */}
          <datalist id="fk-config-keys">
            {CONFIG_KEYS.map(([k, hint]) => <option key={k} value={k} label={hint} />)}
          </datalist>
        </Field>
        <Field label="Value"><input className="text-input" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <label className="check" style={{ paddingBottom: 8 }}><input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} /> global</label>
        <button className="btn primary" style={{ marginBottom: 0 }} disabled={!key.trim()} onClick={set}>Set</button>
      </div>
      <Status text={status} />
    </>
  );
}

// ---- Profiles ---------------------------------------------------------------

function ProfilesTab({ wh }: { wh: string }) {
  const [reload, setReload] = useState(0);
  const { data, error } = useLoad<ProfileList>(() => fk.profileList(wh), [wh, reload]);
  const [name, setName] = useState("");
  const [display, setDisplay] = useState("");
  const [id, setId] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    try {
      await fk.profileCreate(wh, name.trim(), { displayName: display || undefined, id: id || undefined });
      setStatus(`Created ${name.trim()}`);
      setName(""); setDisplay(""); setId("");
      setReload((n) => n + 1);
    } catch (e) { setStatus(asError(e).message); }
  };
  const use = async (n: string) => {
    try { await fk.profileUse(wh, n); setStatus(`Now acting as ${n}`); setReload((r) => r + 1); }
    catch (e) { setStatus(asError(e).message); }
  };

  const all = [data?.default, ...(data?.profiles ?? [])].filter(Boolean) as ProfileList["profiles"];

  return (
    <>
      {error && <Status text={error.message} ok={false} />}
      <div style={{ marginBottom: 14 }}>
        {all.map((p) => (
          <div key={p.name} className="list-row" style={{ padding: "6px 0" }}>
            <div style={{ flex: 1 }}>
              <strong>{p.name}</strong>
              <span className="pill" style={{ marginLeft: 6 }}>{p.local_keys} keys</span>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>{p.identifier}</div>
            </div>
            <button className="btn ghost sm" onClick={() => use(p.name)}>Use</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label="Name"><input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="work" /></Field>
        <Field label="Display name (optional)"><input className="text-input" value={display} onChange={(e) => setDisplay(e.target.value)} /></Field>
        <Field label="Operator id (optional)"><input className="text-input" value={id} onChange={(e) => setId(e.target.value)} /></Field>
        <button className="btn primary" style={{ marginBottom: 0 }} disabled={!name.trim()} onClick={create}>Create</button>
      </div>
      <Status text={status} />
    </>
  );
}

// ---- Git interop ------------------------------------------------------------

function GitTab({ wh }: { wh: string }) {
  const [exportPath, setExportPath] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | undefined>();

  const run = async (action: Promise<unknown>, label: string) => {
    setStatus(`${label}…`); setOk(undefined);
    try { await action; setStatus(`${label} — done.`); setOk(true); }
    catch (e) { setStatus(asError(e).message); setOk(false); }
  };

  return (
    <>
      <Field label="Export to a new git repository" hint="One-way, lossy: signatures, office and manifest have no git home and are dropped.">
        <div style={{ display: "flex", gap: 8 }}>
          <input className="text-input" value={exportPath} onChange={(e) => setExportPath(e.target.value)} placeholder="/path/to/new/dir" />
          <button className="btn" disabled={!exportPath.trim()} onClick={() => run(fk.exportGit(wh, exportPath.trim()), "Export")}>Export</button>
        </div>
      </Field>
      <Status text={status} ok={ok} />
      <div className="hint" style={{ marginTop: 14 }}>
        Importing a git repository creates a colocated warehouse, so it lives on the welcome screen
        (“Import from git…”), not here. Close this warehouse to reach it.
      </div>
    </>
  );
}

// ---- Inspect (peek by hash, show by revision:path) --------------------------

const OUTPUT_BOX: React.CSSProperties = {
  whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--mono)", fontSize: 12,
  background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 12,
  userSelect: "text", maxHeight: 300, overflow: "auto",
};

function InspectTab({ wh }: { wh: string }) {
  const [hash, setHash] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data, error, loading } = useLoad<string>(() => (submitted ? fk.peek(wh, submitted) : Promise.resolve("")), [wh, submitted]);

  return (
    <>
      <Field label="Peek an object by hash" hint="Dump a blob's bytes, a tree's entries, or a parcel's fields.">
        <div style={{ display: "flex", gap: 8 }}>
          <input className="text-input" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="object hash (≥4 hex)" />
          <button className="btn" disabled={!hash.trim()} onClick={() => setSubmitted(hash.trim())}>Peek</button>
        </div>
      </Field>
      {loading && submitted && <div className="hint">Reading…</div>}
      {error && <Status text={error.message} ok={false} />}
      {data && <pre style={OUTPUT_BOX}>{data}</pre>}
      <ShowFile wh={wh} />
    </>
  );
}

/** `show <revision>:<path>` — a file's content at a revision, without resolving trees by hand. */
function ShowFile({ wh }: { wh: string }) {
  const [revision, setRevision] = useState("main");
  const [path, setPath] = useState("");
  const [asked, setAsked] = useState<{ revision: string; path: string } | null>(null);
  const { data, error, loading } = useLoad<Shown | null>(
    () => (asked ? fk.show(wh, asked.revision, asked.path) : Promise.resolve(null)),
    [wh, asked],
  );

  return (
    <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      <Field label="Show a file at a revision" hint="A pallet name, an @meta pallet, or a parcel hash prefix — plus the path.">
        <div style={{ display: "flex", gap: 8 }}>
          <input className="text-input" style={{ flex: "0 0 150px" }} value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="main" />
          <input className="text-input" value={path} onChange={(e) => setPath(e.target.value)} placeholder="src/app.rs" />
          <button className="btn" disabled={!revision.trim() || !path.trim()} onClick={() => setAsked({ revision: revision.trim(), path: path.trim() })}>Show</button>
        </div>
      </Field>
      {loading && asked && <div className="hint">Reading…</div>}
      {error && <Status text={error.message} ok={false} />}
      {data && (
        <>
          <div className="hint" style={{ marginBottom: 6 }}>
            {shortHash(data.revision)} · {fmtBytes(data.size)}
            {data.chunk_count != null && ` · chunked into ${data.chunk_count} pieces`}
          </div>
          {/* A binary or chunked file has no `content` — forklift reports metadata rather than
              assembling gigabytes or mangling raw bytes through a lossy text conversion. */}
          <pre style={OUTPUT_BOX}>
            {data.binary
              ? `(${data.chunk_count != null ? "large chunked file" : "binary contents"}; not shown)`
              : data.content}
          </pre>
        </>
      )}
    </div>
  );
}

// ---- Store (object-store health + compaction) -------------------------------

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function StoreTab({ wh }: { wh: string }) {
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useLoad<StoreHealth>(() => fk.store(wh), [wh, reload]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const compact = async (all: boolean, redelta = false) => {
    setBusy(true);
    setStatus(redelta ? "Re-deltaing the whole store…" : all ? "Repacking…" : "Compacting…");
    try {
      const r: CompactResult = await fk.compact(wh, all, redelta);
      // A skipped object is left in place and stays readable, but is worth saying out loud:
      // corrupt ones warrant an audit, over-ceiling ones simply predate the 64 MiB limit.
      const skipped = [
        r.corrupt_skipped ? `${r.corrupt_skipped} corrupt (run an audit)` : "",
        r.over_ceiling_skipped ? `${r.over_ceiling_skipped} over the size ceiling` : "",
      ].filter(Boolean);
      setStatus([
        r.objects_packed > 0
          ? `Packed ${r.objects_packed} object${r.objects_packed === 1 ? "" : "s"} into ${r.packs_written} pack${r.packs_written === 1 ? "" : "s"} (${r.deltas} deltas).`
          : "Nothing to compact — the store is already packed.",
        skipped.length ? `Skipped and left loose: ${skipped.join(", ")}.` : "",
      ].filter(Boolean).join(" "));
      setReload((n) => n + 1);
    } catch (e) {
      setStatus(asError(e).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <div className="hint">Reading the object store…</div>;
  if (error) return <Status text={error.message} ok={false} />;
  if (!data) return null;

  const total = data.loose_objects + data.packed_objects;
  const packedPct = total > 0 ? Math.round((data.packed_objects / total) * 100) : 100;
  const due = data.maintenance.compaction_due || data.maintenance.repack_due;

  return (
    <>
      {/* Compaction ratio bar */}
      <div style={{ marginBottom: 6, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{packedPct}% packed</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {data.packed_objects} packed · {data.loose_objects} loose · {total} objects
        </span>
        {due && <span className="pill" style={{ marginLeft: "auto", background: "var(--amber-bg)", color: "var(--amber)" }}>compaction due</span>}
      </div>
      <div style={{ height: 14, borderRadius: 7, overflow: "hidden", display: "flex", border: "1px solid var(--border)", background: "var(--panel-2)" }} title={`${data.packed_objects} packed, ${data.loose_objects} loose`}>
        <div style={{ width: `${packedPct}%`, background: "var(--green)", transition: "width 0.3s" }} />
        <div style={{ width: `${100 - packedPct}%`, background: "var(--amber)", transition: "width 0.3s" }} />
      </div>
      <div style={{ display: "flex", gap: 4, fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
        <span style={{ color: "var(--green)" }}>■ packed</span>
        <span style={{ color: "var(--amber)" }}>■ loose</span>
        <span style={{ marginLeft: "auto" }}>total {fmtBytes(data.total_bytes)}</span>
      </div>

      {/* Detail grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", margin: "16px 0", fontSize: 12.5 }}>
        <StoreStat label="Loose objects" value={`${data.loose_objects} · ${fmtBytes(data.loose_bytes)}`} />
        <StoreStat label="Packed objects" value={`${data.packed_objects} · ${fmtBytes(data.pack_bytes)}`} />
        <StoreStat label="Pack files" value={`${data.pack_files}`} />
        <StoreStat label="Delta-compressed" value={`${data.deltas}`} />
      </div>

      <PackProblems title="Quarantined packs" note="Their objects are not lost — heal can refetch them from a remote." problems={data.quarantined_packs} />
      <PackProblems title="Unenumerable pack indexes" note="The index itself will not parse — move the file aside and re-run." problems={data.unenumerable_indexes} />

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn primary" disabled={busy || data.loose_objects === 0} onClick={() => compact(false)}>
          {busy ? "Working…" : "Compact"}
        </button>
        <button className="btn" disabled={busy} onClick={() => compact(true)} title="Full repack: also drop unreachable objects and consolidate existing packs">
          Full repack
        </button>
        <button
          className={`btn ${data.densify_suggested ? "primary" : ""}`}
          disabled={busy}
          onClick={() => compact(true, true)}
          title="Full repack that also re-runs delta selection across the whole live store. One-shot and CPU-bound — not something to run routinely."
        >
          Re-delta
        </button>
        <button className="btn ghost sm" disabled={busy} onClick={() => setReload((n) => n + 1)}>Refresh</button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        Compact packs loose objects into dense pack files. {data.maintenance.auto ? "Auto-maintenance is on, so this usually happens on its own." : "Auto-maintenance is off."}
      </div>
      {data.densify_suggested && (
        <div className="hint" style={{ marginTop: 4, color: "var(--amber)" }}>
          This store was bulk-ingested (an import or a franchised bundle), so its packs were only ever
          deltaed one path at a time. A one-shot <strong>Re-delta</strong> can shrink it further.
        </div>
      )}
      <Status text={status} />
    </>
  );
}

/** Pack indexes the census could not use. Both lists are empty on a healthy store. */
function PackProblems({ title, note, problems }: { title: string; note: string; problems?: PackProblem[] }) {
  if (!problems || problems.length === 0) return null;
  return (
    <div style={{ margin: "0 0 12px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--red)" }}>{title} ({problems.length})</div>
      {problems.map((p) => (
        <div key={p.index_path} style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text-dim)" }}>
          {p.index_path} — {p.error}
        </div>
      ))}
      <div className="hint">{note}</div>
    </div>
  );
}

function StoreStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 3 }}>
      <span style={{ color: "var(--text-dim)" }}>{label}</span>
      <span style={{ fontFamily: "var(--mono)" }}>{value}</span>
    </div>
  );
}

// ---- Scope (sparse workspaces) ----------------------------------------------

/**
 * Two different scopes, deliberately kept apart in the UI because they are easy to confuse:
 * the *fetch* scope is warehouse-wide (what content was downloaded at all — widened by
 * `expand`, given up by the destructive `scope-prune`), while the *materialization* scope is
 * this checkout's alone (what shows up on disk — shrunk by `narrow`, set by `bay add --scope`).
 */
function ScopeTab({ wh }: { wh: string }) {
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useLoad<ScopeStatus>(() => fk.scope(wh), [wh, reload]);
  const [paths, setPaths] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const act = async (label: string, action: (list: string[]) => Promise<unknown>) => {
    const list = paths.split(/[\s,]+/).filter(Boolean);
    if (list.length === 0) return;
    setBusy(true);
    setStatus(`${label}…`);
    try {
      await action(list);
      setStatus(`${label} — done.`);
      setPaths("");
      setReload((n) => n + 1);
    } catch (e) {
      setStatus(asError(e).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <div className="hint">Reading the scope…</div>;
  if (error) return <Status text={error.message} ok={false} />;
  if (!data) return null;

  return (
    <>
      <ScopeList
        label="This checkout materializes"
        paths={data.materialization_scope}
        full="the full tree"
        note={data.bay ? `Bay "${data.bay}".` : "The main tree."}
      />
      <ScopeList
        label="This warehouse has fetched"
        paths={data.fetch_scope}
        full="everything"
        note="A sparse franchise records the subtrees whose content it downloaded; the rest stays sealed by hash."
      />

      <Field label="Subtree path(s)" hint="Space- or comma-separated.">
        <input className="text-input" value={paths} onChange={(e) => setPaths(e.target.value)} placeholder="src/api docs" />
      </Field>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn primary" disabled={busy || !paths.trim()} onClick={() => act("Expanded", (l) => fk.expand(wh, l))} title="Fetch a subtree's content from the remote across the whole history">
          Expand
        </button>
        <button className="btn" disabled={busy || !paths.trim()} onClick={() => act("Narrowed", (l) => fk.narrow(wh, l))} title="Stop materializing a subtree here. Frees nothing in the shared object store.">
          Narrow
        </button>
        <button className="btn" disabled={busy || !paths.trim()} onClick={() => act("Dry run", (l) => fk.scopePrune(wh, l, true))} title="Show what a prune would free, changing nothing">
          Prune (dry run)
        </button>
        <button className="btn danger" disabled={busy || !paths.trim()} onClick={() => act("Pruned", (l) => fk.scopePrune(wh, l))} title="Destructive: forget the path warehouse-wide and delete its objects. Re-fetchable from the origin with Expand.">
          Prune
        </button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        Expand widens what the <em>warehouse</em> fetched; Narrow shrinks what <em>this checkout</em> shows.
        Prune is the destructive one — it deletes the content, and refuses while any checkout still materializes the path.
      </div>
      <Status text={status} />
    </>
  );
}

function ScopeList({ label, paths, full, note }: { label: string; paths: string[]; full: string; note: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>
        {paths.length === 0 ? full : paths.join("  ·  ")}
      </div>
      <div className="hint">{note}</div>
    </div>
  );
}

// ---- Updates ----------------------------------------------------------------

function VersionCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", minWidth: 130 }}>
      <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function UpdatesTab({ binVersion, onDetected }: { binVersion?: string; onDetected: (info: BinaryInfo) => void }) {
  const [guiVersion, setGuiVersion] = useState("");
  const [result, setResult] = useState<SelfUpdate | null>(null);
  const [detected, setDetected] = useState<string | undefined>();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getVersion().then(setGuiVersion).catch(() => setGuiVersion(""));
  }, []);

  const go = async (check: boolean) => {
    setBusy(true);
    setStatus(check ? "Checking…" : "Updating…");
    try {
      const out = await fk.selfUpdate(check);
      setResult(out);
      setStatus(null);
      // After applying, re-detect: the resolver re-probes and picks the newest binary, so
      // the GUI repoints at the freshly installed forklift without a restart.
      if (!check && out.applied) {
        try {
          const info = await detectBinary();
          setDetected(info.version);
          onDetected(info);
        } catch { /* keep the reported result */ }
      }
    } catch (e) {
      setStatus(asError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const currentCli = detected ?? binVersion ?? result?.current ?? "…";

  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <VersionCard label="forklift (CLI)" value={currentCli} />
        <VersionCard label="Forklift GUI" value={guiVersion || "…"} />
      </div>

      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>Check for, or install, a newer forklift binary (self-update).</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" disabled={busy} onClick={() => go(true)}>Check for updates</button>
        <button className="btn primary" disabled={busy} onClick={() => go(false)}>Update now</button>
      </div>

      {result && (
        result.update_available ? (
          <div className="error-banner" style={{ marginTop: 14, background: "var(--amber-bg)", borderColor: "var(--amber)", color: "var(--text)" }}>
            <div>
              {result.applied ? "Updated to " : "Update available: "}
              <strong style={{ fontFamily: "var(--mono)" }}>{result.latest}</strong>
              {" "}(you have <span style={{ fontFamily: "var(--mono)" }}>{result.current}</span>).
              {result.applied && " Restart the CLI to use it."}
            </div>
            {!result.applied && result.update_command && (
              <>
                <div className="next" style={{ marginTop: 6 }}>Update in place with “Update now”, or run:</div>
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "var(--mono)", fontSize: 11, margin: "4px 0 0" }}>{result.update_command}</pre>
              </>
            )}
          </div>
        ) : (
          <div className="hint" style={{ color: "var(--green)", marginTop: 12 }}>✓ Up to date (forklift {result.current} is the latest).</div>
        )
      )}
      <Status text={status} />
    </>
  );
}
