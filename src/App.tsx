import { useCallback, useEffect, useState } from "react";
import { BinaryInfo, detectBinary, fk, hasSigningPassphrase, setSigningPassphrase } from "./api";
import { AppProvider, Toast, useApp } from "./common";
import { WarehousePicker } from "./components/WarehousePicker";
import { SettingsModal } from "./components/SettingsModal";
import { Modal, Field } from "./components/Modal";
import { PalletBar } from "./components/PalletBar";
import { ChangesPanel } from "./components/ChangesPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { OfficePanel } from "./components/OfficePanel";
import { TagsPanel } from "./components/TagsPanel";
import { HaulsPanel } from "./components/HaulsPanel";
import { BlamePanel } from "./components/BlamePanel";
import { ConflictsPanel } from "./components/ConflictsPanel";
import { BaysPanel } from "./components/BaysPanel";
import { ManifestPanel } from "./components/ManifestPanel";
import { useT, TermKey } from "./terms";
import { PaneDivider } from "./components/PaneDivider";
import forkliftIcon from "./assets/forklift-icon.png";

type View = "changes" | "history" | "blame" | "conflicts" | "hauls" | "manifest" | "office" | "tags" | "bays";
const RECENT_KEY = "forklift.recent";

export default function App() {
  const [bin, setBin] = useState<BinaryInfo | null>(null);
  const [binError, setBinError] = useState<string | null>(null);
  const [wh, setWh] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(() => JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const refreshBinary = useCallback(() => {
    detectBinary()
      .then((info) => { setBin(info); setBinError(null); })
      .catch((e) => setBinError(e?.message ?? String(e)));
  }, []);

  useEffect(() => { refreshBinary(); }, [refreshBinary]);

  const notify = useCallback((kind: Toast["kind"], title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, kind, title, body }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);

  const openWarehouse = useCallback((path: string) => {
    setWh(path);
    setRecent((list) => {
      const next = [path, ...list.filter((p) => p !== path)].slice(0, 6);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <>
      {wh ? (
        <AppProvider wh={wh} notify={notify}>
          <Workbench wh={wh} bin={bin} onClose={() => setWh(null)} onOpenSettings={() => setSettingsOpen(true)} />
        </AppProvider>
      ) : (
        <WarehousePicker
          bin={bin}
          binError={binError}
          recent={recent}
          onOpen={openWarehouse}
          onOpenSettings={() => setSettingsOpen(true)}
          onBinaryChanged={refreshBinary}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          wh={wh ?? undefined}
          binVersion={bin?.version}
          onClose={() => setSettingsOpen(false)}
          onDetected={(info) => {
            setBin(info);
            setBinError(null);
          }}
        />
      )}

      <Toasts toasts={toasts} />
    </>
  );
}

function Workbench(props: { wh: string; bin: BinaryInfo | null; onClose: () => void; onOpenSettings: () => void }) {
  const [view, setView] = useState<View>("changes");
  return (
    <div className="app">
      <TopBar wh={props.wh} onClose={props.onClose} onOpenSettings={props.onOpenSettings} />
      <div className="body">
        <Sidebar view={view} setView={setView} />
        <PaneDivider storageKey="forklift.sidebarWidth" min={168} max={380} />
        <div className="main">
          <ViewHost view={view} />
        </div>
      </div>
    </div>
  );
}

function TopBar(props: { wh: string; onClose: () => void; onOpenSettings: () => void }) {
  const { bump, wh, run } = useApp();
  const t = useT();
  const name = props.wh.replace(/[/\\]+$/, "").split(/[/\\]/).pop();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [locked, setLocked] = useState(hasSigningPassphrase());
  return (
    <div className="topbar">
      <div className="brand">
        <img src={forkliftIcon} className="brand-icon" alt="" />
        Forklift
      </div>
      <button className="wh-path" title={props.wh} onClick={props.onClose}>
        {name} ⌄
      </button>
      <div className="spacer" />
      <button
        className="btn ghost"
        title={locked ? "Signing passphrase set (click to change/clear)" : "Set a signing passphrase to unlock protected keys"}
        onClick={() => setUnlockOpen(true)}
      >
        {locked ? "🔓 Unlocked" : "🔒 Locked"}
      </button>
      <button className="btn ghost" title="Set aside working changes" onClick={() => run(fk.park(wh), "Parked changes")}>⇩ {t("park")}</button>
      <button className="btn ghost" title="Undo the last operation" onClick={() => run(fk.undo(wh), "Undone")}>↶ {t("undo")}</button>
      <button className="btn ghost" title="Download from the remote" onClick={() => run(fk.lower(wh), "Lowered from remote")}>⬇ {t("lower")}</button>
      <button className="btn ghost" title="Upload to the remote" onClick={() => run(fk.lift(wh), "Lifted to remote")}>⬆ {t("lift")}</button>
      <button className="btn ghost" title="Refresh" onClick={bump}>↻</button>
      <button className="btn ghost" title="Settings" onClick={props.onOpenSettings}>⚙</button>
      {unlockOpen && <UnlockModal onClose={() => { setLocked(hasSigningPassphrase()); setUnlockOpen(false); }} />}
    </div>
  );
}

function UnlockModal({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState("");
  return (
    <Modal title="Signing passphrase" onClose={onClose}>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
        Held in memory for this session only (never written to disk). Passed to forklift as
        <code> FORKLIFT_KEY_PASSPHRASE</code> to unlock a passphrase-protected signing key.
      </p>
      <Field label="Passphrase">
        <input type="password" className="text-input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="••••••••" />
      </Field>
      <div className="actions">
        <button className="btn ghost" onClick={() => { setSigningPassphrase(undefined); onClose(); }}>Clear</button>
        <button className="btn primary" onClick={() => { setSigningPassphrase(value); onClose(); }}>Set</button>
      </div>
    </Modal>
  );
}

function Sidebar(props: { view: View; setView: (v: View) => void }) {
  const t = useT();
  const sections: { label: string; items: { key: View; icon: string; term: TermKey }[] }[] = [
    { label: "Workspace", items: [
      { key: "changes", icon: "◧", term: "changes" },
      { key: "history", icon: "◷", term: "history" },
      { key: "blame", icon: "◈", term: "blame" },
      { key: "conflicts", icon: "⚡", term: "conflicts" },
    ] },
    { label: "Collaboration", items: [
      { key: "hauls", icon: "🚚", term: "hauls" },
      { key: "manifest", icon: "📝", term: "manifest" },
    ] },
    { label: "Trust", items: [
      { key: "office", icon: "🔑", term: "office" },
      { key: "tags", icon: "🏷", term: "tags" },
    ] },
    { label: "Worktrees", items: [
      { key: "bays", icon: "🏭", term: "bays" },
    ] },
  ];
  return (
    <div className="sidebar">
      {sections.map((section) => (
        <div key={section.label}>
          <div className="section-label">{section.label}</div>
          {section.items.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${props.view === item.key ? "active" : ""}`}
              onClick={() => props.setView(item.key)}
            >
              <span className="ico">{item.icon}</span>
              {t(item.term)}
            </button>
          ))}
        </div>
      ))}
      <PalletBar />
    </div>
  );
}

function ViewHost({ view }: { view: View }) {
  const t = useT();
  switch (view) {
    case "changes":
      return <PanelShell title={t("changes")}><ChangesPanel /></PanelShell>;
    case "history":
      return <PanelShell title={t("history")}><HistoryPanel /></PanelShell>;
    case "blame":
      return <PanelShell title={`${t("blame")} · signed line attribution`}><BlamePanel /></PanelShell>;
    case "conflicts":
      return <PanelShell title={t("conflicts")}><ConflictsPanel /></PanelShell>;
    case "hauls":
      return <PanelShell title={`${t("hauls")} · merge proposals`}><HaulsPanel /></PanelShell>;
    case "manifest":
      return <PanelShell title={`${t("manifest")} · notes, approvals, provenance`}><ManifestPanel /></PanelShell>;
    case "office":
      return <PanelShell title={`${t("office")} · trust & identity`}><OfficePanel /></PanelShell>;
    case "tags":
      return <PanelShell title={t("tags")}><TagsPanel /></PanelShell>;
    case "bays":
      return <PanelShell title={`${t("bays")} · worktrees`}><BaysPanel /></PanelShell>;
  }
}

function PanelShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === "error" ? "error" : ""}`}>
          <div className="t-title">{t.title}</div>
          {t.body && <div className="t-body">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}
