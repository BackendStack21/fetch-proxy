/**
 * fetch-proxy - A fetch-based HTTP proxy library optimized for Bun runtime
 *
 * Main entry point for the library
 */

export { default, FetchProxy } from "./src/index.ts"
export type {
  ProxyOptions,
  CircuitBreakerOptions,
  ProxyRequestOptions,
  BeforeRequestHook,
  AfterResponseHook,
  ErrorHook,
} from "./src/index.ts"
