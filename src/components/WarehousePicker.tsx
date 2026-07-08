// The launch screen: open an existing warehouse (native folder dialog), pick from recent
// ones, or prepare a new warehouse in a chosen folder.

import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { BinaryInfo, fk, installForklift } from "../api";
import { asError } from "../common";
import { useT } from "../terms";
import { SplashAnimation } from "./SplashAnimation";

export function WarehousePicker(props: {
  bin: BinaryInfo | null;
  binError: string | null;
  recent: string[];
  onOpen: (path: string) => void;
  onOpenSettings: () => void;
  onBinaryChanged: () => void;
}) {
  const [pendingPrepare, setPendingPrepare] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [installing, setInstalling] = useState(false);

  const install = async () => {
    setInstalling(true);
    setMessage("Installing forklift from its repo…");
    try {
      const output = await installForklift();
      // Show the last useful line(s) the installer printed (path / version).
      const tail = output.split("\n").map((l) => l.trim()).filter(Boolean).slice(-2).join(" · ");
      setMessage(tail || "forklift installed.");
      props.onBinaryChanged();
    } catch (error) {
      setMessage(asError(error).message);
    } finally {
      setInstalling(false);
    }
  };
  const t = useT();

  const choose = async () => {
    setMessage(null);
    const picked = await open({ directory: true, title: "Open a forklift warehouse" });
    if (typeof picked !== "string") return;
    await tryOpen(picked);
  };

  // Create a warehouse in a chosen folder. `prepare` is idempotent, so an already-prepared
  // folder just opens. Use the dialog's "New Folder" button to make a fresh directory.
  const createNew = async () => {
    setMessage(null);
    const picked = await open({ directory: true, title: "Choose a folder for the new warehouse" });
    if (typeof picked !== "string") return;
    setBusy(true);
    try {
      const data = await invoke<{ created?: string[] }>("run_json", { warehouse: picked, args: ["prepare"] });
      setMessage((data?.created?.length ?? 0) === 0 ? "Folder was already a warehouse — opening it." : null);
      props.onOpen(picked);
    } catch (error) {
      setMessage(asError(error).message);
    } finally {
      setBusy(false);
    }
  };

  // Import a git repository: colocated by design. `import-git` builds the inventory from the
  // tree without materializing files, so it must run inside the repo whose working tree is
  // git's. We prepare a warehouse in the chosen git repo folder, then `import-git .` there.
  const importGit = async () => {
    setMessage(null);
    const dir = await open({ directory: true, title: "Choose a git repository to import" });
    if (typeof dir !== "string") return;
    setBusy(true);
    setMessage("Importing git history…");
    try {
      await invoke("run_json", { warehouse: dir, args: ["prepare"] });
      await invoke("run_json", { warehouse: dir, args: ["import-git", "."] });
      props.onOpen(dir);
    } catch (error) {
      setMessage(asError(error).message);
    } finally {
      setBusy(false);
    }
  };

  const tryOpen = async (path: string) => {
    setBusy(true);
    try {
      await fk.stocktake(path); // succeeds only inside a warehouse
      props.onOpen(path);
    } catch (error) {
      const fe = asError(error);
      if (fe.code === "not_a_warehouse") {
        setPendingPrepare(path);
      } else {
        setMessage(fe.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const prepare = async () => {
    if (!pendingPrepare) return;
    setBusy(true);
    try {
      await invoke("run_json", { warehouse: pendingPrepare, args: ["prepare"] });
      props.onOpen(pendingPrepare);
    } catch (error) {
      setMessage(asError(error).message);
    } finally {
      setBusy(false);
      setPendingPrepare(null);
    }
  };

  if (cloning) {
    return <FranchiseForm onCancel={() => setCloning(false)} onCloned={props.onOpen} />;
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <SplashAnimation />
        <h1>Forklift</h1>
        <div className="tag">Move and organize your packages.</div>

        {props.binError ? (
          <div className="error-banner" style={{ margin: "0 0 16px" }}>
            <div className="code">forklift not found</div>
            <div>{props.binError}</div>
            <div className="next" style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn primary sm" onClick={install} disabled={installing}>
                {installing ? "Installing…" : "Install forklift"}
              </button>
              <button className="btn sm" onClick={props.onOpenSettings} disabled={installing}>
                Set binary path…
              </button>
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              Runs the forklift repo's installer (a prebuilt binary → <code>~/.local/bin</code>). Needs <code>curl</code>.
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-faint)", marginBottom: 16 }}>
            forklift {props.bin?.version} · <button className="btn ghost sm" onClick={props.onOpenSettings}>settings</button>
          </div>
        )}

        {pendingPrepare ? (
          <div>
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              <strong>{basename(pendingPrepare)}</strong> is not a warehouse yet.
              <div className="rpath" style={{ marginTop: 4 }}>{pendingPrepare}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary" onClick={prepare} disabled={busy}>
                Prepare warehouse here
              </button>
              <button className="btn ghost" onClick={() => setPendingPrepare(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary" style={{ flex: 1, justifyContent: "center" }} disabled={busy || !!props.binError} onClick={createNew} title="Create and initialize a new warehouse in a folder">
                New {t("warehouse").toLowerCase()}…
              </button>
              <button className="btn" style={{ flex: 1, justifyContent: "center" }} disabled={busy || !!props.binError} onClick={choose}>
                Open…
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn" style={{ flex: 1, justifyContent: "center" }} disabled={busy || !!props.binError} onClick={() => setCloning(true)} title="Franchise (clone) a remote warehouse">
                {t("franchise")}…
              </button>
              <button className="btn" style={{ flex: 1, justifyContent: "center" }} disabled={busy || !!props.binError} onClick={importGit} title="Import a git repository into a colocated warehouse">
                Import from git…
              </button>
            </div>
            <div className="hint" style={{ textAlign: "center", marginTop: 8 }}>
              New warehouse inits a folder (use the picker's “New Folder” button). Import from git colocates a warehouse in the repo, keeping <code>.git</code>.
            </div>
          </>
        )}

        {message && <div className="hint" style={{ color: "var(--red)" }}>{message}</div>}

        {props.recent.length > 0 && !pendingPrepare && (
          <div style={{ marginTop: 20 }}>
            <div className="section-label" style={{ padding: "0 0 4px" }}>Recent</div>
            {props.recent.map((path) => (
              <button key={path} className="recent-item" onClick={() => tryOpen(path)} disabled={busy}>
                <span>📦</span>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontWeight: 600 }}>{basename(path)}</div>
                  <div className="rpath">{path}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function basename(path: string): string {
  const parts = path.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function FranchiseForm({ onCancel, onCloned }: { onCancel: () => void; onCloned: (path: string) => void }) {
  const [url, setUrl] = useState("");
  const [directory, setDirectory] = useState("");
  const [pallet, setPallet] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const t = useT();

  const pickDir = async () => {
    const picked = await open({ directory: true, title: "Choose an empty directory for the clone" });
    if (typeof picked === "string") setDirectory(picked);
  };

  const clone = async () => {
    if (!url.trim() || !directory.trim()) return;
    setBusy(true);
    setMessage("Franchising…");
    try {
      await fk.franchise(directory.trim(), url.trim(), { pallet: pallet.trim() || undefined, token: token.trim() || undefined });
      onCloned(directory.trim());
    } catch (error) {
      setMessage(asError(error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="logo">🚚</div>
        <h1>{t("franchise")} a {t("warehouse").toLowerCase()}</h1>
        <div className="tag">Franchise a remote {t("warehouse").toLowerCase()} into a local copy.</div>
        <div className="field">
          <label>Remote URL</label>
          <input className="text-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://forklift.example.com:9418" />
        </div>
        <div className="field">
          <label>Destination directory (new or empty)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="text-input" value={directory} onChange={(e) => setDirectory(e.target.value)} placeholder="/path/to/clone" />
            <button className="btn" onClick={pickDir}>Browse…</button>
          </div>
        </div>
        <div className="field">
          <label>Pallet (optional, default: the remote's default)</label>
          <input className="text-input" value={pallet} onChange={(e) => setPallet(e.target.value)} />
        </div>
        <div className="field">
          <label>Bearer token (optional)</label>
          <input className="text-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
        </div>
        {message && <div className="hint" style={{ color: busy ? "var(--text-dim)" : "var(--red)" }}>{message}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn primary" disabled={busy || !url.trim() || !directory.trim()} onClick={clone}>Clone</button>
          <button className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
