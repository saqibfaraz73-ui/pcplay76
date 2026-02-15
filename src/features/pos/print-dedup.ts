/**
 * Sub-device print deduplication guard.
 * Prevents the same print job from being sent/printed more than once,
 * even if the user taps "Print" multiple times or Main is slow/unreachable.
 */

const recentPrints = new Map<string, number>();
const DEDUP_WINDOW_MS = 15_000; // 15 seconds

/** Simple hash of print content */
function hashContent(data: string): string {
  let h = 0;
  const sample = data.slice(0, 300);
  for (let i = 0; i < sample.length; i++) {
    h = ((h << 5) - h + sample.charCodeAt(i)) | 0;
  }
  return `${h}_${data.length}`;
}

/**
 * Returns true if this print content was already processed recently.
 * If not, marks it as processed.
 */
export function isDuplicatePrint(content: string): boolean {
  const hash = hashContent(content);
  const now = Date.now();

  // Cleanup old entries
  for (const [k, t] of recentPrints) {
    if (now - t > DEDUP_WINDOW_MS * 2) recentPrints.delete(k);
  }

  if (recentPrints.has(hash) && now - recentPrints.get(hash)! < DEDUP_WINDOW_MS) {
    console.log("[PrintDedup] Duplicate print blocked (same content within 15s)");
    return true;
  }

  recentPrints.set(hash, now);
  return false;
}
