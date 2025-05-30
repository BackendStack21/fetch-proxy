/**
 * Type definitions for fetch-proxy library
 */

export interface ProxyOptions {
  /** Base URL for all proxied requests */
  base?: string
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerOptions
  /** Number of URLs to cache (default: 100, set to 0 to disable) */
  cacheURLs?: number
  /** Custom headers to add to all requests */
  headers?: Record<string, string>
  /** Whether to follow redirects (default: false) */
  followRedirects?: boolean
  /** Maximum number of redirects to follow (default: 5) */
  maxRedirects?: number
}

export interface CircuitBreakerOptions {
  /** Failure threshold to open circuit (default: 5) */
  failureThreshold?: number
  /** Reset timeout in milliseconds (default: 60000) */
  resetTimeout?: number
  /** Request timeout for circuit breaker (default: 5000) */
  timeout?: number
  /** Enable circuit breaker (default: true) */
  enabled?: boolean
}

export interface ProxyRequestOptions {
  /** Override base URL for this request */
  base?: string
  /** Override timeout for this request */
  timeout?: number
  /** Additional headers for this request */
  headers?: Record<string, string>
  /** Query string parameters to append */
  queryString?: Record<string, any> | string
  /** Custom request options */
  request?: RequestInit

  // Lifecycle hooks
  /** Hook called before the request is sent to the target server */
  beforeRequest?: BeforeRequestHook
  /** Hook called after a successful response is received */
  afterResponse?: AfterResponseHook
  /** Hook called when an error occurs during the request */
  onError?: ErrorHook
  /** Hook called before the circuit breaker executes the request */
  beforeCircuitBreakerExecution?: BeforeCircuitBreakerHook
  /** Hook called after the circuit breaker completes (success or failure) */
  afterCircuitBreakerExecution?: AfterCircuitBreakerHook
}

// Enhanced Hook Types
export type BeforeRequestHook = (
  req: Request,
  options: ProxyRequestOptions,
) => void | Promise<void>

export type AfterResponseHook = (
  req: Request,
  res: Response,
  body?: ReadableStream | null,
) => void | Promise<void>

export type BeforeCircuitBreakerHook = (
  req: Request,
  options: ProxyRequestOptions,
) => void | Promise<void>

export type AfterCircuitBreakerHook = (
  req: Request,
  result: CircuitBreakerResult,
) => void | Promise<void>

export type ErrorHook = (req: Request, error: Error) => void | Promise<void>

// Circuit breaker result information
export interface CircuitBreakerResult {
  success: boolean
  error?: Error
  state: CircuitState
  failureCount: number
  executionTimeMs: number
}

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}
