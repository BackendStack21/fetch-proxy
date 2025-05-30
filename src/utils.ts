/**
 * Utility functions for URL building, header manipulation, and query string handling
 */

import { URL } from "url"

/**
 * Builds a URL from source and optional base
 */
export function buildURL(source: string, base?: string): URL {
  // Handle relative URLs with multiple leading slashes for security
  if (!source.includes("://") && source.startsWith("/")) {
    source = source.replace(/^\/+/, "/")
  }

  if (base) {
    return new URL(source, base)
  }

  return new URL(source)
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
 * Converts plain object to Headers object
 */
export function recordToHeaders(record: Record<string, string>): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(record)) {
    headers.set(key, value)
  }
  return headers
}

/**
 * Builds query string from parameters
 */
export function buildQueryString(params: Record<string, any> | string): string {
  if (typeof params === "string") {
    return params.startsWith("?") ? params : `?${params}`
  }

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, String(v)))
    } else {
      searchParams.set(key, String(value))
    }
  }

  const result = searchParams.toString()
  return result ? `?${result}` : ""
}
