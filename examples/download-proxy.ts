#!/usr/bin/env bun

import createFetchProxy from "../src/index"

// Backend file server
const backendServer = Bun.serve({
  port: 3001,
  hostname: "localhost",

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    // Serve static files from /files path
    if (url.pathname.startsWith("/files/")) {
      const filename = url.pathname.replace("/files/", "")

      // Simulate different file types
      switch (filename) {
        case "document.txt":
          return new Response("This is a text document content.", {
            headers: { "content-type": "text/plain" },
          })

        case "data.json":
          return new Response(
            JSON.stringify({ message: "JSON file content", data: [1, 2, 3] }),
            {
              headers: { "content-type": "application/json" },
            },
          )

        case "style.css":
          return new Response("body { margin: 0; padding: 20px; }", {
            headers: { "content-type": "text/css" },
          })

        case "image.txt":
          // Simulate binary content as text for demo
          return new Response("Binary image data would be here...", {
            headers: { "content-type": "image/png" },
          })

        default:
          return new Response("File not found", { status: 404 })
      }
    }

    return new Response("Not Found", { status: 404 })
  },
})

// Create proxy
const { proxy } = createFetchProxy({
  base: "http://localhost:3001",
})

// Gateway file proxy server
const gatewayServer = Bun.serve({
  port: 3000,
  hostname: "localhost",

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    // Proxy file requests from /api/files/* to backend /files/*
    if (url.pathname.startsWith("/api/files/")) {
      const backendPath = url.pathname.replace("/api/files/", "/files/")
      return proxy(req, backendPath)
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(
  `Backend file server running on http://localhost:${backendServer.port}`,
)
console.log(
  `Gateway file proxy running on http://localhost:${gatewayServer.port}`,
)
console.log("")
console.log("Available files:")
console.log("  curl http://localhost:3000/api/files/document.txt")
console.log("  curl http://localhost:3000/api/files/data.json")
console.log("  curl http://localhost:3000/api/files/style.css")
console.log("  curl http://localhost:3000/api/files/image.txt")
