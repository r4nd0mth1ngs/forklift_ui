// Parcel history (git log), newest first, with a simple graph rail. Surfaces forklift's
// signed identity: history doesn't inline the identity class, so — like forklift's own
// blame — we join each parcel's operator id against the office registry to show whether
// the author is a human / agent / bot / service and their role. Selecting a parcel shows
// its diff against its first parent (the previous entry in this first-parent log).

import { useState } from "react";
import { fk, History, HistoryEntry, OfficeState, ParcelAction } from "../api";
import { useApp, useLoad, Loading, Empty, ErrorBanner, IdentityBadge, shortHash, relTime, buildIdentityMap, IdentityMap } from "../common";
import { useT } from "../terms";
import { DiffView } from "./DiffView";
import { PaneDivider } from "./PaneDivider";

export function HistoryPanel({ revision }: { revision?: string }) {
  const { wh, rev, run } = useApp();
  const history = useLoad<History>(() => fk.history(wh, revision), [wh, rev, revision]);
  const office = useLoad<OfficeState>(() => fk.office(wh), [wh, rev]);
  const identities = buildIdentityMap(office.data);
  const [selected, setSelected] = useState<number | null>(null);

  if (history.loading && !history.data) return <Loading label="Walking history…" />;
  if (history.error) return <div style={{ padding: 12 }}><ErrorBanner error={history.error} /></div>;
  const entries = history.data?.entries ?? [];
  if (entries.length === 0) {
    return <Empty icon="◷" title="No parcels yet" hint="Stack your first parcel from the Changes tab." />;
  }

  const sel = selected != null ? entries[selected] : null;
  // First-parent of the selected parcel = the next entry in this first-parent-ordered log.
  const parent = selected != null ? entries[selected + 1]?.parcel : undefined;

  return (
    <div className="changes-layout">
      <div className="changes-list">
        <div className="changes-scroll">
          <div className="history-list">
            {entries.map((entry, i) => (
              <ParcelRow
                key={entry.parcel}
                entry={entry}
                identities={identities}
                last={i === entries.length - 1}
                selected={selected === i}
                onSelect={() => setSelected(i)}
                onCherryPick={() => run(fk.cherryPick(wh, entry.parcel), `Cherry-picked ${shortHash(entry.parcel)}`)}
              />
            ))}
          </div>
        </div>
      </div>

      <PaneDivider storageKey="forklift.mdListWidth" min={240} max={720} />
      <div className="diff-pane">
        {sel ? (
          <>
            <div className="panel-head">
              <span className="diff-file-name">{sel.description || "(no description)"}</span>
              <span className="parcel-hash">{shortHash(sel.parcel)}</span>
            </div>
            {parent ? (
              <DiffView revs={[parent, sel.parcel]} />
            ) : (
              <Empty icon="✦" title="Root parcel" hint="This is the first parcel — it has no parent to diff against." />
            )}
          </>
        ) : (
          <Empty icon="◷" title="Select a parcel" hint="See what it changed relative to its parent." />
        )}
      </div>
    </div>
  );
}

function actorOf(action?: ParcelAction): string {
  if (!action) return "unknown";
  return action.display_name || action.operator?.slice(0, 8) || "unknown";
}

function ParcelRow({
  entry,
  identities,
  last,
  selected,
  onSelect,
  onCherryPick,
}: {
  entry: HistoryEntry;
  identities: IdentityMap;
  last: boolean;
  selected: boolean;
  onSelect: () => void;
  onCherryPick: () => void;
}) {
  const t = useT();
  const stack = entry.actions.find((a) => a.action.trim() === "stack");
  const author = entry.actions.find((a) => a.action.trim() === "author");
  const stackedBy = actorOf(stack);
  const authoredBy = actorOf(author);
  const identity = author?.operator ? identities[author.operator] : undefined;
  const when = stack?.timestamp ?? author?.timestamp;

  return (
    <div className={`parcel-row ${selected ? "selected" : ""}`} onClick={onSelect} style={{ cursor: "pointer" }}>
      <div className="parcel-graph">
        <div className="dot" />
        {!last && <div className="line" />}
      </div>
      <div className="parcel-main">
        <div className="parcel-desc">{entry.description || <em style={{ color: "var(--text-faint)" }}>(no description)</em>}</div>
        <div className="parcel-meta">
          <span>{stackedBy}</span>
          <IdentityBadge cls={identity?.class} />
          {identity?.role === "admin" && <span className="pill">admin</span>}
          {authoredBy !== stackedBy && <span title="original author">✎ {authoredBy}</span>}
          {when && <span>· {relTime(when)}</span>}
          <span className="parcel-hash">{shortHash(entry.parcel)}</span>
        </div>
      </div>
      <span className="parcel-row-actions" onClick={(e) => e.stopPropagation()}>
        <button className="btn ghost sm" title="Apply this onto the current pallet as a new parcel" onClick={onCherryPick}>
          {t("cherryPick")}
        </button>
      </span>
    </div>
  );
}
