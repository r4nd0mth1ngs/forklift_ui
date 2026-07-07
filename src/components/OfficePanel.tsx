// The office: forklift's signed trust registry. Full CLI parity — every `office`
// subcommand is reachable here:
//   enroll · keygen · admit · link · authorize · role · rotate · retire ·
//   regenesis · accept-regenesis · list (+ audit)
// Signing operations use the session passphrase (top-bar lock / a form field), passed to
// forklift as FORKLIFT_KEY_PASSPHRASE.

import { useState } from "react";
import { fk, IdentityClassFlag, OfficeMessage, OfficeState, Role } from "../api";
import { useApp, useLoad, Loading, Empty, ErrorBanner, IdentityBadge, shortHash, asError } from "../common";
import { Modal, Field, CopyButton, PassphraseInline as PassphraseField } from "./Modal";
import { useT } from "../terms";

interface OfficeKey {
  key_id: string;
  identity_root?: boolean;
  on_this_machine?: boolean;
  protected?: boolean;
  retired?: boolean;
}
interface OfficeUser {
  identifier: string;
  class?: string;
  role?: string;
  keys?: OfficeKey[];
}

type Action =
  | null
  | { kind: "enroll" | "keygen" | "admit" | "link" | "authorize" | "rotate" | "regenesis" | "accept-regenesis" }
  | { kind: "retire"; keyId: string }
  | { kind: "role"; identifier: string; role: string };

