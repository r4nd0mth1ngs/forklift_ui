// Git-blame: attribute each line of a file to the parcel and signed identity that
// introduced it. Like forklift's history panel, blame's JSON doesn't inline the identity
// class, so we join each parcel's operator id against the office registry to badge the
// author (human / agent / bot / service). The gutter only labels the first line of each
// consecutive run of the same parcel, so unbroken authorship reads as one block.

import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { fk, Blame, OfficeState } from "../api";
import { useApp, useLoad, Loading, Empty, ErrorBanner, IdentityBadge, shortHash, buildIdentityMap } from "../common";

const EMPTY_BLAME: Blame = { lines: [], parcels: {} };

/** An absolute path, made relative to the warehouse root (forklift blames repo-relative). */
function relativeTo(abs: string, root: string): string {
  const r = root.replace(/[/\\]+$/, "");
  if (abs === r) return abs;
  if (abs.startsWith(r + "/") || abs.startsWith(r + "\\")) return abs.slice(r.length + 1);
  return abs; // outside the warehouse — let forklift report it
}

export function BlamePanel() {
  const { wh, rev } = useApp();
  const [path, setPath] = useState("");
  const [revision, setRevision] = useState("");
  const [submittedPath, setSubmittedPath] = useState("");
  const [submittedRev, setSubmittedRev] = useState("");

  const blame = useLoad<Blame>(
    () => (submittedPath ? fk.blame(wh, submittedPath, submittedRev || undefined) : Promise.resolve(EMPTY_BLAME)),
    [wh, rev, submittedPath, submittedRev],
  );
  const office = useLoad<OfficeState>(() => fk.office(wh), [wh, rev]);
  const identities = buildIdentityMap(office.data);

  const runBlame = (nextPath: string) => {
    setSubmittedPath(nextPath.trim());
    setSubmittedRev(revision.trim());
  };
  const submit = () => runBlame(path);

  const browse = async () => {
    const picked = await open({ directory: false, multiple: false, defaultPath: wh, title: "Select a file to blame" });
    if (typeof picked !== "string") return;
    const relative = relativeTo(picked, wh);
    setPath(relative);
    runBlame(relative);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className="panel-head">
        <button className="btn sm" onClick={browse} title="Pick a file from the warehouse">Browse…</button>
        <input
          className="text-input"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="path/to/file.txt"
          style={{ flex: 1 }}
        />
        <input
          className="text-input"
          value={revision}
          onChange={(e) => setRevision(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="revision (default: current head)"
          style={{ flex: "0 0 200px" }}
        />
        <button className="btn primary sm" onClick={submit} disabled={!path.trim()}>Blame</button>
      </div>

      {!submittedPath ? (
        <Empty icon="🔍" title="Blame a file" hint="Browse for a file — or type a path — to see who wrote each line." />
      ) : blame.loading && !blame.data ? (
        <Loading label="Assigning blame…" />
      ) : blame.error ? (
        <div style={{ padding: 12 }}><ErrorBanner error={blame.error} /></div>
      ) : (
        <BlameLines blame={blame.data ?? EMPTY_BLAME} identities={identities} />
      )}
    </div>
  );
}

function BlameLines({ blame, identities }: { blame: Blame; identities: Record<string, { class?: string; role?: string }> }) {
  if (blame.lines.length === 0) {
    return <Empty icon="≈" title="Nothing to show" hint="This file has no lines to attribute." />;
  }

  return (
    <div style={{ overflow: "auto", flex: 1, fontFamily: "var(--mono)", fontSize: 12 }}>
      {blame.lines.map((line, i) => {
        const firstOfRun = i === 0 || blame.lines[i - 1].parcel !== line.parcel;
        const operator = blame.parcels[line.parcel]?.operator ?? "";
        return (
          <div key={i} style={{ display: "flex", alignItems: "baseline", lineHeight: 1.55 }}>
            <span
              style={{
                flex: "0 0 220px",
                display: "flex",
                gap: 6,
                alignItems: "center",
                overflow: "hidden",
                padding: "0 10px",
                borderRight: "1px solid var(--border)",
                color: "var(--text-dim)",
                whiteSpace: "nowrap",
              }}
            >
              {firstOfRun && (
                <>
                  <span style={{ color: "var(--text-faint)" }}>{shortHash(line.parcel)}</span>
                  <span>{operator.slice(0, 8)}</span>
                  <IdentityBadge cls={identities[operator]?.class} />
                </>
              )}
            </span>
            <span style={{ flex: "0 0 44px", textAlign: "right", padding: "0 10px", color: "var(--text-faint)", userSelect: "none" }}>
              {line.number}
            </span>
            <span style={{ flex: 1, whiteSpace: "pre", paddingRight: 12 }}>{line.content}</span>
          </div>
        );
      })}
    </div>
  );
}
