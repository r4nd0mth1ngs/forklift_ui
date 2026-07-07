// A draggable vertical divider that resizes the flex pane immediately before it. Drop it
// between two flex children (e.g. a list and its detail pane, or the sidebar and the main
// area). It resizes its previous sibling by setting `flex-basis` directly and persists the
// width under `storageKey`, reapplying it on mount. Pointer capture keeps the drag smooth
// even when the cursor outruns the handle.

import { useEffect, useRef } from "react";

export function PaneDivider({
  storageKey,
  min = 220,
  max = 760,
}: {
  storageKey: string;
  min?: number;
  max?: number;
}) {
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; w: number; el: HTMLElement } | null>(null);

  const prevPane = () => handle.current?.previousElementSibling as HTMLElement | null;

  // Reapply the persisted width to the pane on mount.
  useEffect(() => {
    const el = prevPane();
    const saved = Number(localStorage.getItem(storageKey));
    if (el && saved >= min && saved <= max) el.style.flex = `0 0 ${saved}px`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = prevPane();
    if (!el) return;
    drag.current = { x: e.clientX, w: el.getBoundingClientRect().width, el };
    handle.current?.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const next = Math.min(max, Math.max(min, drag.current.w + (e.clientX - drag.current.x)));
    drag.current.el.style.flex = `0 0 ${next}px`;
  };

  const end = () => {
    if (!drag.current) return;
    const width = Math.round(drag.current.el.getBoundingClientRect().width);
    localStorage.setItem(storageKey, String(width));
    drag.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  return (
    <div
      ref={handle}
      className="pane-divider"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => {
        const el = prevPane();
        if (el) el.style.flex = "";
        localStorage.removeItem(storageKey);
      }}
      title="Drag to resize · double-click to reset"
    />
  );
}