export function OfficePanel() {
  const { wh, rev } = useApp();
  const { data, error, loading } = useLoad<OfficeState>(() => fk.office(wh), [wh, rev]);
  const [action, setAction] = useState<Action>(null);

  if (loading && !data) return <Loading label="Reading the office…" />;
  if (error) return <div style={{ padding: 12 }}><ErrorBanner error={error} /></div>;

  const enrolled = !!data?.enrolled;
  const users = (data?.users as OfficeUser[] | undefined) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="panel-head">
        {enrolled ? (
          <>
            <button className="btn primary sm" onClick={() => setAction({ kind: "admit" })}>Admit operator</button>
            <button className="btn sm" onClick={() => setAction({ kind: "keygen" })}>Keygen</button>
            <button className="btn sm" onClick={() => setAction({ kind: "link" })}>Link device</button>
            <button className="btn sm" onClick={() => setAction({ kind: "rotate" })}>Rotate my key</button>
            <button className="btn ghost sm" onClick={() => setAction({ kind: "authorize" })}>Authorize…</button>
            <button className="btn ghost sm danger" onClick={() => setAction({ kind: "regenesis" })}>Re-genesis…</button>
          </>
        ) : (
          <>
            <button className="btn primary sm" onClick={() => setAction({ kind: "enroll" })}>Enroll & establish trust</button>
            <button className="btn sm" onClick={() => setAction({ kind: "keygen" })}>Keygen</button>
            <button className="btn ghost sm" onClick={() => setAction({ kind: "accept-regenesis" })}>Accept re-genesis…</button>
          </>
        )}
      </div>

      <div className="panel-body">
        {!enrolled ? (
          <Empty
            icon="🔓"
            title="No trust established"
            hint="Enroll to anchor trust. From then on every parcel is signed (Ed25519). Keygen mints a key to be admitted into someone else's office."
          />
        ) : (
          <div className="list-panel">
            {users.map((user) => (
              <div key={user.identifier} className="list-row">
                <div style={{ flex: 1 }}>
                  <div className="lead" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{user.identifier}</span>
                    <IdentityBadge cls={user.class} />
                    {user.role && <span className="pill">{user.role}</span>}
                    <button className="btn ghost sm" onClick={() => setAction({ kind: "role", identifier: user.identifier, role: user.role ?? "writer" })}>
                      Change role
                    </button>
                  </div>
                  <div className="sub" style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(user.keys ?? []).map((key) => (
                      <span key={key.key_id} className="pill" title={key.key_id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        🔑 {shortHash(key.key_id)}
                        {key.identity_root ? " · root" : ""}
                        {key.on_this_machine ? " · here" : ""}
                        {key.protected ? " · 🔒" : ""}
                        {key.retired ? " · retired" : ""}
                        {!key.retired && (
                          <button className="btn ghost sm danger" style={{ padding: "0 5px" }} onClick={() => setAction({ kind: "retire", keyId: key.key_id })}>
                            retire
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <AuditRow />
      </div>

      {action?.kind === "enroll" && <EnrollForm onClose={() => setAction(null)} />}
      {action?.kind === "keygen" && <KeygenForm onClose={() => setAction(null)} />}
      {action?.kind === "admit" && <AdmitForm users={users} onClose={() => setAction(null)} />}
      {action?.kind === "link" && <LinkForm onClose={() => setAction(null)} />}
      {action?.kind === "authorize" && <AuthorizeForm onClose={() => setAction(null)} />}
      {action?.kind === "rotate" && <RotateForm onClose={() => setAction(null)} />}
      {action?.kind === "retire" && <RetireForm keyId={action.keyId} onClose={() => setAction(null)} />}
      {action?.kind === "role" && <RoleForm identifier={action.identifier} current={action.role} onClose={() => setAction(null)} />}
      {action?.kind === "regenesis" && <RegenesisForm onClose={() => setAction(null)} />}
      {action?.kind === "accept-regenesis" && <AcceptRegenesisForm onClose={() => setAction(null)} />}
    </div>
  );
}

// ---- Audit ------------------------------------------------------------------

function AuditRow() {
  const { wh, notify } = useApp();
  const [state, setState] = useState<"idle" | "running" | "ok" | "fail">("idle");
  const [detail, setDetail] = useState("");
  const t = useT();

  const audit = async () => {
    setState("running");
    try {
      await fk.audit(wh);
      setState("ok");
      setDetail("Signed history verified against the office chain.");
      notify("ok", "Audit passed");
    } catch (e) {
      const fe = asError(e);
      setState("fail");
      setDetail(fe.message);
      notify("error", "Audit failed", fe.next_step ?? fe.message);
    }
  };

  return (
    <div style={{ padding: 16, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
      <button className="btn" onClick={audit} disabled={state === "running"}>
        {state === "running" ? "Auditing…" : `Verify signed history (${t("audit").toLowerCase()})`}
      </button>
      {state === "ok" && <span style={{ color: "var(--green)" }}>✓ {detail}</span>}
      {state === "fail" && <span style={{ color: "var(--red)" }}>✗ {detail}</span>}
    </div>
  );
}

// ---- Shared bits ------------------------------------------------------------

function useSubmit() {
  const { run, notify, bump } = useApp();
  const [busy, setBusy] = useState(false);
  const submit = async (action: Promise<unknown>, okMessage: string, onDone: () => void) => {
    setBusy(true);
    const ok = await run(action, okMessage);
    setBusy(false);
    if (ok) onDone();
  };
  return { busy, submit, notify, bump };
}

/** A message-returning op (keygen/enroll/rotate/regenesis): show the output before closing. */
function MessageForm({
  title, intro, run, onClose, submitLabel,
}: {
  title: string; intro: React.ReactNode; run: () => Promise<OfficeMessage>; onClose: () => void; submitLabel: string;
}) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    try {
      const out = await run();
      setResult(out.message ?? "Done.");
      app.bump();
    } catch (e) {
      const fe = asError(e);
      app.notify("error", fe.code === "gui" || fe.code === "error" ? "Failed" : fe.code, fe.next_step ?? fe.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} wide={!!result}>
      {result ? (
        <>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--mono)", fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, userSelect: "text", maxHeight: 320, overflow: "auto" }}>
            {result}
          </pre>
          <div className="actions">
            <CopyButton text={result} label="Copy" />
            <button className="btn primary" onClick={onClose}>Done</button>
          </div>
        </>
      ) : (
        <>
          {intro}
          <div className="actions">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={busy} onClick={go}>{busy ? "Working…" : submitLabel}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ---- Forms ------------------------------------------------------------------

function EnrollForm({ onClose }: { onClose: () => void }) {
  const { wh } = useApp();
  const [offline, setOffline] = useState(false);
  const [protect, setProtect] = useState(true);
  return (
    <MessageForm
      title="Enroll & establish trust"
      submitLabel="Enroll"
      onClose={onClose}
      run={() => fk.officeEnroll(wh, { offline, protect })}
      intro={
        <>
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
            Anchors trust in this warehouse. From then on every parcel must be signed — this cannot be undone.
          </p>
          <Field label="">
            <label className="check"><input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} /> Protect the key with a passphrase (recommended for humans)</label>
          </Field>
          {protect && <PassphraseField label="New key passphrase" hint="Stored only in memory for this session." />}
          <Field label="">
            <label className="check"><input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} /> Offline (don't consult the configured remote)</label>
          </Field>
        </>
      }
    />
  );
}

function KeygenForm({ onClose }: { onClose: () => void }) {
  const { wh } = useApp();
  const [protect, setProtect] = useState(true);
  return (
    <MessageForm
      title="Generate a keypair"
      submitLabel="Generate"
      onClose={onClose}
      run={() => fk.officeKeygen(wh, protect)}
      intro={
        <>
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
            Mints a new keypair (private half stays on this machine). The output includes the <code>office admit</code> line to hand an admin.
          </p>
          <Field label="">
            <label className="check"><input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} /> Protect with a passphrase</label>
          </Field>
          {protect && <PassphraseField label="New key passphrase" />}
        </>
      }
    />
  );
}

function AdmitForm({ users, onClose }: { users: OfficeUser[]; onClose: () => void }) {
  const { wh } = useApp();
  const { busy, submit } = useSubmit();
  const [operator, setOperator] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [pop, setPop] = useState("");
  const [role, setRole] = useState<Role>("writer");
  const [klass, setKlass] = useState<"" | IdentityClassFlag>("");
  const [supervisor, setSupervisor] = useState("");
  const [pallets, setPallets] = useState("");
  const humans = users.filter((u) => (u.class ?? "human") === "human");

  const go = () =>
    submit(
      fk.officeAdmit(wh, {
        operator: operator.trim(), publicKey: publicKey.trim(), pop: pop.trim(), role,
        pallets: pallets.split(",").map((p) => p.trim()).filter(Boolean),
        klass: klass || undefined,
        supervisor: klass === "agent" ? supervisor : supervisor || undefined,
      }),
      "Operator admitted",
      onClose,
    );

  const valid = operator && publicKey && pop && (klass !== "agent" || supervisor);

  return (
    <Modal title="Admit an operator" onClose={onClose} wide>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
        Paste the three values from the newcomer's <code>office keygen</code> output. You sign this as an admin.
      </p>
      <Field label="Operator UUID"><input className="text-input" value={operator} onChange={(e) => setOperator(e.target.value)} /></Field>
      <Field label="Public key (64 hex)"><input className="text-input" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} /></Field>
      <Field label="Proof of possession"><input className="text-input" value={pop} onChange={(e) => setPop(e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Role">
          <select className="select wide" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="admin">admin</option>
            <option value="writer">writer</option>
            <option value="reader">reader</option>
          </select>
        </Field>
        <Field label="Identity class">
          <select className="select wide" value={klass} onChange={(e) => setKlass(e.target.value as any)}>
            <option value="">human</option>
            <option value="agent">agent</option>
            <option value="bot">bot</option>
            <option value="service">service</option>
          </select>
        </Field>
      </div>
      {klass === "agent" && (
        <Field label="Supervisor (a human operator; required for agents)">
          <select className="select wide" value={supervisor} onChange={(e) => setSupervisor(e.target.value)}>
            <option value="">Select a supervisor…</option>
            {humans.map((u) => <option key={u.identifier} value={u.identifier}>{u.identifier}</option>)}
          </select>
        </Field>
      )}
      {role === "writer" && <Field label="Restrict to pallets (optional, comma-separated)"><input className="text-input" value={pallets} onChange={(e) => setPallets(e.target.value)} placeholder="main, feature/x" /></Field>}
      <PassphraseField label="Your key passphrase (if protected)" />
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !valid} onClick={go}>Admit</button>
      </div>
    </Modal>
  );
}

function LinkForm({ onClose }: { onClose: () => void }) {
  const { wh } = useApp();
  const { busy, submit } = useSubmit();
  const [publicKey, setPublicKey] = useState("");
  const [pop, setPop] = useState("");
  return (
    <Modal title="Link a new device key" onClose={onClose} wide>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
        Self-service: add a new key to your own identity. Run <code>office keygen</code> on the new device and paste its values here.
      </p>
      <Field label="Public key (64 hex)"><input className="text-input" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} /></Field>
      <Field label="Proof of possession"><input className="text-input" value={pop} onChange={(e) => setPop(e.target.value)} /></Field>
      <PassphraseField label="Your existing key's passphrase (if protected)" />
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !publicKey || !pop} onClick={() => submit(fk.officeLink(wh, publicKey.trim(), pop.trim()), "Device linked", onClose)}>Link</button>
      </div>
    </Modal>
  );
}

function AuthorizeForm({ onClose }: { onClose: () => void }) {
  const { wh } = useApp();
  const { busy, submit } = useSubmit();
  const [operator, setOperator] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [pop, setPop] = useState("");
  return (
    <Modal title="Authorize a recovery key (admin)" onClose={onClose} wide>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
        Admin recovery: re-key an operator who lost every device. Paste their new <code>office keygen</code> values.
      </p>
      <Field label="Operator UUID"><input className="text-input" value={operator} onChange={(e) => setOperator(e.target.value)} /></Field>
      <Field label="New public key (64 hex)"><input className="text-input" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} /></Field>
      <Field label="Proof of possession"><input className="text-input" value={pop} onChange={(e) => setPop(e.target.value)} /></Field>
      <PassphraseField label="Your admin key passphrase (if protected)" />
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !operator || !publicKey || !pop} onClick={() => submit(fk.officeAuthorize(wh, operator.trim(), publicKey.trim(), pop.trim()), "Recovery key authorized", onClose)}>Authorize</button>
      </div>
    </Modal>
  );
}

function RoleForm({ identifier, current, onClose }: { identifier: string; current: string; onClose: () => void }) {
  const { wh } = useApp();
  const { busy, submit } = useSubmit();
  const [role, setRole] = useState<Role>((current as Role) || "writer");
  const [pallets, setPallets] = useState("");
  return (
    <Modal title="Change role" onClose={onClose}>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>Operator <code>{shortHash(identifier)}</code></p>
      <Field label="Role">
        <select className="select wide" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="admin">admin</option>
          <option value="writer">writer</option>
          <option value="reader">reader</option>
        </select>
      </Field>
      {role === "writer" && <Field label="Restrict to pallets (optional, comma-separated)"><input className="text-input" value={pallets} onChange={(e) => setPallets(e.target.value)} /></Field>}
      <PassphraseField label="Your admin key passphrase (if protected)" />
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => submit(fk.officeRole(wh, identifier, role, pallets.split(",").map((p) => p.trim()).filter(Boolean)), "Role updated", onClose)}>Save</button>
      </div>
    </Modal>
  );
}

function RotateForm({ onClose }: { onClose: () => void }) {
  const { wh } = useApp();
  const [offline, setOffline] = useState(false);
  const [protect, setProtect] = useState(true);
  return (
    <MessageForm
      title="Rotate my key"
      submitLabel="Rotate"
      onClose={onClose}
      run={() => fk.officeRotate(wh, { offline, protect })}
      intro={
        <>
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
            Issues a fresh key signed by your current one, then retires the old key. Use one passphrase to unlock the old key and protect the new one.
          </p>
          <Field label="">
            <label className="check"><input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} /> Protect the new key with a passphrase</label>
          </Field>
          <PassphraseField label="Key passphrase" hint="Unlocks the current key and (if protecting) the new one." />
          <Field label="">
            <label className="check"><input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} /> Offline (skip the remote)</label>
          </Field>
        </>
      }
    />
  );
}

function RetireForm({ keyId, onClose }: { keyId: string; onClose: () => void }) {
  const { wh } = useApp();
  const { busy, submit } = useSubmit();
  const [compromised, setCompromised] = useState(false);
  const [offline, setOffline] = useState(false);
  return (
    <Modal title="Retire a key" onClose={onClose}>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>Revoking key <code>{shortHash(keyId)}</code>.</p>
      <Field label="">
        <label className="check"><input type="checkbox" checked={compromised} onChange={(e) => setCompromised(e.target.checked)} /> Compromised (the key may be in someone else's hands)</label>
      </Field>
      <Field label="">
        <label className="check"><input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} /> Offline (skip the remote)</label>
      </Field>
      <PassphraseField label="Your key passphrase (if protected)" />
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn danger" disabled={busy} onClick={() => submit(fk.officeRetire(wh, { keyId, compromised, offline }), "Key retired", onClose)}>Retire</button>
      </div>
    </Modal>
  );
}

function RegenesisForm({ onClose }: { onClose: () => void }) {
  const { wh } = useApp();
  return (
    <MessageForm
      title="Re-genesis (reset trust)"
      submitLabel="Perform re-genesis"
      onClose={onClose}
      run={() => fk.officeRegenesis(wh, true)}
      intro={
        <p style={{ color: "var(--red)", fontSize: 12, marginTop: 0 }}>
          Nuclear recovery for a locked-out office chain. Establishes a fresh genesis anchor. Everyone syncing must run <code>accept-regenesis</code> after out-of-band verification. This is deliberately loud.
        </p>
      }
    />
  );
}

function AcceptRegenesisForm({ onClose }: { onClose: () => void }) {
  const { wh } = useApp();
  return (
    <MessageForm
      title="Accept a remote's re-genesis"
      submitLabel="Accept new anchor"
      onClose={onClose}
      run={() => fk.officeAcceptRegenesis(wh, true)}
      intro={
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 0 }}>
          The remote reset its trust anchor. Accept the new anchor only after verifying it out of band (the SSH-host-key-change moment).
        </p>
      }
    />
  );
}
