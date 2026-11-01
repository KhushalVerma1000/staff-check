/**
 * Circuit breaker for one store endpoint (Postgres shard, Mongo cluster,
 * Cloudinary account). After `threshold` consecutive failures it opens: calls
 * fail fast with BreakerOpenError until `cooldownMs` passes, then one trial
 * call is let through (half-open). A success closes it again.
 */
export class BreakerOpenError extends Error {
  constructor(public readonly name_: string) {
    super(`${name_} is unavailable (circuit open).`);
    this.name = 'BreakerOpenError';
  }
}

export type BreakerState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private trialInFlight = false;

  constructor(
    readonly name: string,
    private readonly opts: { threshold?: number; cooldownMs?: number; now?: () => number } = {},
  ) {}

  private get threshold() {
    return this.opts.threshold ?? 3;
  }
  private get cooldownMs() {
    return this.opts.cooldownMs ?? 10_000;
  }
  private now() {
    return (this.opts.now ?? Date.now)();
  }

  get state(): BreakerState {
    if (this.openedAt === null) return 'closed';
    return this.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open';
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.state;
    if (state === 'open' || (state === 'half-open' && this.trialInFlight)) throw new BreakerOpenError(this.name);
    if (state === 'half-open') this.trialInFlight = true;
    try {
      const result = await fn();
      this.failures = 0;
      this.openedAt = null;
      return result;
    } catch (e) {
      this.failures++;
      if (state === 'half-open' || this.failures >= this.threshold) this.openedAt = this.now();
      throw e;
    } finally {
      this.trialInFlight = false;
    }
  }
}
