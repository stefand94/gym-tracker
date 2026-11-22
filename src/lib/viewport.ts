/**
 * iOS Safari keeps the layout viewport full height while the keyboard is up (`dvh` doesn't shrink), so sheets with a
 * text field would slide under the keyboard and the page would pan. This mirrors the visible area into CSS:
 * `--vvh` (its height), `--vv-top` (how far iOS has panned) and `html.kb-open` while a keyboard covers the bottom.
 */
export function trackVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let frame = 0;
  const apply = () => {
    frame = 0;
    root.style.setProperty('--vvh', `${vv.height}px`);
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    // pinch-zoom also shrinks the visual viewport; only a keyboard shrinks it at scale 1
    root.classList.toggle('kb-open', vv.scale < 1.05 && window.innerHeight - vv.height > 120);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  apply();
}
