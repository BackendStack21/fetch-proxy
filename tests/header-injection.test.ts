/**
 * Security tests for header injection vulnerabilities
 */
import { describe, expect, it, afterAll, mock } from "bun:test"

import { recordToHeaders } from "../src/utils"

afterAll(() => {
  mock.restore()
})

describe("Header Injection Security Tests", () => {
  describe("CRLF Header Injection", () => {
    it("should reject header names with CRLF characters", () => {
      const maliciousHeaders = {
        "User-Agent\r\nX-Injected": "malicious-value",
        "normal-header": "safe-value",
      }

      expect(() => {
        recordToHeaders(maliciousHeaders)
      }).toThrow(/Invalid header name/)
    })

    it("should reject header values with CRLF characters", () => {
      const maliciousHeaders = {
        "User-Agent": "value\r\nX-Injected: malicious",
        "normal-header": "safe-value",
      }

      expect(() => {
        recordToHeaders(maliciousHeaders)
      }).toThrow(/contains forbidden characters/)
    })

    it("should reject header names with newline only", () => {
      const maliciousHeaders = {
        "User-Agent\nX-Injected": "malicious-value",
      }

      expect(() => {
        recordToHeaders(maliciousHeaders)
      }).toThrow(/Invalid header name/)
    })

    it("should reject header values with newline only", () => {
      const maliciousHeaders = {
        "User-Agent": "value\nX-Injected: malicious",
      }

      expect(() => {
        recordToHeaders(maliciousHeaders)
      }).toThrow(/contains forbidden characters/)
    })

    it("should reject header names with carriage return only", () => {
      const maliciousHeaders = {
        "User-Agent\rX-Injected": "malicious-value",
      }

      expect(() => {
        recordToHeaders(maliciousHeaders)
      }).toThrow(/Invalid header name/)
    })

    it("should reject header values with carriage return only", () => {
      const maliciousHeaders = {
        "User-Agent": "value\rX-Injected: malicious",
      }

      expect(() => {
        recordToHeaders(maliciousHeaders)
      }).toThrow(/contains forbidden characters/)
    })

    it("should reject header names with null byte", () => {
      const maliciousHeaders = {
        "User-Agent\x00X-Injected": "malicious-value",
      }

      expect(() => {
        recordToHeaders(maliciousHeaders)
      }).toThrow(/Invalid header name/)
    })

    it("should reject header values with null byte", () => {
      const maliciousHeaders = {
        "User-Agent": "value\x00X-Injected: malicious",
      }

      expect(() => {
        recordToHeaders(maliciousHeaders)
      }).toThrow(/contains forbidden characters/)
    })

    it("should allow valid headers", () => {
      const validHeaders = {
        "Content-Type": "application/json",
        Authorization: "Bearer token123",
        "X-Custom": "safe-value",
      }

      expect(() => {
        const headers = recordToHeaders(validHeaders)
        expect(headers.get("Content-Type")).toBe("application/json")
        expect(headers.get("Authorization")).toBe("Bearer token123")
        expect(headers.get("X-Custom")).toBe("safe-value")
      }).not.toThrow()
    })
  })

  describe("Header Name Validation", () => {
    it("should reject empty header names", () => {
      const maliciousHeaders = {
        "": "some-value",
      }

      expect(() => {
        recordToHeaders(maliciousHeaders)
      }).toThrow(/cannot be empty/)
    })

    it("should reject header names with spaces", () => {
      const maliciousHeaders = {
        "Invalid Header": "some-value",
      }

      expect(() => {
        recordToHeaders(maliciousHeaders)
      }).toThrow(/Invalid header name/)
    })

    it("should reject header names with invalid characters", () => {
      const invalidChars = [
        '"',
        "(",
        ")",
        ",",
        "/",
        ":",
        ";",
        "<",
        "=",
        ">",
        "?",
        "@",
        "[",
        "\\",
        "]",
        "{",
        "}",
      ]

      invalidChars.forEach((char) => {
        const maliciousHeaders = {
          [`header${char}name`]: "some-value",
        }

        expect(() => {
          recordToHeaders(maliciousHeaders)
        }).toThrow(/Invalid header name/)
      })
    })
  })

  describe("Multi-line Header Value Attacks", () => {
    it("should reject HTTP response splitting attempts", () => {
      const maliciousHeaders = {
        Location: "http://evil.com\r\n\r\n<script>alert('xss')</script>",
      }

      expect(() => {
        recordToHeaders(maliciousHeaders)
      }).toThrow(/contains forbidden characters/)
    })

    it("should reject header folding attempts", () => {
      const maliciousHeaders = {
        "X-Custom": "value1\r\n value2",
      }

      expect(() => {
        recordToHeaders(maliciousHeaders)
      }).toThrow(/contains forbidden characters/)
    })
  })

  describe("Header Injection in Proxy Flow", () => {
    it("should document that native Headers API prevents header injection", () => {
      // This test documents the security behavior
      const maliciousHeaderName = "X-Test\r\nX-Injected"
      const maliciousHeaderValue = "value\r\nX-Injected: evil"

      // Both should throw, demonstrating security protection
      expect(() => new Headers({ [maliciousHeaderName]: "value" })).toThrow()
      expect(() => new Headers({ "X-Test": maliciousHeaderValue })).toThrow()

      // The fetch-gate library inherits this protection via recordToHeaders
      expect(() =>
        recordToHeaders({ [maliciousHeaderName]: "value" }),
      ).toThrow()
      expect(() =>
        recordToHeaders({ "X-Test": maliciousHeaderValue }),
      ).toThrow()
    })
  })
})
