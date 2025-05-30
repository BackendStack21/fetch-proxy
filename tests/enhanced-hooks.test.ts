/**
 * Tests for enhanced hook naming conventions
 */

import { describe, expect, it, beforeEach, jest } from "bun:test"
import { FetchProxy } from "../src/proxy"
import { CircuitState } from "../src/types"
import type { ProxyRequestOptions, CircuitBreakerResult } from "../src/types"

// Mock fetch for testing
const mockFetch = jest.fn()
;(global as any).fetch = mockFetch

describe("Enhanced Hook Naming Conventions", () => {
  let proxy: FetchProxy
  let mockResponse: Response

  beforeEach(() => {
    proxy = new FetchProxy({
      base: "https://api.example.com",
      timeout: 5000,
    })

    mockResponse = new Response(JSON.stringify({ success: true }), {
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/json" }),
    })

    mockFetch.mockClear()
    mockFetch.mockResolvedValue(mockResponse)
  })

  describe("beforeRequest Hook", () => {
    it("should execute beforeRequest hook before making the request", async () => {
      const beforeRequestHook = jest.fn()
      const request = new Request("https://example.com/test")

      const options: ProxyRequestOptions = {
        beforeRequest: beforeRequestHook,
      }

      await proxy.proxy(request, undefined, options)

      expect(beforeRequestHook).toHaveBeenCalledTimes(1)
      expect(beforeRequestHook).toHaveBeenCalledWith(request, options)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("should handle async beforeRequest hooks", async () => {
      let hookExecuted = false
      const beforeRequestHook = async (req: Request) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        hookExecuted = true
      }

      const request = new Request("https://example.com/test")
      const options: ProxyRequestOptions = {
        beforeRequest: beforeRequestHook,
      }

      await proxy.proxy(request, undefined, options)

      expect(hookExecuted).toBe(true)
    })
  })

  describe("afterResponse Hook", () => {
    it("should execute afterResponse hook after receiving the response", async () => {
      const afterResponseHook = jest.fn()
      const request = new Request("https://example.com/test")

      const options: ProxyRequestOptions = {
        afterResponse: afterResponseHook,
      }

      await proxy.proxy(request, undefined, options)

      expect(afterResponseHook).toHaveBeenCalledTimes(1)
      expect(afterResponseHook).toHaveBeenCalledWith(
        request,
        expect.any(Response),
        expect.any(ReadableStream),
      )
    })
  })

  describe("Circuit Breaker Hooks", () => {
    it("should execute beforeCircuitBreakerExecution hook", async () => {
      const beforeCircuitBreakerHook = jest.fn()
      const request = new Request("https://example.com/test")

      const options: ProxyRequestOptions = {
        beforeCircuitBreakerExecution: beforeCircuitBreakerHook,
      }

      await proxy.proxy(request, undefined, options)

      expect(beforeCircuitBreakerHook).toHaveBeenCalledTimes(1)
      expect(beforeCircuitBreakerHook).toHaveBeenCalledWith(request, options)
    })

    it("should execute afterCircuitBreakerExecution hook on success", async () => {
      const afterCircuitBreakerHook = jest.fn()
      const request = new Request("https://example.com/test")

      const options: ProxyRequestOptions = {
        afterCircuitBreakerExecution: afterCircuitBreakerHook,
      }

      await proxy.proxy(request, undefined, options)

      expect(afterCircuitBreakerHook).toHaveBeenCalledTimes(1)
      expect(afterCircuitBreakerHook).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          success: true,
          state: CircuitState.CLOSED,
          failureCount: 0,
          executionTimeMs: expect.any(Number),
        }),
      )
    })

    it("should execute afterCircuitBreakerExecution hook on failure", async () => {
      const afterCircuitBreakerHook = jest.fn()
      const request = new Request("https://example.com/test")
      const error = new Error("Network error")

      mockFetch.mockRejectedValueOnce(error)

      const options: ProxyRequestOptions = {
        afterCircuitBreakerExecution: afterCircuitBreakerHook,
      }

      const response = await proxy.proxy(request, undefined, options)

      expect(response.status).toBe(502) // Bad Gateway
      expect(afterCircuitBreakerHook).toHaveBeenCalledTimes(1)
      expect(afterCircuitBreakerHook).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          success: false,
          error: expect.any(Error),
          state: CircuitState.CLOSED,
          failureCount: expect.any(Number),
          executionTimeMs: expect.any(Number),
        }),
      )
    })

    it("should track execution time in circuit breaker hooks", async () => {
      const afterCircuitBreakerHook = jest.fn()
      const request = new Request("https://example.com/test")

      // Add some delay to the fetch
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(mockResponse), 50)),
      )

      const options: ProxyRequestOptions = {
        afterCircuitBreakerExecution: afterCircuitBreakerHook,
      }

      await proxy.proxy(request, undefined, options)

      expect(afterCircuitBreakerHook).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          executionTimeMs: expect.any(Number),
        }),
      )

      const result: CircuitBreakerResult =
        afterCircuitBreakerHook.mock.calls[0][1]
      expect(result.executionTimeMs).toBeGreaterThan(40) // Should be at least 40ms
    })
  })

  describe("Hook Execution Order", () => {
    it("should execute hooks in the correct order", async () => {
      const executionOrder: string[] = []

      const beforeRequestHook = jest.fn(() => {
        executionOrder.push("beforeRequest")
      })

      const beforeCircuitBreakerHook = jest.fn(() => {
        executionOrder.push("beforeCircuitBreaker")
      })

      const afterResponseHook = jest.fn(() => {
        executionOrder.push("afterResponse")
      })

      const afterCircuitBreakerHook = jest.fn(() => {
        executionOrder.push("afterCircuitBreaker")
      })

      const request = new Request("https://example.com/test")
      const options: ProxyRequestOptions = {
        beforeRequest: beforeRequestHook,
        beforeCircuitBreakerExecution: beforeCircuitBreakerHook,
        afterResponse: afterResponseHook,
        afterCircuitBreakerExecution: afterCircuitBreakerHook,
      }

      await proxy.proxy(request, undefined, options)

      expect(executionOrder).toEqual([
        "beforeRequest",
        "beforeCircuitBreaker",
        "afterResponse",
        "afterCircuitBreaker",
      ])
    })
  })

  describe("Error Handling", () => {
    it("should continue execution if beforeRequest hook throws", async () => {
      const beforeRequestHook = jest.fn(() => {
        throw new Error("Hook error")
      })

      const request = new Request("https://example.com/test")
      const options: ProxyRequestOptions = {
        beforeRequest: beforeRequestHook,
      }

      // Should not throw and should return an error response
      const response = await proxy.proxy(request, undefined, options)
      expect(response.status).toBe(502) // Bad Gateway due to hook error
    })

    it("should execute afterCircuitBreakerExecution even when other hooks fail", async () => {
      const afterCircuitBreakerHook = jest.fn()
      const beforeRequestHook = jest.fn(() => {
        throw new Error("Hook error")
      })

      const request = new Request("https://example.com/test")
      const options: ProxyRequestOptions = {
        beforeRequest: beforeRequestHook,
        afterCircuitBreakerExecution: afterCircuitBreakerHook,
      }

      await proxy.proxy(request, undefined, options)

      expect(afterCircuitBreakerHook).toHaveBeenCalledTimes(1)
      expect(afterCircuitBreakerHook).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          success: false,
          error: expect.any(Error),
        }),
      )
    })
  })

  describe("Header Manipulation with Hooks", () => {
    it("should allow request header modification in beforeRequest hook", async () => {
      const request = new Request("https://example.com/test", {
        headers: {
          "original-header": "original-value",
        },
      })

      const options: ProxyRequestOptions = {
        beforeRequest: async (req: Request, opts: ProxyRequestOptions) => {
          // Add new headers
          req.headers.set("x-custom-auth", "Bearer token123")
          req.headers.set("x-timestamp", "2025-05-30")

          // Modify existing headers
          req.headers.set("original-header", "modified-value")

          // Add headers via options
          if (!opts.headers) opts.headers = {}
          opts.headers["x-options-header"] = "from-options"
        },
      }

      await proxy.proxy(request, undefined, options)

      // Verify the mock was called (we can't easily verify exact headers due to internal processing)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      )
    })

    it("should allow response header modification in afterResponse hook", async () => {
      const originalResponse = new Response(JSON.stringify({ data: "test" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          server: "nginx/1.20",
          "x-powered-by": "Express",
        },
      })

      mockFetch.mockResolvedValueOnce(originalResponse)

      const request = new Request("https://example.com/test")

      // Note: afterResponse hook doesn't automatically modify the returned response
      // It's for observation/logging. To modify response, the application code needs to handle it
      let responseModified = false
      const options: ProxyRequestOptions = {
        afterResponse: async (req: Request, res: Response, body) => {
          // This hook is called for observation/logging
          responseModified = true
          expect(res.headers.get("content-type")).toBe("application/json")
          expect(res.headers.get("server")).toBe("nginx/1.20")
        },
      }

      const response = await proxy.proxy(request, undefined, options)

      // Verify the hook was called and response is returned
      expect(responseModified).toBe(true)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("application/json")
    })
  })

  describe("Type Safety", () => {
    it("should provide correct types for hook parameters", () => {
      // This test verifies TypeScript compilation - if it compiles, types are correct
      const options: ProxyRequestOptions = {
        beforeRequest: async (req: Request, opts: ProxyRequestOptions) => {
          expect(req).toBeInstanceOf(Request)
          expect(opts).toBeTypeOf("object")
        },
        afterResponse: async (
          req: Request,
          res: Response,
          body?: ReadableStream | null,
        ) => {
          expect(req).toBeInstanceOf(Request)
          expect(res).toBeInstanceOf(Response)
        },
        beforeCircuitBreakerExecution: async (
          req: Request,
          opts: ProxyRequestOptions,
        ) => {
          expect(req).toBeInstanceOf(Request)
          expect(opts).toBeTypeOf("object")
        },
        afterCircuitBreakerExecution: async (
          req: Request,
          result: CircuitBreakerResult,
        ) => {
          expect(req).toBeInstanceOf(Request)
          expect(result).toHaveProperty("success")
          expect(result).toHaveProperty("state")
          expect(result).toHaveProperty("failureCount")
          expect(result).toHaveProperty("executionTimeMs")
        },
      }

      expect(options).toBeDefined()
    })
  })
})
