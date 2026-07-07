// Renders forklift's line-level diff. Forklift's `diff` prints a compact, changed-lines-
// only view: a `kind: path` header per file, then `<lineno> <+|-> <content>` rows. We
// parse that (ANSI already stripped in the Rust layer) rather than reinventing any diff.

import { useMemo } from "react";
import { fk, ForkliftError } from "../api";
import { useApp, useLoad, Loading, Empty, ErrorBanner } from "../common";

interface DiffLine {
  n: number;
  sign: "+" | "-";
  content: string;
}
interface DiffFile {
  kind: string;
  path: string;
  lines: DiffLine[];
}

const HEADER = /^([A-Za-z][A-Za-z-]*): (.+)$/;
const CHANGE = /^\s*(\d+) ([+-]) ?(.*)$/;

function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  for (const line of raw.split("\n")) {
    const change = CHANGE.exec(line);
    if (change && current) {
      current.lines.push({ n: Number(change[1]), sign: change[2] as "+" | "-", content: change[3] });
      continue;
    }
    const header = HEADER.exec(line);
    if (header) {
      current = { kind: header[1], path: header[2], lines: [] };
      files.push(current);
    }
  }
  return files;
}

export function DiffView({
  path,
  staged = false,
  revs,
}: {
  path?: string;
  staged?: boolean;
  /** Compare two revisions (pallet names or parcel hashes) instead of the working tree. */
  revs?: [string, string];
}) {
  const { wh, rev } = useApp();
  const { data, error, loading } = useLoad<string>(
    () => (revs ? fk.diffRevsText(wh, revs[0], revs[1], path) : fk.diffText(wh, path, staged)),
    [wh, rev, path, staged, revs?.[0], revs?.[1]],
  );

  const files = useMemo(() => (data ? parseDiff(data) : []), [data]);

  if (loading) return <Loading label="Computing diff…" />;
  if (error) return <DiffError error={error} />;
  if (files.length === 0) {
    return <Empty icon="≈" title={path ? "No changes in this file" : "Nothing to show"} />;
  }

  return (
    <div className="diff-scroll">
      {files.map((file) => (
        <div key={file.path}>
          <div className="diff-file-header">
            {file.kind}: {file.path}
          </div>
          {file.lines.map((line, i) => (
            <div key={i} className={`diff-line ${line.sign === "+" ? "add" : "del"}`}>
              <span className="ln">{line.n}</span>
              <span className="sign">{line.sign}</span>
              <span className="content">{line.content}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function DiffError({ error }: { error: ForkliftError }) {
  // A binary file or whole-file change has no line diff; treat that gently.
  return (
    <div style={{ padding: 12 }}>
      <ErrorBanner error={error} />
    </div>
  );
}
