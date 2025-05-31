/**
 * Utility functions for URL building, header manipulation, and query string handling
 */

import { URL } from "url"
import { ProxyLogger } from "./logger"

/**
 * Allowed protocols for proxy requests
 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"])

/**
 * Allowed HTTP methods for proxy requests
 */
const ALLOWED_HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
])

/**
 * Builds a URL from source and optional base with security validation
 */
export function buildURL(
  source: string,
  base?: string,
  logger?: ProxyLogger,
  requestId?: string,
  req?: Request,
): URL {
  // Check for protocol override attempts in relative URLs BEFORE normalization
  // Block exactly "//" which can cause protocol-relative URL attacks
  if (base && source.startsWith("//") && !source.startsWith("///")) {
    const error = new Error("Protocol override not allowed in relative URLs")
    if (logger && req) {
      logger.logSecurityEvent(
        "protocol_validation",
        req,
        "Protocol override attempt detected in relative URL",
        { requestId, source, base },
      )
    }
    throw error
  }

  // Handle relative URLs with multiple leading slashes for security
  if (!source.includes("://") && source.startsWith("/")) {
    source = source.replace(/^\/+/, "/")
  }

  let url: URL
  if (base) {
    const baseUrl = new URL(base)
    url = new URL(source, base)

    // Additional check: ensure the resulting URL doesn't change the base domain unexpectedly
    // This catches cases where URL constructor allows domain changes with protocol-relative URLs
    // Only apply this check for relative URLs (those starting with /), not absolute URLs
    if (
      url.hostname !== baseUrl.hostname &&
      source.startsWith("/") &&
      !source.includes("://")
    ) {
      const error = new Error("Domain override not allowed in relative URLs")
      if (logger && req) {
        logger.logSecurityEvent(
          "protocol_validation",
          req,
          `Domain override attempt: ${baseUrl.hostname} -> ${url.hostname}`,
          { requestId, source, base },
        )
      }
      throw error
    }
  } else {
    url = new URL(source)
  }

  // Validate protocol to prevent SSRF attacks
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    const error = new Error(
      `Unsupported protocol: ${url.protocol}. Only HTTP and HTTPS are allowed.`,
    )
    if (logger && req) {
      logger.logSecurityEvent(
        "protocol_validation",
        req,
        `Unsupported protocol: ${url.protocol}`,
        { requestId, source, base },
      )
    }
    throw error
  }

  return url
}

/**
 * Filters out a specific header (case-insensitive)
 */
export function filterHeaders(
  headers: Record<string, string>,
  filter: string,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== filter.toLowerCase()) {
      result[key] = value
    }
  }
  return result
}

/**
 * Converts Headers object to plain object
 */
export function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

/**
 * Validates header name for security issues
 */
