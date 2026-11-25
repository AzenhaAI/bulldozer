/**
 * Run a widget's set-up only when it comes near the screen. /explore/ built
 * all eight of its charts on load, each fetching and drawing data nobody had
 * scrolled to; on mid phones that was a run of long tasks that every tap had
 * to wait behind (Clarity, 15–21 Nov 2026: INP 7.8 s). A hash link to a
 * widget (#bubble…) scrolls it into view, which starts it the same way.
 *
 * `anchor` is any element inside the widget (its JSON config script works:
 * the observer watches its parent, since a script element has no box).
 */
export function whenVisible(anchor: Element | null, init: () => void, margin = '600px 0px'): void {
  const target = anchor?.parentElement ?? null;
  if (!target || !('IntersectionObserver' in window)) { init(); return; }
  let done = false;
  const io = new IntersectionObserver((entries) => {
    if (done || !entries.some((e) => e.isIntersecting)) return;
    done = true;
    io.disconnect();
    init();
  }, { rootMargin: margin });
  io.observe(target);
}
