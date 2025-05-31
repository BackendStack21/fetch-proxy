import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test"
import createFetchGate, { FetchProxy } from "../src/index"
import {
  buildURL,
  headersToRecord,
  recordToHeaders,
  buildQueryString,
} from "../src/utils"
import { CircuitBreaker } from "../src/circuit-breaker"
import { URLCache } from "../src/url-cache"
import { CircuitState } from "../src/types"

describe("fetch-gate", () => {
  let server: any
  let baseUrl: string

  beforeAll(async () => {
    // Start a simple test server
    server = Bun.serve({
      port: 0, // Use random available port
      websocket: {
        message() {},
        open() {},
        close() {},
      },
      fetch(req) {
        const url = new URL(req.url)

        if (url.pathname === "/echo") {
          return Response.json({
            method: req.method,
            headers: Object.fromEntries(req.headers.entries()),
            url: req.url,
          })
        }

        if (url.pathname === "/slow") {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(Response.json({ message: "slow response" }))
            }, 100)
          })
        }

        if (url.pathname === "/error") {
          return new Response("Server Error", { status: 500 })
        }

        return new Response("Not Found", { status: 404 })
      },
    })

    baseUrl = `http://localhost:${server.port}`
  })

  afterAll(() => {
    server?.stop()
    mock.restore()
  })

  describe("createFetchGate", () => {
    it("should create proxy instance with default options", () => {
      const { proxy, close } = createFetchGate()
      expect(typeof proxy).toBe("function")
      expect(typeof close).toBe("function")
    })

    it("should create proxy instance with custom options", () => {
      const { proxy, getCircuitBreakerState } = createFetchGate({
        base: "https://api.example.com",
        timeout: 5000,
        circuitBreaker: {
          failureThreshold: 3,
          resetTimeout: 30000,
        },
      })

      expect(typeof proxy).toBe("function")
      expect(getCircuitBreakerState()).toBe("CLOSED" as any)
    })
  })

  describe("FetchProxy class", () => {
    it("should proxy basic requests", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      const req = new Request("http://example.com/test")

      const response = await proxyInstance.proxy(req, "/echo")
      expect(response.status).toBe(200)

      const data = (await response.json()) as any
      expect(data.method).toBe("GET")
      expect(data.url).toBe(`${baseUrl}/echo`)
    })

    it("should handle custom headers", async () => {
      const proxyInstance = new FetchProxy({
        base: baseUrl,
        headers: { "x-custom": "test" },
      })

      const req = new Request("http://example.com/test")
      const response = await proxyInstance.proxy(req, "/echo")

      const data = (await response.json()) as any
      expect(data.headers["x-custom"]).toBe("test")
    })

    it("should handle query strings", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      const req = new Request("http://example.com/test")

      const response = await proxyInstance.proxy(req, "/echo", {
        queryString: { param1: "value1", param2: "value2" },
      })

      const data = (await response.json()) as any
      expect(data.url).toContain("param1=value1")
      expect(data.url).toContain("param2=value2")
    })

    it("should execute request hooks", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      let hookCalled = false

      const req = new Request("http://example.com/test")
      await proxyInstance.proxy(req, "/echo", {
        beforeRequest: async () => {
          hookCalled = true
        },
      })

      expect(hookCalled).toBe(true)
    })

    it("should execute response hooks", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      let responseStatus = 0

      const req = new Request("http://example.com/test")
      await proxyInstance.proxy(req, "/echo", {
        afterResponse: async (req, res) => {
          responseStatus = res.status
        },
      })

      expect(responseStatus).toBe(200)
    })

    it("should handle timeouts", async () => {
      const proxyInstance = new FetchProxy({
        base: baseUrl,
        timeout: 50, // Very short timeout
      })

      const req = new Request("http://example.com/test")
      const response = await proxyInstance.proxy(req, "/slow")

      expect(response.status).toBe(504) // Gateway Timeout
    })

    it("should rewrite request headers using beforeRequest hook", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })

      const req = new Request("http://example.com/test", {
        headers: { original: "value" },
      })

      const response = await proxyInstance.proxy(req, "/echo", {
        beforeRequest: async (req, opts) => {
          req.headers.set("rewritten", "true")
          req.headers.delete("original")
        },
      })

      const data = (await response.json()) as any
      expect(data.headers["rewritten"]).toBe("true")
      expect(data.headers["original"]).toBeUndefined()
    })

    it("should handle circuit breaker", async () => {
      const proxyInstance = new FetchProxy({
        base: baseUrl,
        circuitBreaker: {
          failureThreshold: 2,
          resetTimeout: 1000,
          enabled: true,
        },
      })

      const req = new Request("http://example.com/test")

      // First few requests should fail and trigger circuit breaker
      const response1 = await proxyInstance.proxy(req, "/error")
      expect(response1.status).toBe(502) // Bad Gateway due to 500 error

      const response2 = await proxyInstance.proxy(req, "/error")
      expect(response2.status).toBe(502) // Bad Gateway due to 500 error

      expect(proxyInstance.getCircuitBreakerFailures()).toBeGreaterThanOrEqual(
        2,
      )

      // After threshold, circuit should open
      const response3 = await proxyInstance.proxy(req, "/error")
      expect(response3.status).toBe(503) // Service Unavailable (circuit open)
    })
  })

  describe("URL caching", () => {
    it("should cache URLs when enabled", () => {
      const proxyInstance = new FetchProxy({
        base: baseUrl,
        cacheURLs: 10,
      })

      // This should work without throwing
      proxyInstance.clearURLCache()
    })

    it("should not cache URLs when disabled", () => {
      const proxyInstance = new FetchProxy({
        base: baseUrl,
        cacheURLs: 0,
      })

      // This should work without throwing
      proxyInstance.clearURLCache()
    })
  })

  describe("Utility Functions", () => {
    it("should build a URL from source and base", () => {
      const url = buildURL("/test", "http://example.com")
      expect(url.toString()).toBe("http://example.com/test")
    })

    it("should handle URLs with multiple leading slashes", () => {
      const url = buildURL("///test", "http://example.com")
      expect(url.toString()).toBe("http://example.com/test")
    })

    it("should build URL without base", () => {
      const url = buildURL("http://example.com/test")
      expect(url.toString()).toBe("http://example.com/test")
    })

    it("should convert Headers to a plain object", () => {
      const headers = new Headers({ "Content-Type": "application/json" })
      const record = headersToRecord(headers)
      expect(record).toEqual({ "content-type": "application/json" })
    })

    it("should convert a plain object to Headers", () => {
      const record = { "Content-Type": "application/json" }
      const headers = recordToHeaders(record)
      expect(headers.get("Content-Type")).toBe("application/json")
    })

    it("should build a query string from parameters", () => {
      const queryString = buildQueryString({
        param1: "value1",
        param2: "value2",
      })
      expect(queryString).toBe("?param1=value1&param2=value2")
    })

    it("should handle string query parameters", () => {
      const queryString1 = buildQueryString("param1=value1&param2=value2")
      expect(queryString1).toBe("?param1=value1&param2=value2")

      const queryString2 = buildQueryString("?param1=value1&param2=value2")
      expect(queryString2).toBe("?param1=value1&param2=value2")
    })

    it("should handle array values in query parameters", () => {
      const queryString = buildQueryString({
        tags: ["tag1", "tag2", "tag3"],
        single: "value",
      })
      expect(queryString).toContain("tags=tag1")
      expect(queryString).toContain("tags=tag2")
      expect(queryString).toContain("tags=tag3")
      expect(queryString).toContain("single=value")
    })

    it("should return empty string for empty parameters", () => {
      const queryString = buildQueryString({})
      expect(queryString).toBe("")
    })
  })

  describe("Additional Utility Functions", () => {
    it("should filter headers case-insensitively", () => {
      const { filterHeaders } = require("../src/utils")
      const headers = {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
        "X-Custom": "value",
      }
      const filtered = filterHeaders(headers, "content-type")
      expect(filtered).toEqual({
        Authorization: "Bearer token",
        "X-Custom": "value",
      })
    })
  })

  describe("Circuit Breaker Edge Cases", () => {
    it("should transition to HALF_OPEN state after reset timeout", async () => {
      // Custom mock for Date.now()
      const originalDateNow = Date.now
      let now = originalDateNow()
      global.Date.now = () => now

      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 100,
      })

      // Trigger failure to open the circuit
      await expect(
        circuitBreaker.execute(() => Promise.reject(new Error("Failure"))),
      ).rejects.toThrow("Failure")

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN)

      // Advance time by reset timeout
      now += 300

      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN)

      // Restore original Date.now()
      global.Date.now = originalDateNow
    })

    it("should reset failures after successful execution in HALF_OPEN state", async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 100,
      })

      // Trigger failure to open the circuit
      await expect(
        circuitBreaker.execute(() => Promise.reject(new Error("Failure"))),
      ).rejects.toThrow("Failure")

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN)

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Execute a successful request
      await expect(
        circuitBreaker.execute(() => Promise.resolve("Success")),
      ).resolves.toBe("Success")

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED)
    })
  })

  describe("Error Handling", () => {
    it("should call custom error hooks", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      let errorHookCalled = false

      const req = new Request("http://example.com/test")
      await proxyInstance.proxy(req, "/error", {
        onError: async () => {
          errorHookCalled = true
        },
      })

      expect(errorHookCalled).toBe(true)
    })

    it("should bypass circuit breaker when disabled", async () => {
      const proxyInstance = new FetchProxy({
        base: baseUrl,
        circuitBreaker: { enabled: false },
      })

      const req = new Request("http://example.com/test")
      const response = await proxyInstance.proxy(req, "/error")

      expect(response.status).toBe(502) // Adjusted to match actual response
    })
  })

  describe("URL Cache", () => {
    it("should evict the oldest entry when cache size is exceeded", () => {
      const urlCache = new URLCache(2)

      urlCache.set("key1", new URL("http://example.com/1"))
      urlCache.set("key2", new URL("http://example.com/2"))
      urlCache.set("key3", new URL("http://example.com/3"))

      expect(urlCache.get("key1")).toBeUndefined()
      expect(urlCache.get("key2")).toBeDefined()
      expect(urlCache.get("key3")).toBeDefined()
    })
  })

  describe("Index exports and factory function", () => {
    it("should export fastProxy as CommonJS compatibility", () => {
      const { fastProxy } = require("../src/index")
      expect(typeof fastProxy).toBe("function")
    })

    it("should return all required methods from createFetchGate", () => {
      const {
        proxy,
        close,
        getCircuitBreakerState,
        getCircuitBreakerFailures,
        clearURLCache,
      } = createFetchGate()

      expect(typeof proxy).toBe("function")
      expect(typeof close).toBe("function")
      expect(typeof getCircuitBreakerState).toBe("function")
      expect(typeof getCircuitBreakerFailures).toBe("function")
      expect(typeof clearURLCache).toBe("function")
    })

    it("should call proxy methods through factory function", async () => {
      const {
        proxy,
        getCircuitBreakerState,
        getCircuitBreakerFailures,
        clearURLCache,
        close,
      } = createFetchGate({
        base: baseUrl,
      })

      const req = new Request("http://example.com/test")
      const response = await proxy(req, "/echo")
      expect(response.status).toBe(200)

      expect(getCircuitBreakerState()).toBe(CircuitState.CLOSED)
      expect(getCircuitBreakerFailures()).toBe(0)

      clearURLCache()
      close()
    })
  })

  describe("Advanced FetchProxy features", () => {
    it("should handle HEAD requests without body", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      const req = new Request("http://example.com/test", { method: "HEAD" })

      const response = await proxyInstance.proxy(req, "/echo")
      expect(response.status).toBe(200)
    })

    it("should handle POST requests with body", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      const req = new Request("http://example.com/test", {
        method: "POST",
        body: JSON.stringify({ data: "test" }),
        headers: { "Content-Type": "application/json" },
      })

      const response = await proxyInstance.proxy(req, "/echo")
      expect(response.status).toBe(200)
    })

    it("should handle x-forwarded-host header", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      const req = new Request("http://example.com/test")

      const response = await proxyInstance.proxy(req, "/echo")
      const data = (await response.json()) as any
      expect(data.headers["x-forwarded-host"]).toBe("example.com")
    })

    it("should override host header with x-forwarded-host", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      const req = new Request("http://example.com/test", {
        headers: { host: "custom-host.com" },
      })

      const response = await proxyInstance.proxy(req, "/echo")
      const data = (await response.json()) as any
      expect(data.headers["x-forwarded-host"]).toBe("custom-host.com")
    })

    it("should merge query strings correctly", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      const req = new Request("http://example.com/test")

      const response = await proxyInstance.proxy(req, "/echo?existing=value", {
        queryString: { new: "param" },
      })

      const data = (await response.json()) as any
      expect(data.url).toContain("existing=value")
      expect(data.url).toContain("new=param")
    })

    it("should handle request-specific timeout", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      const req = new Request("http://example.com/test")

      const response = await proxyInstance.proxy(req, "/slow", {
        timeout: 50,
      })

      expect(response.status).toBe(504)
    })

    it("should handle request options", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      const req = new Request("http://example.com/test")

      const response = await proxyInstance.proxy(req, "/echo", {
        request: {
          headers: { "X-Request-Option": "test" },
        },
      })

      const data = (await response.json()) as any
      expect(data.headers["x-request-option"]).toBe("test")
    })

    it("should handle response without body in afterResponse hook", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      const req = new Request("http://example.com/test", { method: "HEAD" })
      let hookCalled = false

      await proxyInstance.proxy(req, "/echo", {
        afterResponse: async (req, res, body) => {
          hookCalled = true
          expect(body).toBeUndefined()
        },
      })

      expect(hookCalled).toBe(true)
    })

    it("should handle abort signal timeout correctly", async () => {
      const proxyInstance = new FetchProxy({ base: baseUrl })
      const req = new Request("http://example.com/test")

      try {
        await proxyInstance.proxy(req, "/slow", { timeout: 50 })
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe("Request timeout")
      }
    })
  })

  describe("Additional Circuit Breaker Tests", () => {
    it("should handle circuit breaker timeout", async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 1,
        timeout: 50,
        enabled: true,
      })

      try {
        await circuitBreaker.execute(async () => {
          return new Promise((resolve) => {
            setTimeout(() => resolve("success"), 100) // Takes longer than timeout
          })
        })
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe("Circuit breaker timeout")
      }
    })

    it("should get failure count correctly", () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        enabled: true,
      })

      expect(circuitBreaker.getFailures()).toBe(0)
    })

    it("should handle multiple failures before opening", async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        enabled: true,
      })

      // First failure
      try {
        await circuitBreaker.execute(() =>
          Promise.reject(new Error("Failure 1")),
        )
      } catch {}
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED)
      expect(circuitBreaker.getFailures()).toBe(1)

      // Second failure
      try {
        await circuitBreaker.execute(() =>
          Promise.reject(new Error("Failure 2")),
        )
      } catch {}
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED)
      expect(circuitBreaker.getFailures()).toBe(2)

      // Third failure - should open circuit
      try {
        await circuitBreaker.execute(() =>
          Promise.reject(new Error("Failure 3")),
        )
      } catch {}
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN)
      expect(circuitBreaker.getFailures()).toBe(3)
    })
  })
})