function validateHeaderName(
  name: string,
  logger?: ProxyLogger,
  requestId?: string,
  req?: Request,
): void {
  if (!name || typeof name !== "string") {
    const error = new Error("Header name must be a non-empty string")
    if (logger && req) {
      logger.logSecurityEvent(
        "header_validation",
        req,
        "Invalid header name: empty or non-string",
        { requestId, headerName: name },
      )
    }
    throw error
  }

  // Check for CRLF injection
  if (name.includes("\r") || name.includes("\n") || name.includes("\0")) {
    const error = new Error(
      `Invalid header name: contains forbidden characters (CRLF or null bytes)`,
    )
    if (logger && req) {
      logger.logSecurityEvent(
        "header_validation",
        req,
        "Header name contains forbidden characters",
        { requestId, headerName: name },
      )
    }
    throw error
  }

  // Check for spaces and other invalid characters according to RFC 7230
  if (/[\s"(),/:;<=>?@[\\\]{}]/.test(name)) {
    const error = new Error(
      `Invalid header name: contains forbidden characters`,
    )
    if (logger && req) {
      logger.logSecurityEvent(
        "header_validation",
        req,
        "Header name contains invalid characters",
        { requestId, headerName: name },
      )
    }
    throw error
  }

  if (name === "") {
    const error = new Error("Header name cannot be empty")
    if (logger && req) {
      logger.logSecurityEvent(
        "header_validation",
        req,
        "Header name is empty",
        { requestId },
      )
    }
    throw error
  }
}

/**
 * Validates header value for security issues
 */
function validateHeaderValue(
  value: string,
  headerName: string,
  logger?: ProxyLogger,
  requestId?: string,
  req?: Request,
): void {
  if (typeof value !== "string") {
    const error = new Error(`Header '${headerName}' value must be a string`)
    if (logger && req) {
      logger.logSecurityEvent(
        "header_validation",
        req,
        `Header value must be string: ${headerName}`,
        { requestId, headerName, valueType: typeof value },
      )
    }
    throw error
  }

  // Check for CRLF injection (main security concern)
  if (value.includes("\r") || value.includes("\n") || value.includes("\0")) {
    const error = new Error(
      `Header '${headerName}' contains forbidden characters (CRLF or null bytes)`,
    )
    if (logger && req) {
      logger.logSecurityEvent(
        "header_validation",
        req,
        `Header value contains forbidden characters: ${headerName}`,
        { requestId, headerName },
      )
    }
    throw error
  }
}

/**
 * Converts plain object to Headers object with security validation
 */
export function recordToHeaders(
  record: Record<string, string>,
  logger?: ProxyLogger,
  requestId?: string,
  req?: Request,
): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(record)) {
    // Apply explicit validation before using native Headers API
    validateHeaderName(key, logger, requestId, req)
    validateHeaderValue(value, key, logger, requestId, req)

    // The native Headers.set() will also validate, providing defense in depth
    headers.set(key, value)
  }
  return headers
}

/**
 * Validates query parameter name for security issues
 */
function validateQueryParamName(
  name: string,
  logger?: ProxyLogger,
  requestId?: string,
  req?: Request,
): void {
  if (!name || typeof name !== "string") {
    const error = new Error("Query parameter name must be a non-empty string")
    if (logger && req) {
      logger.logSecurityEvent(
        "query_validation",
        req,
        "Invalid query parameter name: empty or non-string",
        { requestId, paramName: name },
      )
    }
    throw error
  }

  // Check for dangerous characters that could indicate injection attempts
  if (name.includes("\r") || name.includes("\n") || name.includes("\0")) {
    const error = new Error(
      `Query parameter name '${name}' contains forbidden characters (CRLF or null bytes)`,
    )
    if (logger && req) {
      logger.logSecurityEvent(
        "query_validation",
        req,
        "Query parameter name contains forbidden characters",
        { requestId, paramName: name },
      )
    }
    throw error
  }
}

/**
 * Validates query parameter value for security issues
 */
function validateQueryParamValue(
  value: string,
  paramName: string,
  logger?: ProxyLogger,
  requestId?: string,
  req?: Request,
): void {
  if (typeof value !== "string") {
    return // Non-string values will be converted to strings safely
  }

  // Check for dangerous characters that could indicate injection attempts
  if (value.includes("\r") || value.includes("\n") || value.includes("\0")) {
    const error = new Error(
      `Query parameter '${paramName}' value contains forbidden characters (CRLF or null bytes)`,
    )
    if (logger && req) {
      logger.logSecurityEvent(
        "query_validation",
        req,
        "Query parameter value contains forbidden characters",
        { requestId, paramName },
      )
    }
    throw error
  }
}

/**
 * Builds query string from parameters with security validation
 */
