import { describe, expect, test, mock, afterAll } from "bun:test"
import { normalizeSecurePath } from "../src/utils"

afterAll(() => {
  mock.restore()
})

describe("Path Traversal Security", () => {
  describe("normalizeSecurePath", () => {
    test("should normalize simple valid paths", () => {
      expect(normalizeSecurePath("/files/document.txt", "/files/")).toBe(
        "/files/document.txt",
      )
      expect(normalizeSecurePath("/files/subfolder/file.txt", "/files/")).toBe(
        "/files/subfolder/file.txt",
      )
    })

    test("should handle paths with redundant slashes", () => {
      expect(normalizeSecurePath("/files//document.txt", "/files/")).toBe(
        "/files/document.txt",
      )
      expect(
        normalizeSecurePath("/files///subfolder//file.txt", "/files/"),
      ).toBe("/files/subfolder/file.txt")
    })

    test("should handle paths with current directory references", () => {
      expect(normalizeSecurePath("/files/./document.txt", "/files/")).toBe(
        "/files/document.txt",
      )
      expect(
        normalizeSecurePath("/files/subfolder/./file.txt", "/files/"),
      ).toBe("/files/subfolder/file.txt")
    })

    test("should prevent basic directory traversal attacks", () => {
      expect(() =>
        normalizeSecurePath("/files/../etc/passwd", "/files/"),
      ).toThrow(
        "Path traversal attempt detected. Path must start with: /files/",
      )

      expect(() =>
        normalizeSecurePath("/files/../../etc/passwd", "/files/"),
      ).toThrow(
        "Path traversal attempt detected. Path must start with: /files/",
      )
    })

    test("should prevent advanced directory traversal attacks", () => {
      expect(() =>
        normalizeSecurePath("/files/document/../../../etc/passwd", "/files/"),
      ).toThrow(
        "Path traversal attempt detected. Path must start with: /files/",
      )

      expect(() =>
        normalizeSecurePath(
          "/files/subfolder/../../../admin/secrets",
          "/files/",
        ),
      ).toThrow(
        "Path traversal attempt detected. Path must start with: /files/",
      )
    })

    test("should allow safe upward navigation within allowed prefix", () => {
      expect(
        normalizeSecurePath("/files/subfolder/../document.txt", "/files/"),
      ).toBe("/files/document.txt")
      expect(
        normalizeSecurePath(
          "/files/deep/nested/folder/../../file.txt",
          "/files/",
        ),
      ).toBe("/files/deep/file.txt")
    })

    test("should reject null byte injection attempts", () => {
      expect(() =>
        normalizeSecurePath("/files/document.txt\0", "/files/"),
      ).toThrow("Path contains null bytes")

      expect(() =>
        normalizeSecurePath("/files/\0../../../etc/passwd", "/files/"),
      ).toThrow("Path contains null bytes")
    })

    test("should handle edge cases with input validation", () => {
      expect(() => normalizeSecurePath("", "/files/")).toThrow(
        "Path must be a non-empty string",
      )
      expect(() => normalizeSecurePath("   ", "/files/")).toThrow(
        "Path must be a non-empty string",
      )

      // @ts-expect-error Testing runtime validation
      expect(() => normalizeSecurePath(null, "/files/")).toThrow(
        "Path must be a non-empty string",
      )

      // @ts-expect-error Testing runtime validation
      expect(() => normalizeSecurePath(undefined, "/files/")).toThrow(
        "Path must be a non-empty string",
      )
    })

    test("should validate allowed prefix parameter", () => {
      expect(() => normalizeSecurePath("/files/document.txt", "")).toThrow(
        "Allowed prefix must be a non-empty string",
      )
      expect(() => normalizeSecurePath("/files/document.txt", "   ")).toThrow(
        "Allowed prefix must be a non-empty string",
      )

      // @ts-expect-error Testing runtime validation
      expect(() => normalizeSecurePath("/files/document.txt", null)).toThrow(
        "Allowed prefix must be a non-empty string",
      )

      expect(() => normalizeSecurePath("/files/document.txt", "")).toThrow(
        "Allowed prefix must be a non-empty string",
      )
    })

    test("should work with different allowed prefixes", () => {
      expect(normalizeSecurePath("/api/v1/users/123", "/api/v1/")).toBe(
        "/api/v1/users/123",
      )
      expect(normalizeSecurePath("/static/css/style.css", "/static/")).toBe(
        "/static/css/style.css",
      )

      expect(() =>
        normalizeSecurePath("/api/v1/../../../etc/passwd", "/api/v1/"),
      ).toThrow(
        "Path traversal attempt detected. Path must start with: /api/v1/",
      )
    })

    test("should handle complex mixed traversal attempts", () => {
      expect(() =>
        normalizeSecurePath(
          "/files/./subfolder/../../../etc/passwd",
          "/files/",
        ),
      ).toThrow(
        "Path traversal attempt detected. Path must start with: /files/",
      )

      expect(() =>
        normalizeSecurePath("/files//.//..//..//../../etc/passwd", "/files/"),
      ).toThrow(
        "Path traversal attempt detected. Path must start with: /files/",
      )
    })

    test("should preserve safe paths with complex legitimate navigation", () => {
      expect(
        normalizeSecurePath("/files/a/b/c/../../d/file.txt", "/files/"),
      ).toBe("/files/a/d/file.txt")
      expect(
        normalizeSecurePath(
          "/files/./subfolder/../other/./file.txt",
          "/files/",
        ),
      ).toBe("/files/other/file.txt")
    })
  })

  describe("Path Traversal Integration Tests", () => {
    test("should demonstrate path traversal protection in download-proxy example", () => {
      // Test that the security function would catch manual path manipulation
      // (URL parsing automatically resolves ../ so we test the function directly)

      // Simulate what would happen if an attacker could bypass URL normalization
      expect(() =>
        normalizeSecurePath("/files/../../../etc/passwd", "/files/"),
      ).toThrow(
        "Path traversal attempt detected. Path must start with: /files/",
      )

      // Simulate legitimate nested file access within allowed prefix
      expect(
        normalizeSecurePath("/files/subfolder/document.txt", "/files/"),
      ).toBe("/files/subfolder/document.txt")

      // Simulate safe upward navigation within bounds
      expect(
        normalizeSecurePath("/files/deep/nested/../file.txt", "/files/"),
      ).toBe("/files/deep/file.txt")
    })

    test("should protect against common path traversal attack vectors", () => {
      const attackVectors = [
        "/files/../../../etc/passwd",
        "/files/../../admin/secrets",
        "/files/../../../windows/system32/config/sam",
        "/files/document/../../../sensitive/data",
        "/files/.././../etc/shadow",
      ]

      for (const vector of attackVectors) {
        expect(() => normalizeSecurePath(vector, "/files/")).toThrow(
          "Path traversal attempt detected. Path must start with: /files/",
        )
      }
    })

    test("should allow legitimate file access patterns", () => {
      const legitimatePaths = [
        "/files/document.txt",
        "/files/subfolder/file.txt",
        "/files/deep/nested/folder/file.pdf",
        "/files/uploads/user123/photo.jpg",
        "/files/cache/temporary-data.json",
      ]

      for (const path of legitimatePaths) {
        expect(() => normalizeSecurePath(path, "/files/")).not.toThrow()
        expect(normalizeSecurePath(path, "/files/")).toBe(path)
      }
    })
  })
})
