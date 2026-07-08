// Terminology / aliases. Forklift has a whole warehouse-themed vocabulary, each term with
// a documented git counterpart. This lets the user pick which vocabulary the UI speaks —
// a built-in preset or their own custom aliases — persisted in localStorage. Every
// user-facing domain label goes through `t(key)`; the dictionary below is the single
// source of truth. Adding another vocabulary (or a real human language) is just one more
// column here plus an entry in VOCABULARIES.

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/** Built-in preset ids. "custom" is special — it overlays user aliases on the forklift base. */
export type PresetId = "forklift" | "git" | "melo" | "brainrot";
export type Vocab = PresetId | "custom";

export const VOCABULARIES: { id: Vocab; label: string }[] = [
  { id: "forklift", label: "Forklift (native)" },
  { id: "git", label: "Git (familiar)" },
  { id: "melo", label: "Meló (magyar szleng)" },
  { id: "brainrot", label: "Brainrot 💀🔥" },
  { id: "custom", label: "Custom (your aliases)" },
];

export type TermDef = Record<PresetId, string>;

/** Every alias-able term. Keys are stable ids the UI references; values are the labels. */
export const TERMS = {
  // Nouns — singular
  warehouse: { forklift: "Warehouse", git: "Repository", melo: "Műhely", brainrot: "Rizzpository" },
  parcel: { forklift: "Parcel", git: "Commit", melo: "Papír", brainrot: "Canon Event" },
  pallet: { forklift: "Pallet", git: "Branch", melo: "Ág", brainrot: "Arc" },
  haul: { forklift: "Haul", git: "Pull request", melo: "Behegesztés", brainrot: "Collab" },
  tag: { forklift: "Tag", git: "Tag", melo: "Pecsét", brainrot: "Drop" },
  bay: { forklift: "Bay", git: "Worktree", melo: "Bódé", brainrot: "Side Quest" },
  inventory: { forklift: "Inventory", git: "Index", melo: "Raktárlista", brainrot: "On Deck" },

  // Nouns — plural / section & tab labels
  pallets: { forklift: "Pallets", git: "Branches", melo: "Ágak", brainrot: "Arcs" },
  hauls: { forklift: "Hauls", git: "Pull requests", melo: "Behegesztések", brainrot: "Collabs" },
  tags: { forklift: "Tags", git: "Tags", melo: "Pecsétek", brainrot: "Drops" },
  bays: { forklift: "Bays", git: "Worktrees", melo: "Bódék", brainrot: "Side Quests" },
  changes: { forklift: "Changes", git: "Changes", melo: "Változások", brainrot: "The Tea" },
  history: { forklift: "History", git: "Log", melo: "Napló", brainrot: "Lore" },
  blame: { forklift: "Blame", git: "Blame", melo: "Ki a ludas", brainrot: "Snitch" },
  conflicts: { forklift: "Conflicts", git: "Conflicts", melo: "Szopások", brainrot: "Beef" },
  manifest: { forklift: "Manifest", git: "Notes", melo: "Firkák", brainrot: "Receipts" },
  office: { forklift: "Office", git: "Trust & identity", melo: "Porta", brainrot: "The Circle" },
  parked: { forklift: "Parked", git: "Stashed", melo: "Eldugva", brainrot: "Benched" },

  // Verbs / actions
  stack: { forklift: "Stack", git: "Commit", melo: "Papíroz", brainrot: "Lock In" },
  load: { forklift: "Load", git: "Stage", melo: "Rádob", brainrot: "Cook Up" },
  unload: { forklift: "Unload", git: "Remove", melo: "Leszed", brainrot: "Yeet" },
  restore: { forklift: "Restore", git: "Restore", melo: "Visszabütyköl", brainrot: "Rewind" },
  discard: { forklift: "Discard", git: "Discard", melo: "Kukáz", brainrot: "Delete This" },
  consolidate: { forklift: "Consolidate", git: "Merge", melo: "Hegeszt", brainrot: "Link Up" },
  cherryPick: { forklift: "Cherry-pick", git: "Cherry-pick", melo: "Kiszemez", brainrot: "Snipe" },
  deliver: { forklift: "Deliver", git: "Squash-merge", melo: "Összetapos", brainrot: "Ship It" },
  shift: { forklift: "Shift", git: "Checkout", melo: "Átáll", brainrot: "Switch Up" },
  lift: { forklift: "Lift", git: "Push", melo: "Feltol", brainrot: "Send It" },
  lower: { forklift: "Lower", git: "Pull", melo: "Lehúz", brainrot: "Pull Up" },
  franchise: { forklift: "Franchise", git: "Clone", melo: "Másol", brainrot: "Copypasta" },
  park: { forklift: "Park", git: "Stash", melo: "Dugdos", brainrot: "Bench It" },
  undo: { forklift: "Undo", git: "Undo", melo: "Visszavon", brainrot: "Hell Nah" },
  audit: { forklift: "Audit", git: "Verify", melo: "Átvizsgál", brainrot: "Vibe Check" },
  prepare: { forklift: "Prepare", git: "Init", melo: "Kezd", brainrot: "Spawn" },
  stocktake: { forklift: "Stocktake", git: "Status", melo: "Miafasz", brainrot: "What's Good" },
} satisfies Record<string, TermDef>;

export type TermKey = keyof typeof TERMS;

const VOCAB_KEY = "forklift.vocab";
const CUSTOM_KEY = "forklift.customTerms";

export interface TermsState {
  vocab: Vocab;
  setVocab: (v: Vocab) => void;
  custom: Partial<Record<TermKey, string>>;
  setCustomTerm: (key: TermKey, value: string) => void;
  resetCustom: () => void;
  /** Translate a term key to its label under the current vocabulary. */
  t: (key: TermKey) => string;
}

const Ctx = createContext<TermsState | null>(null);

function loadVocab(): Vocab {
  const stored = localStorage.getItem(VOCAB_KEY) as Vocab | null;
  return VOCABULARIES.some((v) => v.id === stored) ? (stored as Vocab) : "forklift";
}
function loadCustom(): Partial<Record<TermKey, string>> {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function TermsProvider({ children }: { children: ReactNode }) {
  const [vocab, setVocabState] = useState<Vocab>(loadVocab);
  const [custom, setCustom] = useState<Partial<Record<TermKey, string>>>(loadCustom);

  const setVocab = useCallback((v: Vocab) => {
    setVocabState(v);
    localStorage.setItem(VOCAB_KEY, v);
  }, []);

  const setCustomTerm = useCallback((key: TermKey, value: string) => {
    setCustom((prev) => {
      const next = { ...prev };
      if (value.trim()) next[key] = value;
      else delete next[key];
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetCustom = useCallback(() => {
    setCustom({});
    localStorage.removeItem(CUSTOM_KEY);
  }, []);

  const t = useCallback(
    (key: TermKey): string => {
      const def = TERMS[key];
      if (!def) return key;
      if (vocab === "custom") return custom[key]?.trim() || def.forklift;
      return def[vocab];
    },
    [vocab, custom],
  );

  const value = useMemo<TermsState>(
    () => ({ vocab, setVocab, custom, setCustomTerm, resetCustom, t }),
    [vocab, setVocab, custom, setCustomTerm, resetCustom, t],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTerms(): TermsState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useTerms used outside TermsProvider");
  return value;
}

/** Convenience: just the translate function. */
export function useT(): (key: TermKey) => string {
  return useTerms().t;
}
