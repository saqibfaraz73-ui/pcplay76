export function makeId(prefix: string) {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? (crypto as any).randomUUID() : Math.random().toString(16).slice(2);
  return `${prefix}_${rand}_${Date.now().toString(16)}`;
}
