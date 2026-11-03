/** Older WebViews expose only addListener; missing change events must not abort boot. */
export function onMediaChange(query: MediaQueryList, change: () => void): void {
  if (typeof query.addEventListener === 'function') query.addEventListener('change', change);
  else if (typeof query.addListener === 'function') query.addListener(change);
}
