// Tags: signed release labels on the @tags meta pallet. Full CLI parity — create, show,
// list. Creating a tag signs it, so it uses the session passphrase.

import { useState } from "react";
import { fk, Pallets, Tag, Tags } from "../api";
import { useApp, useLoad, Loading, Empty, ErrorBanner, shortHash } from "../common";
import { Field, PassphraseInline } from "./Modal";
import { useT } from "../terms";
import { PaneDivider } from "./PaneDivider";

export function TagsPanel() {
  const t = useT();
  const { wh, rev } = useApp();
  const list = useLoad<Tags>(() => fk.tags(wh), [wh, rev]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const tags = list.data?.tags ?? [];

  return (
    <div className="changes-layout">
      <div className="changes-list">
        <div className="panel-head" style={{ borderTop: "none" }}>
          <span style={{ fontWeight: 700 }}>{t("tags")}</span>
          <span className="spacer" />
          <button className="btn primary sm" onClick={() => { setCreating(true); setSelected(null); }}>＋ New {t("tag").toLowerCase()}</button>
        </div>
        <div className="changes-scroll">
          {list.loading && !list.data && <Loading label="Reading tags…" />}
          {list.error && <div style={{ padding: 12 }}><ErrorBanner error={list.error} /></div>}
          {!list.loading && tags.length === 0 && <Empty icon="🏷️" title={`No ${t("tags").toLowerCase()}`} hint="Create a signed release tag with ＋ New tag." />}
          {tags.map((tag) => (
            <button
              key={tag.name}
              className={`change-row ${selected === tag.name && !creating ? "selected" : ""}`}
              style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderLeft: "2px solid transparent" }}
              onClick={() => { setSelected(tag.name); setCreating(false); }}
            >
              <span style={{ fontSize: 15 }}>🏷️</span>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontWeight: 600 }}>{tag.name}</div>
                <div className="sub" style={{ fontSize: 11 }}>
                  {tag.subject && <span className="parcel-hash">→ {shortHash(String(tag.subject))}</span>}
                  {tag.tagger ? ` · ${String(tag.tagger).slice(0, 8)}` : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <PaneDivider storageKey="forklift.mdListWidth" min={240} max={720} />
      <div className="diff-pane">
        {creating ? (
          <CreateTagForm onCancel={() => setCreating(false)} onCreated={(name) => { setCreating(false); setSelected(name); }} />
        ) : selected ? (
          <TagDetail name={selected} />
        ) : (
          <Empty icon="🏷️" title="Select a tag" hint="Or create a signed release tag with ＋ New tag." />
        )}
      </div>
    </div>
  );
}

function CreateTagForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (name: string) => void }) {
  const t = useT();
  const { wh, rev, run } = useApp();
  const { data: pallets } = useLoad<Pallets>(() => fk.pallets(wh), [wh, rev]);
  const names = (pallets?.pallets ?? []).map((p) => p.name);
  const [name, setName] = useState("");
  const [revision, setRevision] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const ok = await run(fk.tagCreate(wh, { name: name.trim(), revision: revision || undefined, message: message.trim() || undefined }), `Tagged ${name.trim()}`);
    setBusy(false);
    if (ok) onCreated(name.trim());
  };

  return (
    <div style={{ padding: 20, overflowY: "auto" }}>
      <h2 style={{ marginTop: 0 }}>New {t("tag").toLowerCase()}</h2>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: -4 }}>
        A signed, named pointer to a parcel — a release. The tagger is your signature.
      </p>
      <Field label="Name"><input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="v1.2.0" /></Field>
      <Field label="Revision (default: current pallet head)">
        <select className="select wide" value={revision} onChange={(e) => setRevision(e.target.value)}>
          <option value="">current head</option>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      <Field label="Message (optional)">
        <textarea className="text-input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} style={{ resize: "vertical" }} />
      </Field>
      <PassphraseInline label="Your key passphrase (if protected)" />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn primary" disabled={busy || !name.trim()} onClick={create}>Create tag</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>Creating a tag signs it — requires an enrolled key. Convention (§9.4d): release tags are cut by an admin.</div>
    </div>
  );
}

function TagDetail({ name }: { name: string }) {
  const { wh, rev } = useApp();
  const { data, error, loading } = useLoad<Tag>(() => fk.tagShow(wh, name), [wh, rev, name]);

  if (loading && !data) return <Loading label="Reading tag…" />;
  if (error) return <div style={{ padding: 12 }}><ErrorBanner error={error} /></div>;
  const tag = data!;
  const subject = tag.subject ? String(tag.subject) : undefined;

  return (
    <div style={{ padding: "16px 20px" }}>
      <h2 style={{ margin: 0 }}>🏷️ {tag.name}</h2>
      <div className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {subject && <span className="parcel-hash">→ {shortHash(subject)}</span>}
        {tag.tagger != null && <span>tagger {String(tag.tagger).slice(0, 8)}</span>}
      </div>
      {tag.message && <p style={{ marginTop: 12 }}>{String(tag.message)}</p>}
      <div style={{ marginTop: 16 }}>
        {Object.entries(tag)
          .filter(([k]) => !["name", "subject", "message", "tagger"].includes(k))
          .map(([k, v]) => (
            <div key={k} style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
              {k}: {typeof v === "string" ? v : JSON.stringify(v)}
            </div>
          ))}
      </div>
    </div>
  );
}
