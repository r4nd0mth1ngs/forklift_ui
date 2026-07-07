// Hauls = forklift's pull requests (an append-only log of signed events on the @haul meta
// pallet). This is the full write-flow: open a proposal, discuss, record signed reviews,
// then merge / close / reopen. Master-detail: the list on the left, the selected haul on
// the right. Signing note: open/review/merge require an enrolled key; a passphrase-
// protected key needs FORKLIFT_KEY_PASSPHRASE in the environment (the GUI has no TTY).

import { useState } from "react";
import { fk, HaulDetail, Hauls, HaulState, OfficeState, Pallets, ReviewVerdict } from "../api";
import {
  useApp, useLoad, Loading, Empty, ErrorBanner, IdentityBadge, shortHash,
  buildIdentityMap, IdentityMap,
} from "../common";
import { DiffView } from "./DiffView";
import { useT } from "../terms";
import { PaneDivider } from "./PaneDivider";

const STATES: HaulState[] = ["open", "merged", "closed", "all"];

export function HaulsPanel() {
  const t = useT();
  const { wh, rev } = useApp();
  const [state, setState] = useState<HaulState>("open");
  const [selected, setSelected] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const list = useLoad<Hauls>(() => fk.hauls(wh, state), [wh, rev, state]);

  const hauls = list.data?.hauls ?? [];

  return (
    <div className="changes-layout">
      <div className="changes-list">
        <div className="panel-head" style={{ borderTop: "none" }}>
          <select value={state} onChange={(e) => setState(e.target.value as HaulState)} className="select">
            {STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="spacer" />
          <button className="btn primary sm" onClick={() => { setOpening(true); setSelected(null); }}>＋ New {t("haul").toLowerCase()}</button>
        </div>

        <div className="changes-scroll">
          {list.loading && !list.data && <Loading label="Reading hauls…" />}
          {list.error && <div style={{ padding: 12 }}><ErrorBanner error={list.error} /></div>}
          {!list.loading && hauls.length === 0 && (
            <Empty icon="🚚" title={`No ${state === "all" ? "" : state} ${t("hauls").toLowerCase()}`} hint="Open one with ＋ New haul." />
          )}
          {hauls.map((haul) => (
            <button
              key={haul.id}
              className={`change-row ${selected === haul.id && !opening ? "selected" : ""}`}
              style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderLeft: "2px solid transparent" }}
              onClick={() => { setSelected(haul.id); setOpening(false); }}
            >
              <span style={{ fontSize: 15 }}>🚚</span>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{haul.title}</div>
                <div className="sub" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
                  <StatusPill status={haul.status} />
                  <span className="parcel-hash">{haul.source} → {haul.target}</span>
                  {haul.approvals > 0 && <span className="badge human">✓{haul.approvals}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <PaneDivider storageKey="forklift.mdListWidth" min={240} max={720} />
      <div className="diff-pane">
        {opening ? (
          <OpenHaulForm
            onCancel={() => setOpening(false)}
            onOpened={(id) => { setOpening(false); setSelected(id); setState("open"); }}
          />
        ) : selected ? (
          <HaulDetailView id={selected} />
        ) : (
          <Empty icon="🚚" title={`Select a ${t("haul").toLowerCase()}`} hint="Or open a new merge proposal with ＋ New haul." />
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = status === "merged" ? "var(--purple)" : status === "closed" ? "var(--red)" : "var(--green)";
  return <span className="pill" style={{ color }}>{status}</span>;
}

// ---- Open a new haul --------------------------------------------------------

function OpenHaulForm({ onCancel, onOpened }: { onCancel: () => void; onOpened: (id: string) => void }) {
  const t = useT();
  const { wh, rev, notify } = useApp();
  const { data: pallets } = useLoad<Pallets>(() => fk.pallets(wh), [wh, rev]);
  const names = (pallets?.pallets ?? []).map((p) => p.name);
  const current = pallets?.current ?? "";

  const [sourceSel, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Source defaults to the current pallet until the user overrides it.
  const source = sourceSel || current;

  const submit = async () => {
    if (!target || !title.trim() || source === target) return;
    setBusy(true);
    try {
      const result: any = await fk.haulOpen(wh, { target, source, title: title.trim(), message: message.trim() || undefined });
      notify("ok", "Haul opened");
      onOpened(result.id);
    } catch (error: any) {
      notify("error", error?.code === "gui" ? "Could not open haul" : (error?.code ?? "error"), error?.next_step ?? error?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 20, overflowY: "auto" }}>
      <h2 style={{ marginTop: 0 }}>New {t("haul").toLowerCase()}</h2>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: -4 }}>
        Propose merging one pallet into another. The proposal is a signed event on the @haul pallet.
      </p>

      <div className="field">
        <label>Merge from (source)</label>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="select wide">
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Into (target)</label>
        <select value={target} onChange={(e) => setTarget(e.target.value)} className="select wide">
          <option value="">Select a target pallet…</option>
          {names.filter((n) => n !== source).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add greeting feature" className="text-input" />
      </div>
      <div className="field">
        <label>Description (optional)</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="text-input" rows={4} style={{ resize: "vertical" }} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button className="btn primary" disabled={busy || !target || !title.trim() || source === target} onClick={submit}>
          Open {t("haul").toLowerCase()}
        </button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>
        Requires an enrolled signing key. A passphrase-protected key needs
        <code> FORKLIFT_KEY_PASSPHRASE</code> in the environment.
      </div>
    </div>
  );
}

// ---- Haul detail + actions --------------------------------------------------

function HaulDetailView({ id }: { id: string }) {
  const { wh, rev, run } = useApp();
  const detail = useLoad<HaulDetail>(() => fk.haulShow(wh, id), [wh, rev, id]);
  const office = useLoad<OfficeState>(() => fk.office(wh), [wh, rev]);
  const pallets = useLoad<Pallets>(() => fk.pallets(wh), [wh, rev]);
  const identities = buildIdentityMap(office.data);
  const [comment, setComment] = useState("");
  const [tab, setTab] = useState<"conversation" | "diff">("conversation");

  if (detail.loading && !detail.data) return <Loading label="Reading haul…" />;
  if (detail.error) return <div style={{ padding: 12 }}><ErrorBanner error={detail.error} /></div>;
  const h = detail.data!;
  const open = h.status === "open";

  const sendComment = async () => {
    if (!comment.trim()) return;
    const ok = await run(fk.haulComment(wh, id, comment.trim()));
    if (ok) setComment("");
  };
  const review = (verdict: ReviewVerdict) => run(fk.haulReview(wh, id, verdict), `Review recorded (${verdict})`);

  // Merging lands on the target pallet, so shift there first if we're elsewhere. A dirty
  // working tree makes the shift fail with a classified error, which run() surfaces.
  const merge = () => {
    const current = pallets.data?.current;
    const action = current && current !== h.target
      ? fk.shift(wh, h.target).then(() => fk.haulMerge(wh, id))
      : fk.haulMerge(wh, id);
    return run(action, "Haul merged");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, flex: 1 }}>{h.title}</h2>
          <StatusPill status={h.status} />
        </div>
        <div className="sub" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
          <span className="pill">{h.source} → {h.target}</span>
          <span>opened by {shortId(h.opened_by)}</span>
          <IdentityBadge cls={identities[h.opened_by]?.class} />
          <span className="parcel-hash">{shortHash(h.id)}</span>
        </div>
        {h.description && <p style={{ marginBottom: 0, color: "var(--text-dim)" }}>{h.description}</p>}
        <div className="tabs" style={{ marginTop: 10 }}>
          <button className={`tab ${tab === "conversation" ? "active" : ""}`} onClick={() => setTab("conversation")}>
            Conversation{h.thread.length > 0 ? ` (${h.thread.length})` : ""}
          </button>
          <button className={`tab ${tab === "diff" ? "active" : ""}`} onClick={() => setTab("diff")}>
            Diff
          </button>
        </div>
      </div>

      {tab === "conversation" ? (
        <div className="panel-body" style={{ padding: "10px 18px" }}>
          <ReviewSummary reviews={h.reviews} identities={identities} />
          <Thread thread={h.thread} identities={identities} />
        </div>
      ) : (
        <div className="panel-body" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "6px 18px", fontSize: 12, color: "var(--text-dim)" }}>
            What merging <strong>{h.source}</strong> into <strong>{h.target}</strong> would change:
          </div>
          <DiffView revs={[h.target, h.source]} />
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--border)", padding: 12, background: "var(--panel)" }}>
        {open ? (
          <>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Leave a comment…"
              rows={2}
              className="text-input"
              style={{ resize: "vertical", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn" disabled={!comment.trim()} onClick={sendComment}>Comment</button>
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={() => review("approve")} title="Signed approval">✓ Approve</button>
              <button className="btn" onClick={() => review("request-changes")}>Request changes</button>
              <button className="btn primary" onClick={merge} title={`Shift to ${h.target} and consolidate ${h.source}`}>Merge</button>
              <button className="btn ghost danger" onClick={() => run(fk.haulClose(wh, id), "Haul closed")}>Close</button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: "var(--text-dim)" }}>This haul is {h.status}.</span>
            <span style={{ flex: 1 }} />
            {h.status === "closed" && (
              <button className="btn" onClick={() => run(fk.haulReopen(wh, id), "Haul reopened")}>Reopen</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewSummary({ reviews, identities }: { reviews: HaulDetail["reviews"]; identities: IdentityMap }) {
  if (reviews.length === 0) return null;
  const approvals = reviews.filter((r) => r.verdict === "approve").length;
  const changes = reviews.filter((r) => r.verdict === "request-changes").length;
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 12, fontSize: 12 }}>
      {approvals > 0 && <span className="badge human">✓ {approvals} approved</span>}
      {changes > 0 && <span className="badge" style={{ background: "var(--red-bg)", color: "var(--red)" }}>✗ {changes} changes requested</span>}
      {reviews.map((r, i) => (
        <span key={i} className="pill" title={r.body}>
          {shortId(r.author)} · {r.verdict}
          {identities[r.author]?.class ? ` (${identities[r.author].class})` : ""}
        </span>
      ))}
    </div>
  );
}

function Thread({ thread, identities }: { thread: HaulDetail["thread"]; identities: IdentityMap }) {
  if (thread.length === 0) return <div style={{ color: "var(--text-faint)", fontSize: 12 }}>No comments yet.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {thread.map((item, i) => (
        <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", background: "var(--bg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-dim)", marginBottom: item.body ? 4 : 0 }}>
            <strong style={{ color: "var(--text)" }}>{shortId(item.author)}</strong>
            <IdentityBadge cls={identities[item.author]?.class} />
            <span className="pill">{item.kind}</span>
          </div>
          {item.body && <div>{item.body}</div>}
        </div>
      ))}
    </div>
  );
}

function shortId(id: string): string {
  return id ? id.slice(0, 8) : "unknown";
}
