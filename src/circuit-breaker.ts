/**
 * Circuit breaker implementation for handling service failures
 */

import { type CircuitBreakerOptions, CircuitState } from "./types"

export class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private state = CircuitState.CLOSED
  private options: Required<CircuitBreakerOptions>

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeout: options.resetTimeout ?? 60000,
      timeout: options.timeout ?? 5000,
      enabled: options.enabled ?? true,
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.options.enabled) {
      return fn()
    }

    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime

      if (timeSinceLastFailure > this.options.resetTimeout) {
        this.state = CircuitState.HALF_OPEN
      } else {
        throw new Error("Circuit breaker is OPEN")
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Circuit breaker timeout")),
            this.options.timeout,
          ),
        ),
      ])

      if (this.state === CircuitState.HALF_OPEN) {
        this.reset()
      }

      return result
    } catch (error) {
      this.recordFailure()
      throw error
    }
  }

  private recordFailure(): void {
    this.failures++
    if (this.state !== CircuitState.OPEN) {
      this.lastFailureTime = Date.now()
    }

    if (this.failures >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN
    }
  }

  private reset(): void {
    this.failures = 0
    this.state = CircuitState.CLOSED
  }

  getState(): CircuitState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime
      if (timeSinceLastFailure > this.options.resetTimeout) {
        this.state = CircuitState.HALF_OPEN
      }
    }

    return this.state
  }

  getFailures(): number {
    return this.failures
  }
}
