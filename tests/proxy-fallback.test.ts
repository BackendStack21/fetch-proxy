/**
 * Tests for proxy fallback response using onError hook
 */

import {
  describe,
  expect,
  it,
  beforeEach,
  jest,
  afterAll,
  spyOn,
} from "bun:test"
import { FetchProxy } from "../src/proxy"

// Spy on fetch for testing
let fetchSpy: ReturnType<typeof spyOn>

afterAll(() => {
  fetchSpy?.mockRestore()
})

describe("Proxy Fallback Response", () => {
  let proxy: FetchProxy

  beforeEach(() => {
    proxy = new FetchProxy({
      base: "https://api.example.com",
      timeout: 5000,
    })
    fetchSpy = spyOn(global, "fetch")
    fetchSpy.mockClear()
  })

  describe("onError Hook Fallback", () => {
    it("should return fallback response when onError hook provides one", async () => {
      // Mock a network error
      fetchSpy.mockRejectedValue(new Error("Network error"))

      const fallbackResponse = new Response(
        JSON.stringify({
          message: "Service temporarily unavailable",
          fallback: true,
        }),
        {
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-type": "application/json" }),
        },
      )

      const onErrorHook = jest.fn().mockResolvedValue(fallbackResponse)

      const request = new Request("https://example.com/test")
      const response = await proxy.proxy(request, "/api/data", {
        onError: onErrorHook,
      })

      expect(onErrorHook).toHaveBeenCalledWith(
        expect.any(Request),
        expect.any(Error),
      )
      expect(response).toBe(fallbackResponse)
      expect(response.status).toBe(200)

      const body = (await response.json()) as { fallback: boolean }
      expect(body.fallback).toBe(true)
    })

    it("should handle async fallback response generation", async () => {
      fetchSpy.mockRejectedValue(new Error("Timeout error"))

      const onErrorHook = jest.fn().mockImplementation(async (req, error) => {
        // Simulate async fallback logic
        await new Promise((resolve) => setTimeout(resolve, 10))

        return new Response(
          JSON.stringify({
            error: "Service unavailable",
            timestamp: Date.now(),
            originalUrl: req.url,
          }),
          {
            status: 503,
            statusText: "Service Unavailable",
            headers: new Headers({ "content-type": "application/json" }),
          },
        )
      })

      const request = new Request("https://example.com/test")
      const response = await proxy.proxy(request, "/api/data", {
        onError: onErrorHook,
      })

      expect(onErrorHook).toHaveBeenCalledWith(
        expect.any(Request),
        expect.any(Error),
      )
      expect(response.status).toBe(503)

      const body = (await response.json()) as {
        error: string
        originalUrl: string
      }
      expect(body.error).toBe("Service unavailable")
      expect(body.originalUrl).toBe("https://example.com/test")
    })

    it("should fallback to default error response when onError hook returns void", async () => {
      fetchSpy.mockRejectedValue(new Error("Network error"))

      const onErrorHook = jest.fn().mockResolvedValue(undefined)

      const request = new Request("https://example.com/test")
      const response = await proxy.proxy(request, "/api/data", {
        onError: onErrorHook,
      })

      expect(onErrorHook).toHaveBeenCalledWith(
        expect.any(Request),
        expect.any(Error),
      )
      expect(response.status).toBe(502) // Default error response
    })

    it("should handle different error types with appropriate fallbacks", async () => {
      const testCases = [
        {
          error: new Error("timeout"),
          expectedStatus: 504,
          fallbackStatus: 408,
          fallbackMessage: "Request timeout - try again later",
        },
        {
          error: new Error("Circuit breaker is OPEN"),
          expectedStatus: 503,
          fallbackStatus: 503,
          fallbackMessage: "Service temporarily unavailable",
        },
        {
          error: new Error("Network error"),
          expectedStatus: 502,
          fallbackStatus: 500,
          fallbackMessage: "Internal server error",
        },
      ]

      for (const testCase of testCases) {
        fetchSpy.mockRejectedValue(testCase.error)

        const onErrorHook = jest.fn().mockResolvedValue(
          new Response(JSON.stringify({ message: testCase.fallbackMessage }), {
            status: testCase.fallbackStatus,
            headers: new Headers({ "content-type": "application/json" }),
          }),
        )

        const request = new Request("https://example.com/test")
        const response = await proxy.proxy(request, "/api/data", {
          onError: onErrorHook,
        })

        expect(response.status).toBe(testCase.fallbackStatus)

        const body = (await response.json()) as { message: string }
        expect(body.message).toBe(testCase.fallbackMessage)
      }
    })

    it("should handle circuit breaker with fallback response", async () => {
      const proxyWithCircuitBreaker = new FetchProxy({
        base: "https://api.example.com",
        circuitBreaker: {
          failureThreshold: 1,
          resetTimeout: 1000,
          enabled: true,
        },
      })

      // First request fails to trigger circuit breaker
      fetchSpy.mockRejectedValue(new Error("Service error"))

      const onErrorHook = jest
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              message: "Using cached data",
              data: { cached: true },
              source: "fallback",
            }),
            {
              status: 200,
              headers: new Headers({ "content-type": "application/json" }),
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              message: "Using cached data",
              data: { cached: true },
              source: "fallback",
            }),
            {
              status: 200,
              headers: new Headers({ "content-type": "application/json" }),
            },
          ),
        )

      const request = new Request("https://example.com/test")

      // First request - should fail and trigger circuit breaker
      const response1 = await proxyWithCircuitBreaker.proxy(
        request,
        "/api/data",
        {
          onError: onErrorHook,
        },
      )

      expect(response1.status).toBe(200)
      const body1 = (await response1.json()) as { source: string }
      expect(body1.source).toBe("fallback")

      // Second request - circuit breaker should be open
      const response2 = await proxyWithCircuitBreaker.proxy(
        request,
        "/api/data",
        {
          onError: onErrorHook,
        },
      )

      expect(response2.status).toBe(200)
      const body2 = (await response2.json()) as { source: string }
      expect(body2.source).toBe("fallback")
    })

    it("should pass correct request and error objects to onError hook", async () => {
      const networkError = new Error("ECONNREFUSED")
      fetchSpy.mockRejectedValue(networkError)

      const onErrorHook = jest
        .fn()
        .mockResolvedValue(new Response("Fallback response", { status: 200 }))

      const originalRequest = new Request("https://example.com/test", {
        method: "POST",
        headers: { "X-Custom": "value" },
        body: JSON.stringify({ test: "data" }),
      })

      await proxy.proxy(originalRequest, "/api/data", {
        onError: onErrorHook,
      })

      expect(onErrorHook).toHaveBeenCalledWith(
        expect.any(Request),
        networkError,
      )

      // Check the actual URL passed to the hook (original request URL, not target URL)
      const actualRequest = onErrorHook.mock.calls[0][0]
      expect(actualRequest.url).toBe("https://example.com/test")
      expect(actualRequest.method).toBe("POST")
    })

    it("should handle multiple concurrent requests with fallback", async () => {
      fetchSpy.mockRejectedValue(new Error("Service unavailable"))

      const onErrorHook = jest.fn().mockImplementation(async (req, error) => {
        return new Response(
          JSON.stringify({
            message: "Fallback response",
            requestId: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
          }),
          {
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
          },
        )
      })

      const requests = Array.from(
        { length: 5 },
        (_, i) => new Request(`https://example.com/test${i}`),
      )

      const responses = await Promise.all(
        requests.map((req) =>
          proxy.proxy(req, `/api/data${req.url.slice(-1)}`, {
            onError: onErrorHook,
          }),
        ),
      )

      expect(onErrorHook).toHaveBeenCalledTimes(5)

      for (const response of responses) {
        expect(response.status).toBe(200)
        const body = (await response.json()) as {
          message: string
          requestId: string
        }
        expect(body.message).toBe("Fallback response")
        expect(body.requestId).toBeDefined()
      }
    })

    it("should handle onError hook that throws an error", async () => {
      fetchSpy.mockRejectedValue(new Error("Network error"))

      const onErrorHook = jest.fn().mockImplementation(async () => {
        throw new Error("Hook error")
      })

      const request = new Request("https://example.com/test")

      try {
        await proxy.proxy(request, "/api/data", {
          onError: onErrorHook,
        })
        // If we reach here, the test should fail
        expect(true).toBe(false)
      } catch (error) {
        expect(onErrorHook).toHaveBeenCalled()
        expect((error as Error).message).toBe("Hook error")
      }
    })

    it("should handle fallback response with custom headers", async () => {
      fetchSpy.mockRejectedValue(new Error("Service error"))

      const onErrorHook = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ fallback: true }), {
          status: 200,
          headers: new Headers({
            "content-type": "application/json",
            "x-fallback": "true",
            "x-timestamp": Date.now().toString(),
            "cache-control": "no-cache",
          }),
        }),
      )

      const request = new Request("https://example.com/test")
      const response = await proxy.proxy(request, "/api/data", {
        onError: onErrorHook,
      })

      expect(response.status).toBe(200)
      expect(response.headers.get("x-fallback")).toBe("true")
      expect(response.headers.get("x-timestamp")).toBeTruthy()
      expect(response.headers.get("cache-control")).toBe("no-cache")
    })

    it("should handle streaming fallback response", async () => {
      fetchSpy.mockRejectedValue(new Error("Streaming error"))

      const onErrorHook = jest.fn().mockImplementation(async (req, error) => {
        const stream = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({
              message: "Fallback stream",
              chunks: ["chunk1", "chunk2", "chunk3"],
            })
            controller.enqueue(new TextEncoder().encode(data))
            controller.close()
          },
        })

        return new Response(stream, {
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
        })
      })

      const request = new Request("https://example.com/test")
      const response = await proxy.proxy(request, "/api/data", {
        onError: onErrorHook,
      })

      expect(response.status).toBe(200)

      const body = (await response.json()) as {
        message: string
        chunks: string[]
      }
      expect(body.message).toBe("Fallback stream")
      expect(body.chunks).toEqual(["chunk1", "chunk2", "chunk3"])
    })
  })

  describe("Integration with Other Features", () => {
    it("should work with beforeRequest and afterResponse hooks", async () => {
      fetchSpy.mockRejectedValue(new Error("Network error"))

      const beforeRequestHook = jest.fn()
      const afterResponseHook = jest.fn()
      const onErrorHook = jest
        .fn()
        .mockResolvedValue(new Response("Fallback", { status: 200 }))

      const request = new Request("https://example.com/test")
      const response = await proxy.proxy(request, "/api/data", {
        beforeRequest: beforeRequestHook,
        afterResponse: afterResponseHook,
        onError: onErrorHook,
      })

      expect(beforeRequestHook).toHaveBeenCalled()
      expect(onErrorHook).toHaveBeenCalled()
      // afterResponse hook should NOT be called for error responses
      expect(afterResponseHook).not.toHaveBeenCalled()
      expect(response.status).toBe(200)
    })

    it("should work with custom headers and query parameters", async () => {
      fetchSpy.mockRejectedValue(new Error("Network error"))

      const onErrorHook = jest
        .fn()
        .mockResolvedValue(new Response("Fallback", { status: 200 }))

      const request = new Request("https://example.com/test")
      await proxy.proxy(request, "/api/data", {
        headers: { "X-Custom": "test" },
        queryString: { param: "value" },
        onError: onErrorHook,
      })

      expect(onErrorHook).toHaveBeenCalledWith(
        expect.any(Request),
        expect.any(Error),
      )

      // Check the actual URL passed to the hook (original request URL, not target URL)
      const actualRequest = onErrorHook.mock.calls[0][0]
      expect(actualRequest.url).toBe("https://example.com/test")
    })
  })
})
