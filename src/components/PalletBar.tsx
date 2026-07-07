// The pallet (branch) switcher in the sidebar: lists pallets, shifts between them, and
// creates new ones. Meta pallets (@office, @tags, @haul) are hidden here — they have
// their own dedicated panels.

import { useState } from "react";
import { fk, Pallets } from "../api";
import { useApp, useLoad } from "../common";
import { useT } from "../terms";

export function PalletBar() {
  const { wh, rev, run } = useApp();
  const t = useT();
  const { data } = useLoad<Pallets>(() => fk.pallets(wh), [wh, rev]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const pallets = data?.pallets ?? [];

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const ok = await run(fk.palletize(wh, trimmed), `Created ${t("pallet").toLowerCase()} ${trimmed}`);
    if (ok) {
      setName("");
      setCreating(false);
    }
  };

  return (
    <>
      <div className="section-label" style={{ display: "flex", alignItems: "center" }}>
        <span>{t("pallets")}</span>
        <span style={{ flex: 1 }} />
        <button className="btn ghost sm" title={`New ${t("pallet").toLowerCase()}`} onClick={() => setCreating((v) => !v)}>
          ＋
        </button>
      </div>

      {creating && (
        <div style={{ padding: "2px 12px 8px", display: "flex", gap: 6 }}>
          <input
            autoFocus
            className="pallet-input"
            placeholder="new-pallet"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key === "Escape") setCreating(false);
            }}
            style={{
              flex: 1,
              padding: "3px 7px",
              border: "1px solid var(--border)",
              borderRadius: 5,
              background: "var(--bg)",
              color: "var(--text)",
              fontFamily: "var(--mono)",
              fontSize: 12,
            }}
          />
        </div>
      )}

      {data?.current_unborn && (
        <div style={{ padding: "0 14px 6px", fontSize: 11, color: "var(--text-faint)" }}>
          {data.current} is unborn — {t("stack").toLowerCase()} a {t("parcel").toLowerCase()} to create it.
        </div>
      )}

      {pallets.map((p) => (
        <div key={p.name} className={`nav-item pallet-item ${p.current ? "active" : ""}`}>
          <button
            className="pallet-shift"
            onClick={() => !p.current && run(fk.shift(wh, p.name), `Shifted to ${p.name}`)}
            title={p.current ? "current pallet" : `shift to ${p.name}`}
          >
            <span className="ico">{p.current ? "▸" : "▪"}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
          </button>
          {!p.current && (
            <span className="pallet-actions">
              <button
                className="btn ghost sm"
                title={`${t("consolidate")} ${p.name} → current ${t("pallet").toLowerCase()}`}
                onClick={() => run(fk.consolidate(wh, p.name), `Consolidated ${p.name}`)}
              >
                ⤵
              </button>
              <button
                className="btn ghost sm"
                title={`${t("deliver")} current ${t("pallet").toLowerCase()} → ${p.name}`}
                onClick={() => run(fk.deliver(wh, p.name), `Delivered onto ${p.name}`)}
              >
                ⤴
              </button>
            </span>
          )}
        </div>
      ))}
    </>
  );
}
