// The manifest: signed post-metadata attached to a parcel (§7.2) — notes, approvals,
// and AI provenance. All three subcommands sign, so each form carries a passphrase
// field. Entries join their author id against the office registry for identity badges,
// mirroring how history/hauls surface forklift's signed identity.

import { useState } from "react";
import { fk, ManifestShow, OfficeState, Pallets } from "../api";
import { useApp, useLoad, Loading, Empty, ErrorBanner, IdentityBadge, buildIdentityMap } from "../common";
import { Modal, Field, PassphraseInline } from "./Modal";

interface ManifestEntry {
  author: string;
  body: string;
  kind: string;
  recorded_at: number;
  model?: string;
  tool?: string;
  session?: string;
  transcript?: string;
}

type Action = null | "note" | "approve" | "provenance";

export function ManifestPanel() {
  const { wh, rev } = useApp();
  const [revision, setRevision] = useState("");
  const pallets = useLoad<Pallets>(() => fk.pallets(wh), [wh, rev]);
  const effRev = revision || pallets.data?.current || "";

  const manifest = useLoad<ManifestShow>(
    () => (effRev ? fk.manifestShow(wh, effRev) : Promise.resolve({ entries: [] } as ManifestShow)),
    [wh, rev, effRev],
  );
  const office = useLoad<OfficeState>(() => fk.office(wh), [wh, rev]);
  const identities = buildIdentityMap(office.data);

  const [action, setAction] = useState<Action>(null);

  const entries = (manifest.data?.entries ?? []) as ManifestEntry[];
  const subject = manifest.data?.subject as string | undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="panel-head">
        <input
          className="text-input"
          value={revision}
          onChange={(e) => setRevision(e.target.value)}
          placeholder={pallets.data?.current || "revision"}
          style={{ width: 200 }}
        />
        <button className="btn primary sm" onClick={() => setAction("note")} disabled={!effRev}>Add note</button>
        <button className="btn sm" onClick={() => setAction("approve")} disabled={!effRev}>Approve</button>
        <button className="btn sm" onClick={() => setAction("provenance")} disabled={!effRev}>Add provenance</button>
      </div>

      <div className="panel-body">
        {manifest.error ? (
          <div style={{ padding: 12 }}><ErrorBanner error={manifest.error} /></div>
        ) : manifest.loading && !manifest.data ? (
          <Loading label="Reading the manifest…" />
        ) : entries.length === 0 ? (
          <Empty
            icon="📝"
            title="No manifest entries"
            hint="Attach a signed note, approval, or AI provenance to this parcel."
          />
        ) : (
          <div style={{ padding: 12 }}>
            {subject && (
              <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
                {subject}
              </div>
            )}
            {entries.map((entry, i) => (
              <EntryCard key={i} entry={entry} cls={identities[entry.author]?.class} />
            ))}
          </div>
        )}
      </div>

      {action === "note" && <NoteForm revision={effRev} onClose={() => setAction(null)} />}
      {action === "approve" && <ApproveForm revision={effRev} onClose={() => setAction(null)} />}
      {action === "provenance" && <ProvenanceForm revision={effRev} onClose={() => setAction(null)} />}
    </div>
  );
}

// ---- Entry card -------------------------------------------------------------

function kindBadgeClass(kind: string): string {
  switch (kind) {
    case "approval":
      return "badge human"; // green-ish
    case "provenance":
      return "badge agent"; // purple-ish
    default:
      return "pill"; // neutral note
  }
}

function EntryCard({ entry, cls }: { entry: ManifestEntry; cls?: string }) {
  const when = new Date(entry.recorded_at * 1000).toLocaleString();
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className={kindBadgeClass(entry.kind)}>{entry.kind}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{entry.author.slice(0, 8)}</span>
        <IdentityBadge cls={cls} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{when}</span>
      </div>
      {entry.body && (
        <div style={{ marginTop: 8, fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {entry.body}
        </div>
      )}
      {entry.kind === "provenance" && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
          {entry.model && <ProvLine label="model" value={entry.model} />}
          {entry.tool && <ProvLine label="tool" value={entry.tool} />}
          {entry.session && <ProvLine label="session" value={entry.session} />}
          {entry.transcript && <ProvLine label="transcript" value={entry.transcript} />}
        </div>
      )}
    </div>
  );
}

function ProvLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
      <span style={{ color: "var(--text-faint)" }}>{label}:</span> {value}
    </div>
  );
}

// ---- Submit plumbing --------------------------------------------------------

function useSubmit() {
  const { run } = useApp();
  const [busy, setBusy] = useState(false);
  const submit = async (action: Promise<unknown>, okMessage: string, onDone: () => void) => {
    setBusy(true);
    const ok = await run(action, okMessage);
    setBusy(false);
    if (ok) onDone();
  };
  return { busy, submit };
}

// ---- Forms ------------------------------------------------------------------

function NoteForm({ revision, onClose }: { revision: string; onClose: () => void }) {
  const { wh } = useApp();
  const { busy, submit } = useSubmit();
  const [message, setMessage] = useState("");
  return (
    <Modal title="Add a signed note" onClose={onClose}>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
        Attaches a signed note to <code>{revision}</code>.
      </p>
      <Field label="Message">
        <textarea className="text-input" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
      </Field>
      <PassphraseInline label="Your key passphrase (if protected)" />
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          disabled={busy || !message.trim()}
          onClick={() => submit(fk.manifestNote(wh, revision, message), "Note added", onClose)}
        >
          Add note
        </button>
      </div>
    </Modal>
  );
}

function ApproveForm({ revision, onClose }: { revision: string; onClose: () => void }) {
  const { wh } = useApp();
  const { busy, submit } = useSubmit();
  const [message, setMessage] = useState("");
  return (
    <Modal title="Record an approval" onClose={onClose}>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
        Signs an approval of <code>{revision}</code>.
      </p>
      <Field label="Message (optional)">
        <textarea className="text-input" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
      </Field>
      <PassphraseInline label="Your key passphrase (if protected)" />
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => submit(fk.manifestApprove(wh, revision, message || undefined), "Approval recorded", onClose)}
        >
          Approve
        </button>
      </div>
    </Modal>
  );
}

function ProvenanceForm({ revision, onClose }: { revision: string; onClose: () => void }) {
  const { wh } = useApp();
  const { busy, submit } = useSubmit();
  const [model, setModel] = useState("");
  const [tool, setTool] = useState("");
  const [session, setSession] = useState("");
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  return (
    <Modal title="Record AI provenance" onClose={onClose} wide>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
        Signs an AI provenance record onto <code>{revision}</code>.
      </p>
      <Field label="Model (required)">
        <input className="text-input" value={model} onChange={(e) => setModel(e.target.value)} />
      </Field>
      <Field label="Tool">
        <input className="text-input" value={tool} onChange={(e) => setTool(e.target.value)} />
      </Field>
      <Field label="Session">
        <input className="text-input" value={session} onChange={(e) => setSession(e.target.value)} />
      </Field>
      <Field label="Transcript">
        <input className="text-input" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
      </Field>
      <Field label="Message">
        <input className="text-input" value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <PassphraseInline label="Your key passphrase (if protected)" />
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          disabled={busy || !model.trim()}
          onClick={() =>
            submit(
              fk.manifestProvenance(wh, revision, {
                model,
                tool: tool || undefined,
                session: session || undefined,
                transcript: transcript || undefined,
                message: message || undefined,
              }),
              "Provenance recorded",
              onClose,
            )
          }
        >
          Add provenance
        </button>
      </div>
    </Modal>
  );
}
