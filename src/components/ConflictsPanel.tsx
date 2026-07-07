// Conflicts = the files left in contention by an unresolved consolidation or cherry-pick.
// Each conflict names its three sides (base / ours / theirs) as content-addressed blobs;
// we peek those blobs on demand. Master-detail: the file list on the left, the selected
// file's three sides stacked on the right — mirroring HaulsPanel's layout.

import { useState } from "react";
import { fk, Conflicts, ConflictFile } from "../api";
import { useApp, useLoad, Loading, Empty, ErrorBanner, shortHash } from "../common";
import { PaneDivider } from "./PaneDivider";

export function ConflictsPanel() {
  const { wh, rev } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const list = useLoad<Conflicts>(() => fk.conflicts(wh), [wh, rev]);

  const conflicts = list.data?.conflicts ?? [];

  if (list.loading && !list.data) return <Loading label="Reading conflicts…" />;
  if (list.error) return <div style={{ padding: 12 }}><ErrorBanner error={list.error} /></div>;
  if (conflicts.length === 0) {
    return (
      <Empty
        icon="🕊️"
        title="No conflicts"
        hint="An unresolved consolidation or cherry-pick would list its files here — each with its three sides as content-addressed blobs."
      />
    );
  }

  const current = conflicts.find((c) => c.path === selected) ?? null;

  return (
    <div className="changes-layout">
      <div className="changes-list">
        <div className="changes-scroll">
          {conflicts.map((conflict) => (
            <button
              key={conflict.path}
              className={`change-row ${selected === conflict.path ? "selected" : ""}`}
              style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderLeft: "2px solid transparent" }}
              onClick={() => setSelected(conflict.path)}
            >
              <span style={{ fontSize: 15 }}>🕊️</span>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontWeight: 600, fontFamily: "var(--mono)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {conflict.path}
                </div>
                <div className="sub" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, marginTop: 2 }}>
                  <span className="pill">{conflict.markers ? "markers" : "whole-file"}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <PaneDivider storageKey="forklift.mdListWidth" min={240} max={720} />
      <div className="diff-pane">
        {current ? (
          <ConflictDetail conflict={current} />
        ) : (
          <Empty icon="🕊️" title="Select a conflicting file" hint="Its base, ours, and theirs sides show on the right." />
        )}
      </div>
    </div>
  );
}

function ConflictDetail({ conflict }: { conflict: ConflictFile }) {
  const hasSides = conflict.markers && !!conflict.base && !!conflict.ours && !!conflict.theirs;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="panel-head" style={{ borderTop: "none" }}>
        <h2 style={{ fontFamily: "var(--mono)" }}>{conflict.path}</h2>
        <span className="spacer" />
        <span className="pill">{conflict.markers ? "markers" : "whole-file"}</span>
      </div>

      <div className="panel-body" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {hasSides ? (
          <>
            <Side hash={conflict.base!} label="base" />
            <Side hash={conflict.ours!} label="ours" />
            <Side hash={conflict.theirs!} label="theirs" />
          </>
        ) : (
          <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
            Whole-file or binary conflict — no line-level sides.
          </div>
        )}
      </div>
    </div>
  );
}

function Side({ hash, label }: { hash: string; label: string }) {
  const { wh, rev } = useApp();
  const { data, error, loading } = useLoad<string>(() => fk.peek(wh, hash), [wh, rev, hash]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        <strong>{label}</strong>
        <span className="parcel-hash">{shortHash(hash)}</span>
      </div>
      {loading && !data ? (
        <Loading label={`Reading ${label}…`} />
      ) : error ? (
        <ErrorBanner error={error} />
      ) : (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            whiteSpace: "pre",
            overflow: "auto",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 10,
            userSelect: "text",
          }}
        >
          {data ?? ""}
        </div>
      )}
    </div>
  );
}
