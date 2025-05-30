#!/usr/bin/env bun

import createFetchProxy from "../src/index"

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

// Create proxy
const { proxy } = createFetchProxy({
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

console.log(`Backend server running on http://localhost:${backendServer.port}`)
console.log(`Gateway server running on http://localhost:${gatewayServer.port}`)
console.log(`Try: curl http://localhost:3000/api/users`)
