// The core commit workflow: staged / unstaged lists (load / unload / restore), an inline
// diff of the selected file, and the commit (stack) box.

import { useEffect, useState } from "react";
import { Change, fk, ParkList, Stocktake } from "../api";
import { useApp, useLoad, Loading, Empty, ErrorBanner } from "../common";
import { useT } from "../terms";
import { DiffView } from "./DiffView";
import { PaneDivider } from "./PaneDivider";

interface Selected {
  path: string;
  staged: boolean;
}

export function ChangesPanel() {
  const { wh, rev, run } = useApp();
  const t = useT();
  const { data, error, loading } = useLoad<Stocktake>(() => fk.stocktake(wh), [wh, rev]);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const staged = data?.staged ?? [];
  const unstaged = data?.unstaged ?? [];

  // Drop the selection if the file it pointed at is gone after a refresh.
  useEffect(() => {
    if (!selected) return;
    const list = selected.staged ? staged : unstaged;
    if (!list.some((c) => c.path === selected.path)) setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);

  if (loading && !data) return <Loading label="Reading the warehouse…" />;
  if (error) return <div style={{ padding: 12 }}><ErrorBanner error={error} /></div>;

  const stageAll = () => run(Promise.all(unstaged.map((c) => stageOne(c))), "Loaded all changes");
  const stageOne = (c: Change) => (c.kind === "deleted" ? fk.unload(wh, c.path) : fk.load(wh, c.path));

  const commit = async () => {
    if (!message.trim()) return;
    setBusy(true);
    const ok = await run(fk.stack(wh, message.trim()), "Parcel stacked");
    setBusy(false);
    if (ok) setMessage("");
  };

  return (
    <div className="changes-layout">
      <div className="changes-list">
        <div className="changes-scroll">
          <Group
            title="Staged"
            count={staged.length}
            action={
              staged.length > 0 && (
                <button className="btn ghost sm" onClick={() => run(Promise.all(staged.map((c) => fk.restore(wh, c.path, true))), "Unstaged all")}>
                  Unstage all
                </button>
              )
            }
          >
            {staged.map((c) => (
              <ChangeRow
                key={c.path}
                change={c}
                selected={selected?.staged === true && selected.path === c.path}
                onSelect={() => setSelected({ path: c.path, staged: true })}
                actions={[{ label: "Unstage", onClick: () => run(fk.restore(wh, c.path, true)) }]}
              />
            ))}
            {staged.length === 0 && <Hint text="Nothing staged yet." />}
          </Group>

          <Group
            title="Changes"
            count={unstaged.length}
            action={
              unstaged.length > 0 && (
                <button className="btn ghost sm" onClick={stageAll}>
                  Stage all
                </button>
              )
            }
          >
            {unstaged.map((c) => (
              <ChangeRow
                key={c.path}
                change={c}
                selected={selected?.staged === false && selected.path === c.path}
                onSelect={() => setSelected({ path: c.path, staged: false })}
                actions={[
                  { label: "Stage", onClick: () => run(stageOne(c), undefined) },
                  ...(c.kind === "untracked"
                    ? []
                    : [{ label: "Discard", danger: true, onClick: () => run(fk.restore(wh, c.path), "Discarded changes") }]),
                ]}
              />
            ))}
            {unstaged.length === 0 && <Hint text="No unstaged changes." />}
          </Group>

          <ParkedSection />
        </div>

        <div className="commit-box">
          <textarea
            placeholder={`Describe this ${t("parcel").toLowerCase()}…  (on ${data?.pallet ?? "—"})`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit();
            }}
          />
          <div className="row">
            <button className="btn primary" disabled={busy || !message.trim() || staged.length === 0} onClick={commit}>
              {t("stack")} {staged.length > 0 ? `(${staged.length})` : ""}
            </button>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>⌘↵</span>
          </div>
        </div>
      </div>

      <PaneDivider storageKey="forklift.mdListWidth" min={240} max={720} />
      <div className="diff-pane">
        {selected ? (
          <>
            <div className="panel-head">
              <span className="diff-file-name">{selected.path}</span>
              <span className="pill">{selected.staged ? "staged" : "working"}</span>
            </div>
            <DiffView path={selected.path} staged={selected.staged} />
          </>
        ) : (
          <Empty icon="⇲" title="Select a file to see its diff" hint="Staged files diff against the pallet head; working files against the inventory." />
        )}
      </div>
    </div>
  );
}

function Group(props: { title: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="group-head">
        <span>{props.title}</span>
        <span className="pill">{props.count}</span>
        <span className="spacer" />
        {props.action}
      </div>
      {props.children}
    </div>
  );
}

function ChangeRow(props: {
  change: Change;
  selected: boolean;
  onSelect: () => void;
  actions: { label: string; danger?: boolean; onClick: () => void }[];
}) {
  const symbol = props.change.kind === "deleted" ? "−" : props.change.kind === "untracked" ? "+" : "●";
  return (
    <div className={`change-row ${props.selected ? "selected" : ""}`} onClick={props.onSelect}>
      <span className={`kind ${props.change.kind}`} title={props.change.kind}>
        {symbol}
      </span>
      <span className="path">{props.change.path}</span>
      <span className="actions" onClick={(e) => e.stopPropagation()}>
        {props.actions.map((a) => (
          <button key={a.label} className={`btn sm ghost ${a.danger ? "danger" : ""}`} onClick={a.onClick}>
            {a.label}
          </button>
        ))}
      </span>
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return <div style={{ padding: "6px 14px 10px", fontSize: 12, color: "var(--text-faint)" }}>{text}</div>;
}

/** Parked changes (stash). Park itself lives in the top bar; here you see and pop them. */
function ParkedSection() {
  const { wh, rev, run } = useApp();
  const t = useT();
  const { data } = useLoad<ParkList>(() => fk.parkList(wh), [wh, rev]);
  const parked = data?.parked ?? [];
  if (parked.length === 0) return null;

  return (
    <div>
      <div className="group-head">
        <span>{t("parked")}</span>
        <span className="pill">{parked.length}</span>
        <span className="spacer" />
        <button className="btn ghost sm" title="Re-apply the most recently parked changes" onClick={() => run(fk.parkPop(wh), "Popped parked changes")}>
          Pop latest
        </button>
      </div>
      {parked.map((item, i) => {
        const hash = typeof item === "string" ? item : (item as { parcel?: string })?.parcel ?? JSON.stringify(item);
        return (
          <div key={i} className="change-row" style={{ cursor: "default" }}>
            <span className="kind">⇩</span>
            <span className="path" title={hash}>{String(hash).slice(0, 12)}</span>
          </div>
        );
      })}
    </div>
  );
}
