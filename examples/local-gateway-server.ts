#!/usr/bin/env bun

/**
 * Example: Local Gateway Server Performance Benchmark
 *
 * This example creates two servers:
 * 1. A backend service (port 3001) that simulates API endpoints
 * 2. A gateway service (port 3000) that proxies requests using fetch-proxy
 *
 * Use this to benchmark fetch-proxy performance against direct requests.
 */

import createFetchGate from "../src/index"

// Backend service that simulates a real API
const backendServer = Bun.serve({
  port: 3001,
  hostname: "localhost",

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const startTime = Date.now()

    // Simulate some processing time
    const delay = Math.random() * 10 + 5 // 5-15ms random delay

    await new Promise((resolve) => setTimeout(resolve, delay))

    // Different endpoints with varying response sizes
    switch (url.pathname) {
      case "/api/small":
        return new Response(
          JSON.stringify({
            id: 1,
            message: "Small response",
            timestamp: new Date().toISOString(),
            processingTime: Date.now() - startTime,
          }),
          {
            headers: { "content-type": "application/json" },
          },
        )

      case "/api/medium":
        const mediumData = {
          id: 2,
          message: "Medium response",
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          data: Array.from({ length: 100 }, (_, i) => ({
            index: i,
            value: `item-${i}`,
            random: Math.random(),
          })),
        }
        return new Response(JSON.stringify(mediumData), {
          headers: { "content-type": "application/json" },
        })

      case "/api/large":
        const largeData = {
          id: 3,
          message: "Large response",
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          data: Array.from({ length: 1000 }, (_, i) => ({
            index: i,
            value: `item-${i}`,
            description: `This is a description for item ${i}`,
            metadata: {
              created: new Date().toISOString(),
              tags: [`tag-${i % 10}`, `category-${i % 5}`],
              score: Math.random() * 100,
            },
          })),
        }
        return new Response(JSON.stringify(largeData), {
          headers: { "content-type": "application/json" },
        })

      case "/api/error":
        // Simulate server errors for circuit breaker testing
        if (Math.random() < 0.3) {
          return new Response("Internal Server Error", { status: 500 })
        }
        return new Response(
          JSON.stringify({
            message: "Error endpoint - sometimes fails",
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { "content-type": "application/json" },
          },
        )

      case "/api/slow":
        // Simulate slow endpoint
        await new Promise((resolve) => setTimeout(resolve, 100))
        return new Response(
          JSON.stringify({
            message: "Slow endpoint response",
            timestamp: new Date().toISOString(),
            processingTime: Date.now() - startTime,
          }),
          {
            headers: { "content-type": "application/json" },
          },
        )

      case "/api/health":
        return new Response(
          JSON.stringify({
            status: "healthy",
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { "content-type": "application/json" },
          },
        )

      default:
        return new Response(
          JSON.stringify({
            error: "Not Found",
            path: url.pathname,
            availableEndpoints: [
              "/api/small",
              "/api/medium",
              "/api/large",
              "/api/error",
              "/api/slow",
              "/api/health",
            ],
          }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          },
        )
    }
  },
})

// Create fetch-gate instance for the gateway
const { proxy, getCircuitBreakerState, getCircuitBreakerFailures } =
  createFetchGate({
    base: "http://localhost:3001",
    timeout: 5000,
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 10000,
      enabled: true,
    },
    headers: {
      "x-gateway": "fetch-gate-benchmark",
      "x-forwarded-by": "local-gateway",
    },
  })

// Performance tracking
let requestCount = 0
let totalLatency = 0
let errorCount = 0
const requestTimes: number[] = []

