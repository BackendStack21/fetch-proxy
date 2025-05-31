# fetch-gate API Documentation

## Table of Contents

- [Core API](#core-api)
- [Configuration Options](#configuration-options)
- [Request Options](#request-options)
- [Hooks](#hooks)
- [Circuit Breaker](#circuit-breaker)
- [Error Handling](#error-handling)
- [TypeScript Types](#typescript-types)

## Core API

### `createFetchGate(options?)`

Creates a new fetch proxy instance with the specified configuration.

**Parameters:**

- `options?: ProxyOptions` - Configuration options for the proxy

**Returns:**

```typescript
{
  proxy: (req: Request, source?: string, opts?: ProxyRequestOptions) => Promise<Response>;
  close: () => void;
  getCircuitBreakerState: () => CircuitState;
  getCircuitBreakerFailures: () => number;
  clearURLCache: () => void;
}
```

### `proxy(req, source?, opts?)`

Proxies an HTTP request to the target server.

**Parameters:**

- `req: Request` - The incoming request object
- `source?: string` - Target URL or path (optional if base is set)
- `opts?: ProxyRequestOptions` - Per-request options

**Returns:**

- `Promise<Response>` - The proxy response

## Configuration Options

### `ProxyOptions`

```typescript
interface ProxyOptions {
  // Target Configuration
  base?: string // Base URL for requests
  timeout?: number // Request timeout in ms (default: 5000)
  cacheURLs?: number | boolean // URL cache size (default: 100)

  // Request Options
  headers?: Record<string, string> // Default headers
  queryString?: Record<string, any> | string // Default query parameters
  request?: RequestInit // Default fetch options

  // Redirect Handling
  redirect?: "follow" | "manual" // Redirect handling (default: "follow")
  maxRedirects?: number // Max redirects (default: 5)

  // Circuit Breaker
  circuitBreaker?: CircuitBreakerOptions

  // Global Hooks
  beforeRequest?: (
    req: Request,
    options: ProxyRequestOptions,
  ) => void | Promise<void>
  afterResponse?: (
    req: Request,
    res: Response,
    body?: ReadableStream | null,
  ) => void | Promise<void>
  beforeCircuitBreakerExecution?: (
    req: Request,
    options: ProxyRequestOptions,
  ) => void | Promise<void>
  afterCircuitBreakerExecution?: (
    req: Request,
    result: CircuitBreakerResult,
  ) => void | Promise<void>
  onError?: (req: Request, error: Error) => void | Promise<void>
}
```

### `CircuitBreakerOptions`

```typescript
interface CircuitBreakerOptions {
  failureThreshold?: number // Failures to open circuit (default: 5)
  resetTimeout?: number // Reset timeout in ms (default: 60000)
  timeout?: number // Circuit breaker timeout in ms (default: 5000)
  enabled?: boolean // Enable circuit breaker (default: true)
}
```

## Request Options

### `ProxyRequestOptions`

Per-request options that override global settings:

```typescript
interface ProxyRequestOptions {
  // Override global settings
  base?: string
  timeout?: number
  headers?: Record<string, string>
  queryString?: Record<string, any> | string
  request?: RequestInit

  // Per-request hooks
  beforeRequest?: (
    req: Request,
    options: ProxyRequestOptions,
  ) => void | Promise<void>
  afterResponse?: (
    req: Request,
    res: Response,
    body?: ReadableStream | null,
  ) => void | Promise<void>
  beforeCircuitBreakerExecution?: (
    req: Request,
    options: ProxyRequestOptions,
  ) => void | Promise<void>
  afterCircuitBreakerExecution?: (
    req: Request,
    result: CircuitBreakerResult,
  ) => void | Promise<void>
  onError?: (req: Request, error: Error) => void | Promise<void>
}
```

## Hooks

Hooks allow you to intercept and modify requests, responses, and handle errors. fetch-gate provides enhanced hook naming conventions with better semantics and circuit breaker lifecycle hooks.

### Enhanced Hooks with Circuit Breaker Monitoring

#### Before Request Hook

```typescript
beforeRequest?: (req: Request, options: ProxyRequestOptions) => void | Promise<void>
```

Called before the request is sent to the target server.

**Use cases:**

- Logging requests
- Adding authentication headers
- Request validation
- Metrics collection

#### After Response Hook

```typescript
afterResponse?: (req: Request, res: Response, body?: ReadableStream | null) => void | Promise<void>
```

Called after receiving a response from the target server.

**Use cases:**

- Response logging
- Metrics collection
- Response caching
- Custom response processing

#### Before Circuit Breaker Execution Hook

```typescript
beforeCircuitBreakerExecution?: (req: Request, options: ProxyRequestOptions) => void | Promise<void>
```

Called before the circuit breaker executes the request. Provides insight into circuit breaker lifecycle.

**Use cases:**

- Circuit breaker state monitoring
- Pre-execution logging
- Request tracking before potential circuit breaker intervention

#### After Circuit Breaker Execution Hook

```typescript
afterCircuitBreakerExecution?: (req: Request, result: CircuitBreakerResult) => void | Promise<void>
```

Called after the circuit breaker completes execution (success or failure).

**CircuitBreakerResult interface:**

```typescript
interface CircuitBreakerResult {
  success: boolean // Whether the execution was successful
  error?: Error // Error if execution failed
  state: CircuitState // Current circuit breaker state
  failureCount: number // Current failure count
  executionTimeMs: number // Execution time in milliseconds
}
```

**Use cases:**

- Performance monitoring
- Circuit breaker state tracking
- Execution time metrics
- Failure pattern analysis
- Alerting on circuit breaker state changes

#### Error Hook

```typescript
onError?: (req: Request, error: Error) => void | Promise<void>
```

Called when an error occurs during proxying.

**Use cases:**

- Error logging
- Fallback responses
- Metrics collection
- Custom error handling

### Hook Execution Order

When multiple hooks are configured, they execute in this order:

1. `beforeRequest`
2. `beforeCircuitBreakerExecution`
3. **Request execution through circuit breaker**
4. `afterResponse`
5. `afterCircuitBreakerExecution`
6. `onError` (only if an error occurs)

### Example Usage

```typescript
const response = await proxy(request, "/users", {
  beforeRequest: async (req, opts) => {
    console.log("Making request to:", req.url)
  },
  afterResponse: async (req, res, body) => {
    console.log("Received response:", res.status)
  },
  beforeCircuitBreakerExecution: async (req, opts) => {
    console.log("Circuit breaker executing request")
  },
  afterCircuitBreakerExecution: async (req, result) => {
    console.log("Circuit breaker completed:", {
      success: result.success,
      state: result.state,
      executionTime: result.executionTimeMs,
    })
  },
  onError: async (req, error) => {
    console.error("Request failed:", error.message)
  },
})
```

## Circuit Breaker

The circuit breaker helps prevent cascading failures by monitoring request success/failure rates.

### States

- **CLOSED**: Normal operation, requests are forwarded
- **OPEN**: Circuit is open, requests fail immediately with 503
- **HALF_OPEN**: Testing state, limited requests are allowed

### Configuration

```typescript
const { proxy } = createFetchProxy({
  circuitBreaker: {
    failureThreshold: 5, // Open after 5 failures
    resetTimeout: 60000, // Try to close after 60 seconds
    timeout: 5000, // Individual request timeout
    enabled: true, // Enable circuit breaker
  },
})
```

### Monitoring

```typescript
const { getCircuitBreakerState, getCircuitBreakerFailures } =
  createFetchProxy(options)

// Check current state
const state = getCircuitBreakerState() // "CLOSED" | "OPEN" | "HALF_OPEN"

// Check failure count
const failures = getCircuitBreakerFailures() // number
```

## Error Handling

### Automatic Error Responses

The library automatically generates appropriate HTTP error responses:

- **503 Service Unavailable**: When circuit breaker is open
- **504 Gateway Timeout**: When requests exceed timeout
- **502 Bad Gateway**: For other proxy errors

### Custom Error Handling

Use the `onError` hook for custom error handling:

```typescript
proxy(req, undefined, {
  onError: async (req, error) => {
    // Custom logging
    console.error(`Proxy error for ${req.url}:`, error.message)

    // Custom metrics
    if (error.message.includes("timeout")) {
      metrics.increment("proxy.timeouts")
    }

    // Custom fallback logic
    if (error.message.includes("ECONNREFUSED")) {
      // Handle connection refused
    }
  },
})
```

## TypeScript Types

### Core Types

```typescript
type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN"

interface ProxyInstance {
  proxy: (
    req: Request,
    source?: string,
    opts?: ProxyRequestOptions,
  ) => Promise<Response>
  close: () => void
  getCircuitBreakerState: () => CircuitState
  getCircuitBreakerFailures: () => number
  clearURLCache: () => void
}
```

### Header Transformation Types

```typescript
type HeaderTransformer = (
  headers: Record<string, string>,
) => Record<string, string>
type RequestHeaderTransformer = (
  req: Request,
  headers: Record<string, string>,
) => Record<string, string>
```

### Hook Types

#### Enhanced Hook Types

```typescript
// Enhanced request lifecycle hooks
type BeforeRequestHook = (
  req: Request,
  options: ProxyRequestOptions,
) => void | Promise<void>
type AfterResponseHook = (
  req: Request,
  res: Response,
  body?: ReadableStream | null,
) => void | Promise<void>

// Circuit breaker lifecycle hooks
type BeforeCircuitBreakerHook = (
  req: Request,
  options: ProxyRequestOptions,
) => void | Promise<void>
type AfterCircuitBreakerHook = (
  req: Request,
  result: CircuitBreakerResult,
) => void | Promise<void>

// Error handling hook
type ErrorHook = (req: Request, error: Error) => void | Promise<void>

// Circuit breaker result interface
interface CircuitBreakerResult {
  success: boolean
  error?: Error
  state: CircuitState
  failureCount: number
  executionTimeMs: number
}

// Header transformation types
type RequestHeadersTransformer = (
  req: Request,
  headers: Record<string, string>,
) => Record<string, string>
type ResponseHeadersTransformer = (
  headers: Record<string, string>,
) => Record<string, string>
```

## Examples

See the [examples directory](../examples/) for complete working examples:

- [Gateway Server](../examples/gateway-server.ts) - Basic proxy server
- [Load Balancer](../examples/load-balancer.ts) - Round-robin load balancing
- [Logging Example](../examples/logger-examples.ts) - Request/response logging
