/**
 * API 错误重试机制模块
 * 
 * 功能：
 * 1. 指数退避重试策略
 * 2. 自动重试机制
 * 3. 熔断器模式
 */

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ENETUNREACH',
    'EPIPE',
    '503',
    '502',
    '429',
  ],
};

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenRequests: number;
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      resetTimeout: config.resetTimeout ?? 60000,
      halfOpenRequests: config.halfOpenRequests ?? 3,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttempt) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();

      if (this.state === CircuitState.HALF_OPEN) {
        this.successCount++;
        if (this.successCount >= this.config.halfOpenRequests) {
          this.state = CircuitState.CLOSED;
          this.failureCount = 0;
        }
      }

      return result;
    } catch (error) {
      this.failureCount++;

      if (this.state === CircuitState.HALF_OPEN) {
        this.state = CircuitState.OPEN;
        this.nextAttempt = Date.now() + this.config.resetTimeout;
      } else if (this.failureCount >= this.config.failureThreshold) {
        this.state = CircuitState.OPEN;
        this.nextAttempt = Date.now() + this.config.resetTimeout;
      }

      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = 0;
  }
}

export class RetryableError extends Error {
  constructor(
    message: string,
    public originalError?: Error,
    public retryCount: number = 0
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (error: Error, attempt: number) => void
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === finalConfig.maxRetries) {
        break;
      }

      const isRetryable = finalConfig.retryableErrors.some(
        err => lastError?.message?.includes(err) || lastError?.cause?.toString()?.includes(err)
      );

      if (!isRetryable) {
        throw lastError;
      }

      const delay = Math.min(
        finalConfig.initialDelay * Math.pow(finalConfig.backoffMultiplier, attempt),
        finalConfig.maxDelay
      );

      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new RetryableError(
    `Max retries (${finalConfig.maxRetries}) exceeded`,
    lastError,
    finalConfig.maxRetries
  );
}

export function createCircuitBreaker<T>(
  fn: () => Promise<T>,
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>
): () => Promise<T> {
  const breaker = new CircuitBreaker(circuitBreakerConfig);

  return async () => {
    return breaker.execute(fn);
  };
}

export class APIClientWithRetry {
  private circuitBreaker: CircuitBreaker;
  private retryConfig: Partial<RetryConfig>;

  constructor(
    retryConfig: Partial<RetryConfig> = {},
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {
    this.retryConfig = retryConfig;
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
  }

  async request<T>(fn: () => Promise<T>): Promise<T> {
    const wrappedFn = this.circuitBreaker.execute.bind(this.circuitBreaker);

    return withRetry(
      async () => wrappedFn(fn),
      this.retryConfig
    );
  }

  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  resetCircuit(): void {
    this.circuitBreaker.reset();
  }
}
