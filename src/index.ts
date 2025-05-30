/**
 * fetch-proxy - A modern HTTP proxy library optimized for Bun runtime
 *
 * Features:
 * - Circuit breaker pattern for fault tolerance
 * - Request/response hooks for custom logic
 * - URL caching for performance
 * - Header rewriting capabilities
 * - Timeout handling
 * - TypeScript support
 */

import { FetchProxy } from "./proxy"
import type {
  ProxyOptions,
  ProxyRequestOptions,
  CircuitBreakerOptions,
  BeforeRequestHook,
  AfterResponseHook,
  BeforeCircuitBreakerHook,
  AfterCircuitBreakerHook,
  ErrorHook,
  CircuitState,
  CircuitBreakerResult,
} from "./types"

// Re-export types
export type {
  ProxyOptions,
  ProxyRequestOptions,
  CircuitBreakerOptions,
  BeforeRequestHook,
  AfterResponseHook,
  BeforeCircuitBreakerHook,
  AfterCircuitBreakerHook,
  ErrorHook,
  CircuitState,
  CircuitBreakerResult,
}

// Re-export main class
export { FetchProxy }

/**
 * Factory function to create a new fetch proxy instance
 */
export default function createFetchProxy(options: ProxyOptions = {}): {
  proxy: (
    req: Request,
    source?: string,
    opts?: ProxyRequestOptions,
  ) => Promise<Response>
  close: () => void
  getCircuitBreakerState: () => CircuitState
  getCircuitBreakerFailures: () => number
  clearURLCache: () => void
} {
  const proxyInstance = new FetchProxy(options)

  return {
    proxy: (req: Request, source?: string, opts?: ProxyRequestOptions) =>
      proxyInstance.proxy(req, source, opts),
    close: () => proxyInstance.close(),
    getCircuitBreakerState: () => proxyInstance.getCircuitBreakerState(),
    getCircuitBreakerFailures: () => proxyInstance.getCircuitBreakerFailures(),
    clearURLCache: () => proxyInstance.clearURLCache(),
  }
}

// Export for CommonJS compatibility
export { createFetchProxy as fastProxy }
