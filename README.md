# fetch-gate

A modern, fetch-based HTTP proxy library optimized for Bun runtime with advanced features like hooks, circuit breakers, and comprehensive security protections.

## Features

- 🚀 **Bun Optimized**: Built specifically for Bun runtime with modern fetch API
- 🔄 **Circuit Breaker**: Automatic failure detection and recovery
- ⏰ **Timeouts**: Configurable request and circuit breaker timeouts
- 🪝 **Enhanced Hooks**: Descriptive lifecycle hooks with circuit breaker monitoring
- 🗄️ **URL Caching**: LRU-based URL caching for performance
- 📦 **TypeScript**: Full TypeScript support with comprehensive types
- 🔀 **Redirect Control**: Manual redirect handling support
- 🛡️ **Security Hardened**: Protection against SSRF, injection attacks, path traversal, and more
- 📝 **Comprehensive Logging**: Structured logging with Pino for monitoring and debugging
- ✅ **Comprehensive Testing**: High test coverage with Bun's test runner
- 📈 **Performance Optimized**: Designed for high throughput and low latency

## Installation

```bash
bun add fetch-gate
```

## Quick Start

### Basic Usage

```typescript
import createFetchGate from "fetch-gate"

// Create proxy instance
const { proxy } = createFetchGate({
  base: "https://api.example.com",
})

// Use with Bun's HTTP server
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    // Proxy all requests to the base URL
    return proxy(req)
  },
})

console.log("Proxy server running on http://localhost:3000")
```

### Proxy Pattern

Backend server can be proxied through a gateway:

```typescript
// Backend server
const backendServer = Bun.serve({
  port: 3001,
  hostname: "localhost",

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname === "/users") {
      return new Response(JSON.stringify([]), {
        headers: { "content-type": "application/json" },
      })
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(`Backend server running on http://localhost:${backendServer.port}`)
```

Gateway server that proxies requests to the backend:

```typescript
import createFetchGate from "fetch-gate"

// Create proxy
const { proxy } = createFetchGate({
  base: "http://localhost:3001",
})

// Gateway server
const gatewayServer = Bun.serve({
  port: 3000,
  hostname: "localhost",

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname === "/api/users") {
      return proxy(req, "/users")
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(`Gateway server running on http://localhost:${gatewayServer.port}`)
console.log(`Try: curl http://localhost:3000/api/users`)
```

## API Reference

### createFetchGate(options?)

Creates a new proxy instance with the specified options.

#### Options

```typescript
interface ProxyOptions {
  base?: string // Base URL for all requests
  timeout?: number // Request timeout (default: 30000ms)
  circuitBreaker?: CircuitBreakerOptions
  cacheURLs?: number // URL cache size (default: 100, 0 to disable)
  headers?: Record<string, string> // Default headers
  logger?: Logger // Pino logger instance for comprehensive logging
  followRedirects?: boolean // Follow redirects (default: false)
  maxRedirects?: number // Max redirects (default: 5)
}

interface CircuitBreakerOptions {
  failureThreshold?: number // Failures to open circuit (default: 5)
  resetTimeout?: number // Reset timeout (default: 60000ms)
  timeout?: number // Circuit breaker timeout (default: 5000ms)
  enabled?: boolean // Enable circuit breaker (default: true)
}

interface CircuitBreakerResult {
  success: boolean // Whether the circuit breaker execution was successful
  error?: Error // Error object if execution failed
  state: CircuitState // Current circuit breaker state
  failureCount: number // Current failure count
  executionTimeMs: number // Execution time in milliseconds
}
```

#### Returns

```typescript
{
  proxy: (req: Request, source?: string, opts?: ProxyRequestOptions) => Promise<Response>;
  close: () => void;
  getCircuitBreakerState: () => CircuitState;
  getCircuitBreakerFailures: () => number;
  clearURLCache: () => void;
}
```

### proxy(req, source?, opts?)

Proxies an HTTP request to the target server.

#### Parameters

- `req: Request` - The incoming request object
- `source?: string` - Target URL or path (optional if base is set)
- `opts?: ProxyRequestOptions` - Per-request options

```typescript
interface ProxyRequestOptions {
  base?: string // Override base URL
  timeout?: number // Override timeout
  headers?: Record<string, string> // Additional headers
  queryString?: Record<string, any> | string // Query parameters
  request?: RequestInit // Custom fetch options
  logger?: Logger // Override proxy logger for this request

  // Lifecycle Hooks
  beforeRequest?: (
    req: Request,
    opts: ProxyRequestOptions,
  ) => void | Promise<void>
  afterResponse?: (
    req: Request,
    res: Response,
    body?: ReadableStream | null,
  ) => void | Promise<void>
  onError?: (req: Request, error: Error) => void | Promise<void>
  beforeCircuitBreakerExecution?: (
    req: Request,
    opts: ProxyRequestOptions,
  ) => void | Promise<void>
  afterCircuitBreakerExecution?: (
    req: Request,
    result: CircuitBreakerResult,
  ) => void | Promise<void>
}
```

## Logging

fetch-gate includes comprehensive logging capabilities using [Pino](https://github.com/pinojs/pino), providing structured logging for request lifecycle, security events, performance metrics, and circuit breaker operations.

### Basic Logging Setup

```typescript
import createFetchGate from "fetch-gate"
import pino from "pino"

// Use default logger (automatically configured)
const { proxy } = createFetchGate({
  base: "https://api.example.com",
  // Default logger is created automatically
})

// Or provide custom logger
const logger = pino({
  level: "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true },
  },
})

const { proxy: customProxy } = createFetchGate({
  base: "https://api.example.com",
  logger: logger,
})
```

### Production Logging

```typescript
const productionLogger = pino({
  level: "warn",
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
    log: (object) => ({
      ...object,
      service: "fetch-gate",
      environment: "production",
    }),
  },
  redact: ["authorization", "cookie", "password"],
  transport: {
    target: "pino/file",
    options: { destination: "./logs/proxy.log" },
  },
})

