/** Deterministic PRNG utilities — reproducible synthetic data and simulator behavior. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRandom(seed: number): number {
  return mulberry32(seed)();
}

/** Pick a weighted key from a record of weights. */
export function weightedPick<T extends string>(
  weights: Record<T, number>,
  rand: number
): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let threshold = rand * total;
  for (const [key, weight] of entries) {
    threshold -= weight;
    if (threshold <= 0) return key;
  }
  return entries[entries.length - 1]![0];
}
