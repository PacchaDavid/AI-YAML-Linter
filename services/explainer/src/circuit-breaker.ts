type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerOptions {
  maxFailures: number;
  resetTimeoutMs: number;
  timeoutMs: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  maxFailures: parseInt(process.env.CIRCUIT_BREAKER_MAX_FAILURES || '3', 10),
  resetTimeoutMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '10000', 10),
  timeoutMs: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '5000', 10),
};

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private readonly options: CircuitBreakerOptions;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  getState(): CircuitState {
    return this.state;
  }

  async call<T>(fn: () => Promise<T>, fallback: () => T): Promise<T> {
    if (this.state === 'open') {
      const now = Date.now();
      if (this.lastFailureTime && (now - this.lastFailureTime) >= this.options.resetTimeoutMs) {
        console.log('[CircuitBreaker] Moving to half-open state');
        this.state = 'half-open';
      } else {
        console.log('[CircuitBreaker] Circuit is OPEN, using fallback');
        return fallback();
      }
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      console.log(`[CircuitBreaker] Call failed:`, err instanceof Error ? err.message : err);
      return fallback();
    }
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), this.options.timeoutMs)
      ),
    ]);
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      console.log('[CircuitBreaker] Half-open call succeeded, resetting circuit');
    }
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.maxFailures) {
      console.log(`[CircuitBreaker] Opening circuit after ${this.failureCount} failures`);
      this.state = 'open';
    }
  }
}
