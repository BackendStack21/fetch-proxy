// Backend server
const backendServer = Bun.serve({
  port: 3001,

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