export function buildQueryString(
  params: Record<string, any> | string,
  logger?: ProxyLogger,
  requestId?: string,
  req?: Request,
): string {
  if (typeof params === "string") {
    // For string parameters, validate for dangerous characters
    if (
      params.includes("\r") ||
      params.includes("\n") ||
      params.includes("\0")
    ) {
      const error = new Error(
        "Query string contains forbidden characters (CRLF or null bytes)",
      )
      if (logger && req) {
        logger.logSecurityEvent(
          "query_validation",
          req,
          "Query string contains forbidden characters",
          { requestId },
        )
      }
      throw error
    }
    return params.startsWith("?") ? params : `?${params}`
  }

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    // Validate parameter name
    validateQueryParamName(key, logger, requestId, req)

    if (Array.isArray(value)) {
      value.forEach((v) => {
        const stringValue = String(v)
        validateQueryParamValue(stringValue, key, logger, requestId, req)
        searchParams.append(key, stringValue)
      })
    } else {
      const stringValue = String(value)
      validateQueryParamValue(stringValue, key, logger, requestId, req)
      searchParams.set(key, stringValue)
    }
  }

  const result = searchParams.toString()
  return result ? `?${result}` : ""
}

/**
 * Validates HTTP method for security issues
 */
export function validateHttpMethod(
  method: string,
  logger?: ProxyLogger,
  requestId?: string,
  req?: Request,
): void {
  if (!method || typeof method !== "string") {
    const error = new Error("HTTP method must be a non-empty string")
    if (logger && req) {
      logger.logSecurityEvent(
        "method_validation",
        req,
        "Invalid HTTP method: empty or non-string",
        { requestId, method },
      )
    }
    throw error
  }

  // Normalize method to uppercase for comparison
  const normalizedMethod = method.toUpperCase().trim()

  // Check for dangerous characters that could indicate injection attempts
  if (
    normalizedMethod.includes("\r") ||
    normalizedMethod.includes("\n") ||
    normalizedMethod.includes("\0")
  ) {
    const error = new Error(
      `HTTP method '${method}' contains forbidden characters (CRLF or null bytes)`,
    )
    if (logger && req) {
      logger.logSecurityEvent(
        "method_validation",
        req,
        "HTTP method contains forbidden characters",
        { requestId, method },
      )
    }
    throw error
  }

  // Check for spaces or other invalid characters
  if (/\s/.test(normalizedMethod)) {
    const error = new Error(
      `HTTP method '${method}' contains invalid characters (spaces)`,
    )
    if (logger && req) {
      logger.logSecurityEvent(
        "method_validation",
        req,
        "HTTP method contains spaces",
        { requestId, method },
      )
    }
    throw error
  }

  // Validate against allowed methods
  if (!ALLOWED_HTTP_METHODS.has(normalizedMethod)) {
    const error = new Error(
      `HTTP method ${method} is not allowed. Only ${Array.from(ALLOWED_HTTP_METHODS).join(", ")} methods are permitted.`,
    )
    if (logger && req) {
      logger.logSecurityEvent(
        "method_validation",
        req,
        `Disallowed HTTP method: ${method}`,
        { requestId, method, allowedMethods: Array.from(ALLOWED_HTTP_METHODS) },
      )
    }
    throw error
  }
}

/**
 * Securely normalizes a path by removing directory traversal sequences and ensuring it stays within allowed bounds
 * @param inputPath - The input path that may contain traversal sequences
 * @param allowedPrefix - The prefix that the normalized path must start with (e.g., "/files/")
 * @returns The normalized path that is safe from directory traversal
 * @throws Error if the path attempts to escape the allowed prefix
 */
export function normalizeSecurePath(
  inputPath: string,
  allowedPrefix: string,
): string {
  if (!inputPath || typeof inputPath !== "string" || inputPath.trim() === "") {
    throw new Error("Path must be a non-empty string")
  }

  if (
    !allowedPrefix ||
    typeof allowedPrefix !== "string" ||
    allowedPrefix.trim() === ""
  ) {
    throw new Error("Allowed prefix must be a non-empty string")
  }

  // Remove any null bytes that could be used for bypass attempts
  if (inputPath.includes("\0")) {
    throw new Error("Path contains null bytes")
  }

  // Normalize the path by removing redundant separators and resolving . and .. segments
  const segments = inputPath
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
  const normalizedSegments: string[] = []

  for (const segment of segments) {
    if (segment === "..") {
      // Remove the last segment if it exists (go up one directory)
      if (normalizedSegments.length > 0) {
        normalizedSegments.pop()
      }
    } else {
      normalizedSegments.push(segment)
    }
  }

  // Rebuild the path with leading slash
  const normalizedPath = "/" + normalizedSegments.join("/")

  // Ensure the normalized path starts with the allowed prefix
  if (!normalizedPath.startsWith(allowedPrefix)) {
    throw new Error(
      `Path traversal attempt detected. Path must start with: ${allowedPrefix}`,
    )
  }

  return normalizedPath
}

