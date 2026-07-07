// Bays: forklift's worktrees. Each bay is an extra working directory that shares the
// warehouse's object store and refs, checked out to its own pallet — work on another
// pallet in parallel without a full clone.

import { useState } from "react";
import { fk, Bays } from "../api";
import { useApp, useLoad, Loading, Empty, ErrorBanner } from "../common";
import { Modal, Field } from "./Modal";
import { useT } from "../terms";

export function BaysPanel() {
  const t = useT();
  const { wh, rev, run } = useApp();
  const { data, error, loading } = useLoad<Bays>(() => fk.bays(wh), [wh, rev]);
  const [adding, setAdding] = useState(false);

  const bays = data?.bays ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="panel-head">
        <span style={{ fontWeight: 700 }}>{t("bays")}</span>
        <span className="spacer" />
        <button className="btn primary sm" onClick={() => setAdding(true)}>Add {t("bay").toLowerCase()}</button>
      </div>

      <div className="panel-body">
        {loading && !data && <Loading label="Reading bays…" />}
        {error && <div style={{ padding: 12 }}><ErrorBanner error={error} /></div>}
        {!loading && !error && bays.length === 0 && (
          <Empty
            icon="🏭"
            title={`No ${t("bays").toLowerCase()}`}
            hint="A bay is an extra working directory sharing this warehouse's objects and refs — work on another pallet in parallel without a full clone."
          />
        )}
        {bays.length > 0 && (
          <div className="list-panel">
            {bays.map((bay) => (
              <div key={bay.name} className="list-row">
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div className="lead">{bay.name}</div>
                  {(bay.path || bay.pallet) && (
                    <div className="sub" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
                      {bay.path && <span className="parcel-hash">{bay.path}</span>}
                      {bay.pallet && <span>on {bay.pallet}</span>}
                    </div>
                  )}
                </div>
                <button className="btn ghost sm danger" onClick={() => run(fk.bayRemove(wh, bay.name), "Bay removed")}>Remove</button>
              </div>
            ))}
          </div>
        )}
        {bays.length > 0 && (
          <div className="hint" style={{ padding: "10px 16px" }}>
            Removing de-registers the bay but keeps its pallet ref and files.
          </div>
        )}
      </div>

      {adding && <AddBayForm onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddBayForm({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { wh, run } = useApp();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const ok = await run(fk.bayAdd(wh, name.trim(), path.trim() || undefined), "Bay opened");
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal title={`Open a new ${t("bay").toLowerCase()}`} onClose={onClose}>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
        A bay is a new working directory on a new pallet — sharing this warehouse's objects and refs so you can work on another pallet in parallel without a full clone.
      </p>
      <Field label="Name">
        <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="feature/x" />
      </Field>
      <Field label="Path (optional, default: a sibling of the warehouse)">
        <input className="text-input" value={path} onChange={(e) => setPath(e.target.value)} />
      </Field>
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !name.trim()} onClick={add}>Add {t("bay").toLowerCase()}</button>
      </div>
    </Modal>
  );
}
