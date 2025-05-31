import { describe, it, expect, beforeEach } from "bun:test"
import { validateHttpMethod } from "../src/utils"
import { FetchProxy } from "../src/proxy"

describe("HTTP Method Validation Security Tests", () => {
  describe("Direct Method Validation", () => {
    it("should reject CONNECT method", () => {
      expect(() => {
        validateHttpMethod("CONNECT")
      }).toThrow(/HTTP method CONNECT is not allowed/)
    })

    it("should reject TRACE method", () => {
      expect(() => {
        validateHttpMethod("TRACE")
      }).toThrow(/HTTP method TRACE is not allowed/)
    })

    it("should reject arbitrary custom methods", () => {
      expect(() => {
        validateHttpMethod("CUSTOM_DANGEROUS_METHOD")
      }).toThrow(/HTTP method CUSTOM_DANGEROUS_METHOD is not allowed/)
    })

    it("should allow GET method", () => {
      expect(() => {
        validateHttpMethod("GET")
      }).not.toThrow()
    })

    it("should allow POST method", () => {
      expect(() => {
        validateHttpMethod("POST")
      }).not.toThrow()
    })

    it("should handle case sensitivity correctly", () => {
      expect(() => {
        validateHttpMethod("connect")
      }).toThrow(/HTTP method.*is not allowed/)

      expect(() => {
        validateHttpMethod("Trace")
      }).toThrow(/HTTP method.*is not allowed/)
    })
  })

  describe("Native Request Constructor Security", () => {
    it("should silently normalize invalid method injection attempts (runtime protection)", () => {
      // The native Request constructor in Bun normalizes invalid methods
      const req1 = new Request("http://example.com/test", {
        method: "GET\r\nHost: evil.com",
      })
      expect(req1.method).toBe("GET") // Runtime normalizes to GET
    })

    it("should silently normalize methods with null bytes (runtime protection)", () => {
      // The native Request constructor in Bun normalizes invalid methods
      const req2 = new Request("http://example.com/test", {
        method: "GET\x00",
      })
      expect(req2.method).toBe("GET") // Runtime normalizes to GET
    })
  })

  describe("Proxy Integration Tests", () => {
    let proxy: FetchProxy

    beforeEach(() => {
      proxy = new FetchProxy({
        base: "http://httpbin.org", // Use a real service for testing
        circuitBreaker: { enabled: false },
      })
    })

    it("should reject CONNECT method in proxy (if runtime allows it)", async () => {
      // Note: The native Request constructor may normalize some methods
      const request = new Request("http://httpbin.org/status/200", {
        method: "CONNECT",
      })

      // If the runtime allows CONNECT through, our validation should catch it
      if (request.method === "CONNECT") {
        const response = await proxy.proxy(request)
        expect(response.status).toBe(400)
        const text = await response.text()
        expect(text).toMatch(/HTTP method CONNECT is not allowed/)
      } else {
        // If runtime normalizes it, verify the normalization happened
        expect(request.method).toBe("GET") // Most runtimes normalize invalid methods to GET
      }
    })

    it("should handle runtime method normalization correctly", async () => {
      // Test that runtime normalizes invalid methods to GET
      const request = new Request("http://httpbin.org/status/200", {
        method: "CUSTOM_DANGEROUS_METHOD",
      })

      // The runtime should normalize the invalid method to GET
      expect(request.method).toBe("GET")

      // The normalized request should work fine
      const response = await proxy.proxy(request)
      expect(response.status).toBe(200)
    })

    it("should allow safe methods in proxy", async () => {
      const request = new Request("http://httpbin.org/status/200", {
        method: "GET",
      })

      const response = await proxy.proxy(request)
      expect(response.status).toBe(200)
    })

    it("should validate methods when passed through request options", async () => {
      // Test direct method validation by bypassing Request constructor
      const request = new Request("http://httpbin.org/status/200", {
        method: "GET",
      })

      // Simulate a scenario where we manually override the method (for testing purposes)
      // This tests our validation logic directly
      const originalMethod = request.method
      try {
        // Override the method property to simulate an invalid method reaching our code
        Object.defineProperty(request, "method", {
          value: "CUSTOM_DANGEROUS_METHOD",
          writable: false,
          configurable: true,
        })

        const response = await proxy.proxy(request)
        expect(response.status).toBe(400)
        const text = await response.text()
        expect(text).toMatch(
          /HTTP method CUSTOM_DANGEROUS_METHOD is not allowed/,
        )
      } finally {
        // Restore the original method
        Object.defineProperty(request, "method", {
          value: originalMethod,
          writable: false,
          configurable: true,
        })
      }
    })
  })
})
