"use client";

// ============================================================
// SECTION: Visual-viewport tracking (keyboard-aware layout)
// ------------------------------------------------------------
// iOS Safari never shrinks dvh/vh for the on-screen keyboard (and
// ignores interactiveWidget), so layouts can't see it. This hook
// publishes two things on <html>, updated live:
//   --vvh          the visible height in px (dialogs size to it)
//   data-kbd=open  keyboard up: a text field is focused AND the
//                  visible height dropped well below the tallest
//                  height seen in this orientation (works whether
//                  the browser resizes the layout or overlays it)
// Consumers: the `kbd-open:` variant (globals.css) and Dialog.
// ============================================================

const TEXT_INPUT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]';

export function startViewportTracking(): () => void {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let tallest = 0;
  let orientation = screen.orientation?.type ?? String(window.innerWidth > window.innerHeight);

  const update = () => {
    const current = screen.orientation?.type ?? String(window.innerWidth > window.innerHeight);
    if (current !== orientation) {
      orientation = current;
      tallest = 0;
    }
    const height = viewport?.height ?? window.innerHeight;
    tallest = Math.max(tallest, height, window.innerHeight);
    root.style.setProperty("--vvh", `${Math.round(height)}px`);

    const typing = document.activeElement?.matches(TEXT_INPUT) ?? false;
    if (typing && height < tallest * 0.75) root.dataset.kbd = "open";
    else delete root.dataset.kbd;
  };

  update();
  viewport?.addEventListener("resize", update);
  window.addEventListener("resize", update);
  document.addEventListener("focusin", update);
  // Blur happens before the keyboard finishes closing; re-check after.
  const onFocusOut = () => setTimeout(update, 250);
  document.addEventListener("focusout", onFocusOut);

  return () => {
    viewport?.removeEventListener("resize", update);
    window.removeEventListener("resize", update);
    document.removeEventListener("focusin", update);
    document.removeEventListener("focusout", onFocusOut);
  };
}
