import createFetchGate from "../index"
import { createSilentLogger } from "../src/logger"

const { proxy } = createFetchGate({
  base: "http://127.0.0.1:3001",
  logger: createSilentLogger(),
})

// Gateway server
const gatewayServer = Bun.serve({
  port: 3000,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname === "/api/users") {
      return proxy(req, "/users")
    }

    return new Response("Not Found", { status: 404 })
  },
})
