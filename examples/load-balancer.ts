#!/usr/bin/env bun

/**
 * Example: Load Balancer
 *
 * This example shows how to implement simple round-robin load balancing
 * across multiple backend services using fetch-gate.
 */

import createFetchGate from "../src/index"

// Backend services to load balance across
const backends = [
  "https://jsonplaceholder.typicode.com",
  "https://httpbin.org",
  "https://api.github.com",
]

let currentBackend = 0

// Create proxy instance with circuit breaker
const { proxy, getCircuitBreakerState } = createFetchGate({
  timeout: 5000,
  circuitBreaker: {
    failureThreshold: 2,
    resetTimeout: 10000,
    enabled: true,
  },
})

// Round-robin load balancer function
function getNextBackend(): string {
  const backend = backends[currentBackend]
  currentBackend = (currentBackend + 1) % backends.length
  return backend
}

// Start the load balancer server
const server = Bun.serve({
  port: 3001,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    console.log(`${req.method} ${url.pathname}`)

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          circuitBreaker: getCircuitBreakerState(),
          backends: backends.map((backend, index) => ({
            url: backend,
            active: index === currentBackend,
          })),
        }),
        {
          headers: { "content-type": "application/json" },
        },
      )
    }

    // Get next backend for load balancing
    const targetBackend = getNextBackend()

    // Proxy the request
    return proxy(req, url.pathname, {
      base: targetBackend,

      beforeRequest: async (req, opts) => {
        console.log(`→ Routing to: ${targetBackend}${url.pathname}`)
      },

      afterResponse: async (req, res, stream) => {
        console.log(`← Response from ${targetBackend}: ${res.status}`)
      },

      onError: async (req, error) => {
        console.error(`✗ Error from ${targetBackend}: ${error.message}`)
      },
    })
  },
})

console.log(`🔄 Load balancer running on http://localhost:${server.port}`)
console.log("")
console.log("Backend services:")
backends.forEach((backend, index) => {
  console.log(`  ${index + 1}. ${backend}`)
})
console.log("")
console.log("Try:")
console.log(`  curl http://localhost:${server.port}/health`)
console.log(`  curl http://localhost:${server.port}/users`)
console.log(`  curl http://localhost:${server.port}/get`)