const { proxy } = createFetchGate({
  base: "https://api.example.com",
  logger: productionLogger,
})
```

### Request-Specific Logging

```typescript
// Override proxy logger for specific requests
const response = await proxy(request, undefined, {
  logger: customRequestLogger,
  headers: { "X-Debug": "true" },
})
```

### Log Events

The library logs various structured events:

- **Request Lifecycle**: Start, success, error, timeout events
- **Security Events**: Protocol validation, injection attempts, SSRF prevention
- **Circuit Breaker**: State changes, error thresholds, recovery events
- **Performance**: Response times, cache hits/misses, timing metrics
- **Cache Operations**: URL cache hits, misses, and evictions

Example log output:

```json
{
  "level": 30,
  "time": "2025-05-31T12:00:00.000Z",
  "event": "request_start",
  "requestId": "req-abc123",
  "method": "GET",
  "url": "https://api.example.com/users"
}

{
  "level": 40,
  "time": "2025-05-31T12:00:01.000Z",
  "event": "security_header_validation",
  "requestId": "req-abc123",
  "message": "Header validation failed",
  "headerName": "X-Custom",
  "issue": "CRLF injection attempt"
}
```

For detailed logging configuration examples, see the [Logging Guide](./docs/logging.md).

## Advanced Examples

### With Hooks

```typescript
const { proxy } = createFetchGate({
  base: "https://api.example.com",
})

Bun.serve({
  async fetch(req) {
    return proxy(req, undefined, {
      beforeRequest: async (req, opts) => {
        console.log(`Proxying ${req.method} ${req.url}`)
      },

      afterResponse: async (req, res, body) => {
        console.log(`Response: ${res.status} ${res.statusText}`)
      },

      onError: async (req, error) => {
        console.error(`Proxy error for ${req.url}:`, error.message)
      },
    })
  },
})
```

### Enhanced Hooks with Circuit Breaker Monitoring

The enhanced hook naming conventions provide more descriptive and semantically meaningful hook names:

```typescript
const { proxy } = createFetchGate({
  base: "https://api.example.com",
})

Bun.serve({
  async fetch(req) {
    return proxy(req, undefined, {
      // 🆕 Enhanced naming - more descriptive than onRequest
      beforeRequest: async (req, opts) => {
        console.log(`🔄 Starting request: ${req.method} ${req.url}`)
        console.log(`Request timeout: ${opts.timeout}ms`)
      },

      // 🆕 Enhanced naming - more descriptive than onResponse
      afterResponse: async (req, res, body) => {
        console.log(`✅ Request completed: ${res.status} ${res.statusText}`)
      },

      // 🆕 New circuit breaker lifecycle hooks
      beforeCircuitBreakerExecution: async (req, opts) => {
        console.log(`⚡ Circuit breaker executing request`)
      },

      afterCircuitBreakerExecution: async (req, result) => {
        const { success, state, failureCount, executionTimeMs } = result
        console.log(`⚡ Circuit breaker result:`, {
          success,
          state,
          failureCount,
          executionTime: `${executionTimeMs}ms`,
        })

        if (state === "OPEN") {
          console.warn(`🚨 Circuit breaker is OPEN!`)
        }
      },

      onError: async (req, error) => {
        console.error(`💥 Request failed: ${error.message}`)
      },
    })
  },
})
```

### Hook Execution Order

The hooks are executed in a specific order to provide predictable lifecycle management:

1. **`beforeRequest`** - Called before the request is sent to the target server
2. **`beforeCircuitBreakerExecution`** - Called before the circuit breaker executes the request
3. **Circuit Breaker Execution** - The actual fetch request is executed within the circuit breaker
4. **`afterResponse`** - Called after a successful response is received (only on success)
5. **`afterCircuitBreakerExecution`** - Called after the circuit breaker completes (success or failure)
6. **`onError`** - Called if any error occurs during the request lifecycle

```typescript
const { proxy } = createFetchGate({
  base: "https://api.example.com",
})

const executionOrder: string[] = []

