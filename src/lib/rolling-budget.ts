export type RollingBudget = {
  tryTake: () => boolean;
  remaining: () => number;
};

export function createRollingBudget(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
): RollingBudget {
  const stamps: number[] = [];

  const prune = (t: number) => {
    let drop = 0;
    while (drop < stamps.length && t - (stamps[drop] ?? 0) >= windowMs) drop++;
    if (drop > 0) stamps.splice(0, drop);
  };

  return {
    tryTake() {
      const t = now();
      prune(t);
      if (stamps.length >= limit) return false;
      stamps.push(t);
      return true;
    },
    remaining() {
      prune(now());
      return Math.max(0, limit - stamps.length);
    },
  };
}

/** Per-instance cap on outbound TCGdex requests triggered by public, unauthenticated server functions. */
export const tcgdexOutboundBudget = createRollingBudget(120, 60_000);
