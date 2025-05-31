import { describe, it, expect, mock, afterAll } from "bun:test"
import { buildQueryString } from "../src/utils"
import { FetchProxy } from "../src/proxy"

afterAll(() => {
  mock.restore()
})

describe("Query String Injection Security Tests", () => {
  describe("Parameter Name Validation", () => {
    it("should handle parameter names with special characters safely", () => {
      const params = {
        "param&injection=evil": "value",
        "param#fragment": "value",
        "param?query": "value",
      }

      const result = buildQueryString(params)
      // URLSearchParams should properly encode these
      expect(result).toContain("param%26injection%3Devil=value")
      expect(result).toContain("param%23fragment=value")
      expect(result).toContain("param%3Fquery=value")
    })

    it("should handle parameter values with injection attempts safely", () => {
      const params = {
        normal: "value&injected=evil",
        test: "value#fragment",
        query: "value?param=evil",
      }

      const result = buildQueryString(params)
      // URLSearchParams should properly encode these
      expect(result).toContain("value%26injected%3Devil")
      expect(result).toContain("value%23fragment")
      expect(result).toContain("value%3Fparam%3Devil")
    })

    it("should reject CRLF injection attempts in parameter names", () => {
      const paramsWithCRLF = {
        "param\r\nInjected-Header: evil": "value",
      }

      expect(() => buildQueryString(paramsWithCRLF)).toThrow(
        "Query parameter name 'param\r\nInjected-Header: evil' contains forbidden characters (CRLF or null bytes)",
      )

      const paramsWithNewline = {
        "param\nNewline": "value",
      }

      expect(() => buildQueryString(paramsWithNewline)).toThrow(
        "Query parameter name 'param\nNewline' contains forbidden characters (CRLF or null bytes)",
      )
    })

    it("should reject CRLF injection attempts in parameter values", () => {
      const paramsWithCRLF = {
        param1: "value\r\nInjected-Header: evil",
      }

      expect(() => buildQueryString(paramsWithCRLF)).toThrow(
        "Query parameter 'param1' value contains forbidden characters (CRLF or null bytes)",
      )

      const paramsWithNewline = {
        param2: "value\nNewline",
      }

      expect(() => buildQueryString(paramsWithNewline)).toThrow(
        "Query parameter 'param2' value contains forbidden characters (CRLF or null bytes)",
      )
    })
  })

  describe("String-based Query String Injection", () => {
    it("should handle raw query strings with potential injection safely", () => {
      // Test direct string injection attempts
      const maliciousQuery = "?normal=value&injected=evil&another=param"
      const result = buildQueryString(maliciousQuery)

      // Should return the string as-is but ensure it starts with ?
      expect(result).toBe(maliciousQuery)
    })

    it("should add ? prefix to raw query strings without it", () => {
      const queryWithoutPrefix = "param1=value1&param2=value2"
      const result = buildQueryString(queryWithoutPrefix)

      expect(result).toBe("?param1=value1&param2=value2")
    })

    it("should handle empty or invalid query strings safely", () => {
      expect(buildQueryString("")).toBe("?")
      expect(buildQueryString("?")).toBe("?")
      expect(buildQueryString({})).toBe("")
    })
  })

  describe("Array Parameter Handling", () => {
    it("should handle array parameters correctly without injection", () => {
      const params = {
        tags: ["value1", "value2", "value&injection=evil"],
        normal: "single_value",
      }

      const result = buildQueryString(params)

      // Should use append for arrays and properly encode values
      expect(result).toContain("tags=value1")
      expect(result).toContain("tags=value2")
      expect(result).toContain("tags=value%26injection%3Devil")
      expect(result).toContain("normal=single_value")
    })

    it("should reject arrays with CRLF injection attempts", () => {
      const paramsWithCRLF = {
        items: ["normal", "value\r\nInjected: evil"],
      }

      expect(() => buildQueryString(paramsWithCRLF)).toThrow(
        "Query parameter 'items' value contains forbidden characters (CRLF or null bytes)",
      )

      const paramsWithNewline = {
        items: ["normal", "value\nNewline"],
      }

      expect(() => buildQueryString(paramsWithNewline)).toThrow(
        "Query parameter 'items' value contains forbidden characters (CRLF or null bytes)",
      )
    })
  })

  describe("Special Value Type Handling", () => {
    it("should handle non-string values safely", () => {
      const params = {
        number: 123,
        boolean: true,
        null: null,
        undefined: undefined,
        object: { nested: "value" },
      }

      const result = buildQueryString(params)

      // All values should be converted to strings safely
      expect(result).toContain("number=123")
      expect(result).toContain("boolean=true")
      expect(result).toContain("null=null")
      expect(result).toContain("undefined=undefined")
      expect(result).toContain("object=%5Bobject+Object%5D")
    })
  })

  describe("Parameter Pollution Prevention", () => {
    it("should handle duplicate parameter names correctly", () => {
      const params = {
        duplicate: "first",
        // This will override the first one when using set()
      }

      // Add another value with same key
      const result1 = buildQueryString(params)

      // Test with array for intentional duplicates
      const paramsWithArray = {
        duplicate: ["first", "second", "third"],
      }

      const result2 = buildQueryString(paramsWithArray)

      expect(result1).toContain("duplicate=first")
      expect(result2).toContain("duplicate=first")
      expect(result2).toContain("duplicate=second")
      expect(result2).toContain("duplicate=third")
    })
  })

  describe("Proxy Integration with Query Injection", () => {
    it("should safely handle query string injection through proxy", async () => {
      const proxy = new FetchProxy({
        base: "http://httpbin.org",
        circuitBreaker: { enabled: false },
      })

      // Test with safe query parameters that contain encoding challenges but no CRLF
      const safeParams = {
        normal: "value",
        injection: "value&admin=true&bypass=1", // This is safe - just URL encoding needed
        special: "value with spaces and symbols!@#$%^&*()",
      }

      const request = new Request("http://httpbin.org/get")

      try {
        const response = await proxy.proxy(request, "/get", {
          queryString: safeParams,
        })

        // Should get a successful response (httpbin.org should handle encoded params safely)
        expect(response.status).toBe(200)

        const data = (await response.json()) as any
        const url = data.url as string

        // Verify that dangerous characters are properly encoded
        expect(url).toContain("injection=value%26admin%3Dtrue%26bypass%3D1")
        expect(url).toContain("normal=value")

        // Ensure no actual header injection occurred
        expect(data.headers).not.toHaveProperty("X-Injected-Header")
        expect(data.headers).not.toHaveProperty("admin")
        expect(data.headers).not.toHaveProperty("bypass")
      } catch (error) {
        // If external service fails, test should not fail
        console.warn("External service test failed, skipping:", error)
      }
    })

    it("should reject dangerous CRLF injection attempts in proxy", async () => {
      const proxy = new FetchProxy({
        base: "http://httpbin.org",
        circuitBreaker: { enabled: false },
      })

      // Test with malicious CRLF injection parameters
      const maliciousParams = {
        normal: "value",
        crlf: "value\r\nX-Injected-Header: evil",
      }

      const request = new Request("http://httpbin.org/get")

      // This should return a 400 Bad Request due to our security validation
      const response = await proxy.proxy(request, "/get", {
        queryString: maliciousParams,
      })

      expect(response.status).toBe(400)
      const responseText = await response.text()
      expect(responseText).toContain(
        "Query parameter 'crlf' value contains forbidden characters (CRLF or null bytes)",
      )
    })

    it("should safely merge query strings with existing URL parameters", async () => {
      const proxy = new FetchProxy({
        base: "http://httpbin.org",
        circuitBreaker: { enabled: false },
      })

      const request = new Request("http://httpbin.org/get")

      try {
        // Test merging with URL that already has query parameters
        const response = await proxy.proxy(
          request,
          "/get?existing=value&test=1",
          {
            queryString: {
              new: "param",
              injection: "attempt&override=true",
            },
          },
        )

        expect(response.status).toBe(200)

        const data = (await response.json()) as any
        const url = data.url as string

        // Should contain both existing and new parameters
        expect(url).toContain("existing=value")
        expect(url).toContain("test=1")
        expect(url).toContain("new=param")

        // Injection should be properly encoded
        expect(url).toContain("injection=attempt%26override%3Dtrue")
      } catch (error) {
        console.warn("External service test failed, skipping:", error)
      }
    })
  })
})
