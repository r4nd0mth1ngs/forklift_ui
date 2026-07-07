// Shared plumbing: the app-wide context (current warehouse + refresh bus + toasts),
// a tiny data-loading hook, and small presentational helpers reused across panels.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ForkliftError, isForkliftError, OfficeState } from "./api";

// ---- App context ------------------------------------------------------------

export interface Toast {
  id: number;
  kind: "ok" | "error";
  title: string;
  body?: string;
}

export interface AppState {
  /** Absolute path of the open warehouse. */
  wh: string;
  /** Bumped whenever warehouse state changes; panels depend on it to reload. */
  rev: number;
  bump: () => void;
  notify: (kind: Toast["kind"], title: string, body?: string) => void;
  /** Run a mutating command: on success bump + toast; on failure toast the error. */
  run: (action: Promise<unknown>, okMessage?: string) => Promise<boolean>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApp used outside the provider");
  return value;
}

export function AppProvider(props: {
  wh: string;
  notify: AppState["notify"];
  children: ReactNode;
}) {
  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((n) => n + 1), []);

  const run = useCallback<AppState["run"]>(
    async (action, okMessage) => {
      try {
        await action;
        bump();
        if (okMessage) props.notify("ok", okMessage);
        return true;
      } catch (error) {
        const fe = asError(error);
        props.notify("error", errorTitle(fe), fe.next_step ?? fe.message);
        return false;
      }
    },
    [bump, props],
  );

  return <Ctx.Provider value={{ wh: props.wh, rev, bump, notify: props.notify, run }}>{props.children}</Ctx.Provider>;
}

// ---- Error helpers ----------------------------------------------------------

export function asError(error: unknown): ForkliftError {
  if (isForkliftError(error)) return error;
  return { code: "gui", message: String(error) };
}

function errorTitle(error: ForkliftError): string {
  if (error.code === "gui" || error.code === "error") return error.message.split("\n")[0].slice(0, 80);
  return error.code.replace(/_/g, " ");
}

// ---- Data loading hook ------------------------------------------------------

export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ForkliftError | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let live = true;
    setLoading(true);
    loaderRef.current()
      .then((value) => {
        if (!live) return;
        setData(value);
        setError(null);
      })
      .catch((err) => {
        if (!live) return;
        setError(asError(err));
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading };
}

// ---- Presentational bits ----------------------------------------------------

export interface Identity {
  class?: string;
  role?: string;
}
export type IdentityMap = Record<string, Identity>;

/** Map operator id → identity, from the office registry (history/hauls join on this). */
export function buildIdentityMap(office: OfficeState | null): IdentityMap {
  const map: IdentityMap = {};
  const users = (office?.users as any[] | undefined) ?? [];
  for (const user of users) {
    if (user?.identifier) map[user.identifier] = { class: user.class, role: user.role };
  }
  return map;
}

export function IdentityBadge({ cls }: { cls?: string }) {
  if (!cls) return null;
  const key = cls.toLowerCase();
  return <span className={`badge ${key}`}>{key}</span>;
}

export function ErrorBanner({ error }: { error: ForkliftError }) {
  return (
    <div className="error-banner">
      <div className="code">{error.code}</div>
      <div>{error.message}</div>
      {error.next_step && <div className="next">→ {error.next_step}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="center-load">
      <div className="spinner" />
      {label}
    </div>
  );
}

export function Empty({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div>{title}</div>
      {hint && <div style={{ fontSize: 12 }}>{hint}</div>}
    </div>
  );
}

export function shortHash(hash: string | null | undefined): string {
  return hash ? hash.slice(0, 10) : "—";
}

export function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}
