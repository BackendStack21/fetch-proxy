#!/usr/bin/env bun

import createFetchGate from "../src/index"

// Backend upload server
const backendServer = Bun.serve({
  port: 3001,
  hostname: "localhost",

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    // Handle file uploads to /upload endpoint
    if (url.pathname === "/upload" && req.method === "POST") {
      try {
        const contentType = req.headers.get("content-type") || ""

        if (contentType.includes("multipart/form-data")) {
          // Handle multipart form data
          const formData = await req.formData()
          const entry = formData.get("file")
          if (!entry || !(entry instanceof File)) {
            return new Response(
              JSON.stringify({ error: "No file provided or invalid file" }),
              {
                status: 400,
                headers: { "content-type": "application/json" },
              },
            )
          }
          const file = entry

          // Simulate file processing
          const fileInfo = {
            name: file.name,
            size: file.size,
            type: file.type,
            uploadedAt: new Date().toISOString(),
            id: crypto.randomUUID(),
          }

          return new Response(
            JSON.stringify({
              message: "File uploaded successfully",
              file: fileInfo,
            }),
            {
              status: 201,
              headers: { "content-type": "application/json" },
            },
          )
        } else if (
          contentType.includes("application/octet-stream") ||
          contentType.includes("text/")
        ) {
          // Handle raw file upload
          const body = await req.arrayBuffer()
          const filename = req.headers.get("x-filename") || "unknown"

          const fileInfo = {
            name: filename,
            size: body.byteLength,
            type: contentType,
            uploadedAt: new Date().toISOString(),
            id: crypto.randomUUID(),
          }

          return new Response(
            JSON.stringify({
              message: "Raw file uploaded successfully",
              file: fileInfo,
            }),
            {
              status: 201,
              headers: { "content-type": "application/json" },
            },
          )
        } else {
          return new Response(
            JSON.stringify({ error: "Unsupported content type" }),
            {
              status: 400,
              headers: { "content-type": "application/json" },
            },
          )
        }
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: "Upload failed",
            message: error instanceof Error ? error.message : "Unknown error",
          }),
          {
            status: 500,
            headers: { "content-type": "application/json" },
          },
        )
      }
    }

    return new Response("Not Found", { status: 404 })
  },
})

// Create proxy
const { proxy } = createFetchGate({
  base: "http://localhost:3001",
})

// Gateway upload proxy server
const gatewayServer = Bun.serve({
  port: 3000,
  hostname: "localhost",

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    // Proxy file uploads from /api/upload to backend /upload
    if (url.pathname === "/api/upload" && req.method === "POST") {
      return proxy(req, "/upload", {
        beforeRequest: async (req: Request) => {
          // Add upload tracking headers
          req.headers.set("x-upload-id", crypto.randomUUID())
          req.headers.set("x-gateway-timestamp", Date.now().toString())
          console.log(`📤 Upload request: ${req.headers.get("content-type")}`)
        },
        afterResponse: async (req: Request, res: Response) => {
          const uploadId = req.headers.get("x-upload-id")
          console.log(`✅ Upload completed: ${res.status} (ID: ${uploadId})`)
        },
        onError: async (req: Request, error: Error) => {
          console.error(`❌ Upload failed: ${error.message}`)
        },
      })
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "upload-proxy",
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "content-type": "application/json" },
        },
      )
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(
  `Backend upload server running on http://localhost:${backendServer.port}`,
)
console.log(
  `Gateway upload proxy running on http://localhost:${gatewayServer.port}`,
)
console.log("")
console.log("Upload examples:")
console.log("  # Multipart form upload:")
console.log("  curl -F 'file=@package.json' http://localhost:3000/api/upload")
console.log("")
console.log("  # Raw file upload:")
console.log(
  "  curl -X POST -H 'Content-Type: text/plain' -H 'X-Filename: test.txt' --data 'Hello World' http://localhost:3000/api/upload",
)
console.log("")
console.log("  # Health check:")
console.log("  curl http://localhost:3000/health")
