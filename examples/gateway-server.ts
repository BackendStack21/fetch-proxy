#!/usr/bin/env bun

/**
 * Example: Simple Gateway Server
 *
 * This example shows how to create a simple API gateway using fetch-gate
 * that routes requests to different backend services.
 */

import createFetchGate from "../src/index"

// Create proxy instances for different services
const { proxy: usersProxy } = createFetchGate({
  base: "https://jsonplaceholder.typicode.com",
  timeout: 5000,
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeout: 30000,
    enabled: true,
  },
  headers: {
    "x-gateway": "fetch-gate-example",
  },
})

const { proxy: postsProxy } = createFetchGate({
  base: "https://jsonplaceholder.typicode.com",
  timeout: 5000,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 60000,
  },
})

// Start the gateway server
const server = Bun.serve({
  port: 3000,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    console.log(`${req.method} ${url.pathname}`)

    // Route to users service
    if (url.pathname.startsWith("/api/users")) {
      const targetPath = url.pathname.replace("/api", "")

      return usersProxy(req, targetPath, {
        beforeRequest: async (req: Request, opts: any) => {
          console.log(
            `→ Proxying to users service: ${req.method} ${targetPath}`,
          )
        },

        afterResponse: async (req: Request, res: Response, stream: any) => {
          console.log(`← Users service responded: ${res.status}`)
        },

        onError: async (req: Request, error: Error) => {
          console.error(`✗ Users service error: ${error.message}`)
        },
      })
    }

    // Route to posts service
    if (url.pathname.startsWith("/api/posts")) {
      const targetPath = url.pathname.replace("/api", "")

      return postsProxy(req, targetPath, {
        queryString: {
          _limit: "10", // Limit results
          ...Object.fromEntries(url.searchParams),
        },

        beforeRequest: async (req: Request, opts: any) => {
          console.log(
            `→ Proxying to posts service: ${req.method} ${targetPath}`,
          )
        },

        afterResponse: async (req: Request, res: Response, stream: any) => {
          console.log(`← Posts service responded: ${res.status}`)
        },

        onError: async (req: Request, error: Error) => {
          console.error(`✗ Posts service error: ${error.message}`)
        },
      })
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
          version: "1.0.0",
        }),
        {
          headers: { "content-type": "application/json" },
        },
      )
    }

    // Default 404 response
    return new Response(
      JSON.stringify({
        error: "Not Found",
        message: `Route ${url.pathname} not found`,
        availableRoutes: ["/api/users", "/api/posts", "/health"],
      }),
      {
        status: 404,
        headers: { "content-type": "application/json" },
      },
    )
  },
})

console.log(`🚀 Gateway server running on http://localhost:${server.port}`)
console.log("")
console.log("Available endpoints:")
console.log("  GET /health           - Health check")
console.log("  GET /api/users        - List users")
console.log("  GET /api/users/:id    - Get user by ID")
console.log("  GET /api/posts        - List posts")
console.log("  GET /api/posts/:id    - Get post by ID")
console.log("")
console.log("Try:")
console.log("  curl http://localhost:3000/health")
console.log("  curl http://localhost:3000/api/users")
console.log("  curl http://localhost:3000/api/posts?_limit=5")
