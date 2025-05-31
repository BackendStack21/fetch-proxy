/**
 * fetch-gate - A fetch-based HTTP proxy library optimized for Bun runtime
 *
 * Development entry point - re-exports from src for examples and testing
 * Production builds should use the transpiled lib/ version
 */

export { default, FetchProxy } from "./src/index.ts"
export type {
  ProxyOptions,
  CircuitBreakerOptions,
  ProxyRequestOptions,
  BeforeRequestHook,
  AfterResponseHook,
  BeforeCircuitBreakerHook,
  AfterCircuitBreakerHook,
  ErrorHook,
  CircuitState,
  CircuitBreakerResult,
} from "./src/index.ts"
