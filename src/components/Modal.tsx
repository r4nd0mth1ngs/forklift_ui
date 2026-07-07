// A small generic modal dialog + a copy-to-clipboard button, shared by the office and
// tag write-flows.

import { ReactNode, useState } from "react";
import { setSigningPassphrase } from "../api";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal${wide ? " wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <h3 style={{ flex: 1, margin: 0 }}>{title}</h3>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ marginTop: 14 }}>{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

/** A password field that writes straight into the in-memory session signing passphrase. */
export function PassphraseInline({ label = "Key passphrase", hint }: { label?: string; hint?: string }) {
  const [value, setValue] = useState("");
  return (
    <Field label={label} hint={hint}>
      <input
        type="password"
        value={value}
        onChange={(e) => { setValue(e.target.value); setSigningPassphrase(e.target.value); }}
        className="text-input"
        placeholder="••••••••"
      />
    </Field>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard may be unavailable; ignore */
        }
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
