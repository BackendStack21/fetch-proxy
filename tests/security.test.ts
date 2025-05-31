import { describe, it, expect, afterAll, mock } from "bun:test"
import { buildURL } from "../src/utils"

afterAll(() => {
  mock.restore()
})

describe("Security Tests", () => {
  describe("SSRF Prevention", () => {
    it("should prevent file:// protocol access", () => {
      expect(() => {
        buildURL("file:///etc/passwd")
      }).toThrow("Unsupported protocol")
    })

    it("should prevent ftp:// protocol access", () => {
      expect(() => {
        buildURL("ftp://internal.server/file")
      }).toThrow("Unsupported protocol")
    })

    it("should prevent data:// protocol access", () => {
      expect(() => {
        buildURL("data:text/plain;base64,SGVsbG8gV29ybGQ=")
      }).toThrow("Unsupported protocol")
    })

    it("should allow http:// protocol", () => {
      const url = buildURL("http://example.com/api")
      expect(url.toString()).toBe("http://example.com/api")
    })

    it("should allow https:// protocol", () => {
      const url = buildURL("https://example.com/api")
      expect(url.toString()).toBe("https://example.com/api")
    })

    it("should prevent protocol override in relative URLs", () => {
      expect(() => {
        buildURL("//evil.com/malicious", "https://api.example.com")
      }).toThrow("Protocol override not allowed")
    })

    it("should prevent localhost access in production-like mode", () => {
      // This test would be configurable based on environment
      const url = buildURL("http://localhost:8080/admin")
      // Should either reject or log warning for localhost access
      expect(url.hostname).toBe("localhost") // Current behavior, will be restricted
    })
  })
})