/**
 * Security configuration constants for DoS prevention
 */
export const SECURITY_LIMITS = {
  MAX_ITERATIONS: 1000,
  MAX_CONCURRENCY: 50,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_STRING_LENGTH: 1000,
  MAX_TIMEOUT: 60000, // 60 seconds
  MAX_QUERY_PARAMS: 100,
  MAX_HEADERS: 50,
  MAX_URL_LENGTH: 2048,
} as const

/**
 * Validates and limits numeric parameters to prevent DoS attacks
 * @param value - The numeric value to validate
 * @param max - Maximum allowed value
 * @param paramName - Name of the parameter for error messages
 * @returns The validated and limited value
 */
export function validateNumericLimit(
  value: number,
  max: number,
  paramName: string,
): number {
  if (typeof value !== "number" || isNaN(value) || !isFinite(value)) {
    throw new Error(`${paramName} must be a valid number`)
  }

  if (value < 0) {
    throw new Error(`${paramName} must be non-negative`)
  }

  if (value > max) {
    throw new Error(`${paramName} exceeds maximum allowed value of ${max}`)
  }

  return Math.floor(value) // Ensure integer
}

/**
 * Validates string length to prevent memory exhaustion attacks
 * @param value - The string to validate
 * @param maxLength - Maximum allowed length
 * @param paramName - Name of the parameter for error messages
 * @returns The validated string
 */
export function validateStringLength(
  value: string,
  maxLength: number,
  paramName: string,
): string {
  if (typeof value !== "string") {
    throw new Error(`${paramName} must be a string`)
  }

  if (value.length > maxLength) {
    throw new Error(
      `${paramName} exceeds maximum length of ${maxLength} characters`,
    )
  }

  return value
}

/**
 * Validates file size to prevent resource exhaustion
 * @param size - The file size in bytes
 * @param maxSize - Maximum allowed size in bytes
 * @returns The validated size
 */
export function validateFileSize(
  size: number,
  maxSize: number = SECURITY_LIMITS.MAX_FILE_SIZE,
): number {
  if (typeof size !== "number" || isNaN(size) || size < 0) {
    throw new Error("File size must be a non-negative number")
  }

  if (size > maxSize) {
    throw new Error(
      `File size ${size} bytes exceeds maximum allowed size of ${maxSize} bytes`,
    )
  }

  return size
}

/**
 * Validates URL length to prevent memory exhaustion
 * @param url - The URL string to validate
 * @returns The validated URL string
 */
export function validateUrlLength(url: string): string {
  return validateStringLength(url, SECURITY_LIMITS.MAX_URL_LENGTH, "URL")
}

/**
 * Creates a rate limiter function to prevent DoS attacks
 * @param maxRequests - Maximum requests allowed per window
 * @param windowMs - Time window in milliseconds
 * @returns Rate limiter function
 */
export function createRateLimiter(maxRequests: number, windowMs: number) {
  const requests = new Map<string, { count: number; resetTime: number }>()

  return function rateLimit(identifier: string): boolean {
    const now = Date.now()
    const record = requests.get(identifier)

    if (!record || now > record.resetTime) {
      // Reset or create new record
      requests.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      })
      return true
    }

    if (record.count >= maxRequests) {
      return false // Rate limit exceeded
    }

    record.count++
    return true
  }
}
