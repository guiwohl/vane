import type { SeriesRing } from "../types";

export const FIRST_INTERVAL_MS = 15_000;
export const MAX_BUCKETS = 240;
const INTERVAL_GROWTH = 2;

export type SeriesSample = {
  at: number;
  startedAt: number;
  tokens?: number | undefined;
  cost?: number | undefined;
  turns?: number | undefined;
};

export const larger = (a: number, b: number): number => Math.max(a, b);
export const sum = (a: number, b: number): number => a + b;

export function emptyRing(): SeriesRing {
  return {
    startedAt: 0,
    origin: null,
    intervalMs: FIRST_INTERVAL_MS,
    tokens: [],
    cost: [],
    turns: [],
  };
}

export function clearedRing(ring: SeriesRing): SeriesRing {
  return { ...emptyRing(), startedAt: ring.startedAt };
}

export function recordSample(ring: SeriesRing, sample: SeriesSample): SeriesRing {
  const isSameSession = ring.origin !== null && ring.startedAt === sample.startedAt;
  const base = isSameSession
    ? ring
    : { ...emptyRing(), startedAt: sample.startedAt, origin: sample.at };
  const fitted = fitInterval(base, sample.at);
  const index = bucketIndex(fitted, sample.at);
  const length = index + 1;
  return {
    ...fitted,
    tokens: withLevel(fitted.tokens, length, index, sample.tokens),
    cost: withLevel(fitted.cost, length, index, sample.cost),
    turns: withCount(fitted.turns, length, index, sample.turns ?? 0),
  };
}

function bucketIndex(ring: SeriesRing, at: number): number {
  return Math.max(0, Math.floor((at - (ring.origin ?? at)) / ring.intervalMs));
}

function fitInterval(ring: SeriesRing, at: number): SeriesRing {
  return bucketIndex(ring, at) < MAX_BUCKETS ? ring : fitInterval(doubled(ring), at);
}

function doubled(ring: SeriesRing): SeriesRing {
  return {
    ...ring,
    intervalMs: ring.intervalMs * INTERVAL_GROWTH,
    tokens: foldPairs(ring.tokens, larger),
    cost: foldPairs(ring.cost, larger),
    turns: foldPairs(ring.turns, sum),
  };
}

function foldPairs(values: number[], join: (a: number, b: number) => number): number[] {
  return Array.from({ length: Math.ceil(values.length / INTERVAL_GROWTH) }, (_, pair) => {
    const first = values[pair * INTERVAL_GROWTH] ?? 0;
    const second = values[pair * INTERVAL_GROWTH + 1];
    return second === undefined ? first : join(first, second);
  });
}

function withLevel(
  levels: number[],
  length: number,
  index: number,
  sampled: number | undefined,
): number[] {
  const carried = levels.at(-1) ?? 0;
  return Array.from({ length }, (_, i) => {
    const existing = levels[i];
    if (i !== index || sampled === undefined) return existing ?? carried;
    return existing === undefined ? sampled : larger(existing, sampled);
  });
}

function withCount(counts: number[], length: number, index: number, added: number): number[] {
  const grown = Array.from({ length }, (_, i) => counts[i] ?? 0);
  return grown.map((count, i) => (i === index ? count + added : count));
}