await proxy(req, undefined, {
  beforeRequest: async () => {
    executionOrder.push("beforeRequest") // 1st
  },
  beforeCircuitBreakerExecution: async () => {
    executionOrder.push("beforeCircuitBreaker") // 2nd
  },
  afterResponse: async () => {
    executionOrder.push("afterResponse") // 3rd (success only)
  },
  afterCircuitBreakerExecution: async () => {
    executionOrder.push("afterCircuitBreaker") // 4th
  },
  onError: async () => {
    executionOrder.push("onError") // Called on any error
  },
})

// Result: ["beforeRequest", "beforeCircuitBreaker", "afterResponse", "afterCircuitBreaker"]
```

### Header Manipulation with Hooks

```typescript
const { proxy } = createFetchGate({
  base: "https://api.example.com",
})

Bun.serve({
  async fetch(req) {
    return proxy(req, undefined, {
      beforeRequest: async (req, opts) => {
        // Add authentication header
        req.headers.set("authorization", "Bearer " + process.env.API_TOKEN)

        // Remove sensitive headers
        req.headers.delete("x-internal-key")

        // Add custom headers via opts.headers
        if (!opts.headers) opts.headers = {}
        opts.headers["x-proxy-timestamp"] = new Date().toISOString()
      },

      afterResponse: async (req, res, body) => {
        // Modify response headers (create new response with modified headers)
        const headers = new Headers(res.headers)

        // Add CORS headers
        headers.set("access-control-allow-origin", "*")
        headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE")

        // Remove server information
        headers.delete("server")
        headers.delete("x-powered-by")

        // Replace the response with modified headers
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: headers,
        })
      },
    })
  },
})
```

### Circuit Breaker Monitoring

```typescript
const { proxy, getCircuitBreakerState, getCircuitBreakerFailures } =
  createFetchGate({
    base: "https://api.example.com",
    circuitBreaker: {
      failureThreshold: 3,
      resetTimeout: 30000,
    },
  })

// Monitor circuit breaker status
setInterval(() => {
  const state = getCircuitBreakerState()
  const failures = getCircuitBreakerFailures()
  console.log(`Circuit breaker: ${state}, failures: ${failures}`)
}, 5000)

Bun.serve({
  async fetch(req) {
    const response = await proxy(req)

    // Add circuit breaker status to response headers
    response.headers.set("x-circuit-breaker", getCircuitBreakerState())

    return response
  },
})
```

### Load Balancing

```typescript
const services = [
  "https://api1.example.com",
  "https://api2.example.com",
  "https://api3.example.com",
]

let currentIndex = 0

const { proxy } = createFetchGate({
  timeout: 5000,
  circuitBreaker: { enabled: true },
})

Bun.serve({
  async fetch(req) {
    // Simple round-robin load balancing
    const targetBase = services[currentIndex]
    currentIndex = (currentIndex + 1) % services.length

    return proxy(req, undefined, {
      base: targetBase,
      onError: async (req, error) => {
        console.log(`Failed request to ${targetBase}: ${error.message}`)
      },
    })
  },
})
```

## Error Handling

The library automatically handles common error scenarios:

- **503 Service Unavailable**: When circuit breaker is open
- **504 Gateway Timeout**: When requests exceed timeout
- **502 Bad Gateway**: For other proxy errors

You can customize error handling using the `onError` hook:

```typescript
proxy(req, undefined, {
  onError: async (req, error) => {
    // Log error
    console.error("Proxy error:", error)

    // Custom metrics
    metrics.increment("proxy.errors", {
      error_type: error.message.includes("timeout") ? "timeout" : "other",
    })
  },
})
```

## Performance Tips

1. **URL Caching**: Keep `cacheURLs` enabled (default 100) for better performance
2. **Circuit Breaker**: Tune thresholds based on your service characteristics
3. **Timeouts**: Set appropriate timeouts for your use case
4. **Connection Reuse**: Bun's fetch automatically handles connection pooling

## License

MIT

## Development

### Getting Started

To install dependencies:

```bash
bun install
```

To run tests:

```bash
bun test
```

To run examples:

```bash
# Debug example
bun run example:debug

# Gateway server example
bun run example:gateway

# Load balancer example
bun run example:loadbalancer

# Performance benchmark example
bun run example:benchmark
```

To build the library:

```bash
bun run build
```

### Testing

The library includes comprehensive tests covering all major functionality:

- Proxy operations
- Circuit breaker behavior
- Error handling
- Header transformations
- Timeout scenarios
- Security protections and attack prevention

Run the test suite with:

```bash
bun test
```

Run tests with coverage:

```bash
bun test --coverage
```

## Security

This library includes comprehensive security protections against common web vulnerabilities:

- **SSRF Protection**: Protocol validation and domain restrictions
- **Header Injection Prevention**: CRLF injection and response splitting protection
- **Query String Injection Protection**: Parameter validation and encoding safety
- **Path Traversal Prevention**: Secure path normalization utilities
- **HTTP Method Validation**: Whitelist-based method validation
- **DoS Prevention Guidelines**: Resource exhaustion protection recommendations

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