// Gateway server using fetch-gate
const gatewayServer = Bun.serve({
  port: 3000,
  hostname: "localhost",

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const startTime = Date.now()
    requestCount++

    console.log(`[${requestCount}] ${req.method} ${url.pathname}`)

    // Stats endpoint
    if (url.pathname === "/stats") {
      const avgLatency =
        requestTimes.length > 0
          ? requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length
          : 0

      return new Response(
        JSON.stringify(
          {
            gateway: {
              totalRequests: requestCount,
              errorCount,
              averageLatency: Math.round(avgLatency * 100) / 100,
              circuitBreakerState: getCircuitBreakerState(),
              circuitBreakerFailures: getCircuitBreakerFailures(),
            },
            recentLatencies: requestTimes.slice(-10),
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
        {
          headers: { "content-type": "application/json" },
        },
      )
    }

    // Benchmark endpoint - makes multiple concurrent requests
    if (url.pathname === "/benchmark") {
      const concurrency = parseInt(url.searchParams.get("concurrency") || "10")
      const iterations = parseInt(url.searchParams.get("iterations") || "100")
      const endpoint = url.searchParams.get("endpoint") || "/api/small"

      console.log(
        `Starting benchmark: ${iterations} requests with ${concurrency} concurrency to ${endpoint}`,
      )

      const benchmarkStart = Date.now()
      const promises: Promise<any>[] = []

      for (let i = 0; i < iterations; i++) {
        const promise = proxy(new Request(`http://localhost:3001${endpoint}`))
          .then((res) => ({ status: res.status, ok: res.ok }))
          .catch((err) => ({ error: err.message }))

        promises.push(promise)

        // Limit concurrency
        if (promises.length >= concurrency) {
          await Promise.all(promises.splice(0, concurrency))
        }
      }

      // Wait for remaining requests
      if (promises.length > 0) {
        await Promise.all(promises)
      }

      const benchmarkEnd = Date.now()
      const totalTime = benchmarkEnd - benchmarkStart

      return new Response(
        JSON.stringify(
          {
            benchmark: {
              endpoint,
              iterations,
              concurrency,
              totalTime,
              requestsPerSecond: Math.round((iterations / totalTime) * 1000),
              averageLatency: totalTime / iterations,
            },
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
        {
          headers: { "content-type": "application/json" },
        },
      )
    }

    // Reset stats
    if (url.pathname === "/reset") {
      requestCount = 0
      totalLatency = 0
      errorCount = 0
      requestTimes.length = 0
      return new Response(JSON.stringify({ message: "Stats reset" }), {
        headers: { "content-type": "application/json" },
      })
    }

    // Proxy all other requests to backend
    try {
      const response = await proxy(req, url.pathname + url.search, {
        beforeRequest: async (req: Request) => {
          // Add request tracking
          req.headers.set("x-request-id", crypto.randomUUID())
          req.headers.set("x-gateway-timestamp", Date.now().toString())
        },
        afterResponse: async (req: Request, res: Response) => {
          // Add response headers for tracking
          const requestTime = req.headers.get("x-gateway-timestamp")
          if (requestTime) {
            const latency = Date.now() - parseInt(requestTime)
            res.headers.set("x-gateway-latency", latency.toString())
          }
        },
      })

      // Track performance
      const latency = Date.now() - startTime
      requestTimes.push(latency)

      // Keep only last 1000 request times for memory efficiency
      if (requestTimes.length > 1000) {
        requestTimes.splice(0, requestTimes.length - 1000)
      }

      return response
    } catch (error) {
      errorCount++
      console.error(`Gateway error: ${error}`)

      return new Response(
        JSON.stringify({
          error: "Gateway Error",
          message: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        }),
        {
          status: 502,
          headers: { "content-type": "application/json" },
        },
      )
    }
  },
})

console.log(
  `🚀 Backend server running on http://localhost:${backendServer.port}`,
)
console.log(
  `🌐 Gateway server running on http://localhost:${gatewayServer.port}`,
)
console.log("")
console.log("Available endpoints:")
console.log("  GET /api/small        - Small JSON response")
console.log("  GET /api/medium       - Medium JSON response (~100 items)")
console.log("  GET /api/large        - Large JSON response (~1000 items)")
console.log("  GET /api/error        - Sometimes returns 500 errors")
console.log("  GET /api/slow         - Slow response (100ms delay)")
console.log("  GET /api/health       - Health check")
console.log("  GET /stats            - Performance statistics")
console.log("  GET /reset            - Reset performance statistics")
console.log("  GET /benchmark        - Run benchmark test")
console.log("")
console.log("Benchmark examples:")
console.log(
  "  curl 'http://localhost:3000/benchmark?iterations=100&concurrency=10&endpoint=/api/small'",
)
console.log(
  "  curl 'http://localhost:3000/benchmark?iterations=50&concurrency=5&endpoint=/api/medium'",
)
console.log(
  "  curl 'http://localhost:3000/benchmark?iterations=20&concurrency=3&endpoint=/api/large'",
)
console.log("")
console.log("Performance monitoring:")
console.log("  curl http://localhost:3000/stats")
console.log("  curl http://localhost:3000/api/small")
console.log("  curl http://localhost:3000/api/error")
console.log("")
console.log("Direct backend access (for comparison):")
console.log("  curl http://localhost:3001/api/small")
console.log("  curl http://localhost:3001/api/health")
