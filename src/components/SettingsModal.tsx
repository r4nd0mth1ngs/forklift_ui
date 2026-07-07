// Settings & tools — a tabbed dialog. Some tabs need an open warehouse (config, profiles,
// git interop, object inspect); binary + updates work anywhere. Rendered outside the app
// context, so each tab manages its own load/reload and status locally.

import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  BinaryInfo, ConfigList, detectBinary, fk, getBinOverride, ProfileList, SelfUpdate, setBinOverride,
} from "../api";
import { asError, useLoad } from "../common";
import { Modal, Field } from "./Modal";
import { TERMS, TermKey, useTerms, VOCABULARIES } from "../terms";

type Tab = "terms" | "binary" | "config" | "profiles" | "git" | "inspect" | "updates";

export function SettingsModal(props: { wh?: string; binVersion?: string; onClose: () => void; onDetected: (info: BinaryInfo) => void }) {
  const [tab, setTab] = useState<Tab>("terms");
  const wh = props.wh;

  const allTabs: { key: Tab; label: string; needsWh?: boolean }[] = [
    { key: "terms", label: "Terminology" },
    { key: "binary", label: "Binary" },
    { key: "config", label: "Config", needsWh: true },
    { key: "profiles", label: "Profiles", needsWh: true },
    { key: "git", label: "Git", needsWh: true },
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

  return (
    <>
      <Field label="Path to the forklift binary" hint="Resolution: this override → FORKLIFT_BIN → forklift on PATH → a sibling ../forklift/target/release build.">
        <input value={path} placeholder="leave blank to auto-detect" onChange={(e) => setPath(e.target.value)} className="text-input" />
      </Field>
      <Status text={status} ok={ok} />
      <div className="actions"><button className="btn primary" onClick={test}>Test &amp; save</button></div>
    </>
  );
}

// ---- Config -----------------------------------------------------------------

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
        <Field label="Key"><input className="text-input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="operator.name" /></Field>
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

// ---- Inspect (peek) ---------------------------------------------------------

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
      {data && (
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--mono)", fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, userSelect: "text", maxHeight: 300, overflow: "auto" }}>
          {data}
        </pre>
      )}
    </>
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
