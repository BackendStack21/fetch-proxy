/**
 * Main FetchProxy class implementation
 */

import { URL } from "url"
import { CircuitBreaker } from "./circuit-breaker"
import { URLCache } from "./url-cache"
import {
  buildURL,
  headersToRecord,
  recordToHeaders,
  buildQueryString,
} from "./utils"
import type {
  ProxyOptions,
  ProxyRequestOptions,
  CircuitState,
  CircuitBreakerResult,
} from "./types"

export class FetchProxy {
  private options: Required<ProxyOptions>
  private circuitBreaker: CircuitBreaker
  private urlCache: URLCache

  constructor(options: ProxyOptions = {}) {
    this.options = {
      base: options.base || "",
      timeout: options.timeout ?? 30000,
      circuitBreaker: {
        failureThreshold: options.circuitBreaker?.failureThreshold ?? 5,
        resetTimeout: options.circuitBreaker?.resetTimeout ?? 60000,
        timeout: options.circuitBreaker?.timeout ?? 5000,
        enabled: options.circuitBreaker?.enabled ?? true,
      },
      cacheURLs: options.cacheURLs ?? 100,
      headers: options.headers || {},
      followRedirects: options.followRedirects ?? false,
      maxRedirects: options.maxRedirects ?? 5,
    }

    this.circuitBreaker = new CircuitBreaker(this.options.circuitBreaker)
    this.urlCache = new URLCache(this.options.cacheURLs)
  }

  async proxy(
    req: Request,
    source?: string,
    options: ProxyRequestOptions = {},
  ): Promise<Response> {
    const startTime = Date.now() // Move startTime to outer scope

    try {
      // Execute before request hooks
      await this.executeBeforeRequestHooks(req, options)

      // Execute before circuit breaker hooks
      await this.executeBeforeCircuitBreakerHooks(req, options)

      const response = await this.circuitBreaker.execute(async () => {
        const res = await this.executeRequest(req, source, options)

        // Check if response indicates a server error (should count as circuit breaker failure)
        if (res.status >= 500) {
          throw new Error(`Server error: ${res.status} ${res.statusText}`)
        }

        return res
      })

      // Execute circuit breaker completion hooks
      const executionTime = Date.now() - startTime
      await this.executeAfterCircuitBreakerHooks(
        req,
        {
          success: true,
          state: this.circuitBreaker.getState(),
          failureCount: this.circuitBreaker.getFailures(),
          executionTimeMs: executionTime,
        },
        options,
      )

      return response
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      const executionTime = Date.now() - startTime

      // Execute error hooks
      if (options.onError) {
        await options.onError(req, err)
      }

      // Execute circuit breaker completion hooks for failures
      await this.executeAfterCircuitBreakerHooks(
        req,
        {
          success: false,
          error: err,
          state: this.circuitBreaker.getState(),
          failureCount: this.circuitBreaker.getFailures(),
          executionTimeMs: executionTime,
        },
        options,
      )

      // Return appropriate error response
      if (err.message.includes("Circuit breaker is OPEN")) {
        return new Response("Service Unavailable", { status: 503 })
      } else if (
        err.message.includes("timeout") ||
        err.name === "TimeoutError"
      ) {
        return new Response("Gateway Timeout", { status: 504 })
      } else {
        return new Response("Bad Gateway", { status: 502 })
      }
    }
  }

  private async executeRequest(
    req: Request,
    source?: string,
    options: ProxyRequestOptions = {},
  ): Promise<Response> {
    // Build target URL
    const targetUrl = this.buildTargetURL(source || req.url, options.base)

    // Prepare headers
    const requestHeaders = this.prepareHeaders(req, options)

    // Prepare request options
    const requestOptions = this.prepareRequestOptions(
      req,
      requestHeaders,
      options,
    )

    // Add query string if provided
    const finalUrl = this.addQueryString(targetUrl, options.queryString)

    // Execute fetch with timeout
    const timeout = options.timeout ?? this.options.timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      let response = await fetch(finalUrl.toString(), {
        ...requestOptions,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Handle redirects manually if needed
      if (
        !this.options.followRedirects &&
        response.status >= 300 &&
        response.status < 400
      ) {
        return response
      }

      // Execute after response hooks
      await this.executeAfterResponseHooks(req, response, options)

      return response
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timeout")
      }

      throw error
    }
  }

  private buildTargetURL(source: string, base?: string): URL {
    const cacheKey = `${base || this.options.base}:${source}`
    let url = this.urlCache.get(cacheKey)

    if (!url) {
      url = buildURL(source, base || this.options.base)
      this.urlCache.set(cacheKey, url)
    }

    return new URL(url.toString()) // Create a new instance to avoid mutations
  }

  private prepareHeaders(
    req: Request,
    options: ProxyRequestOptions,
  ): Record<string, string> {
    // Start with original request headers
    const headers = headersToRecord(req.headers)

    // Add default headers
    Object.assign(headers, this.options.headers)

    // Add request-specific headers
    if (options.headers) {
      Object.assign(headers, options.headers)
    }

    // Set forwarded headers
    const url = new URL(req.url)
    headers["x-forwarded-host"] = headers.host || url.hostname

    // Remove content-length for GET/HEAD requests
    if (req.method === "GET" || req.method === "HEAD") {
      delete headers["content-length"]
    }

    return headers
  }

  private prepareRequestOptions(
    req: Request,
    headers: Record<string, string>,
    options: ProxyRequestOptions,
  ): RequestInit {
    const requestOptions: RequestInit = {
      method: req.method,
      headers: recordToHeaders(headers),
      ...options.request,
    }

    // Add body for non-GET/HEAD requests
    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      requestOptions.body = req.body
    }

    return requestOptions
  }

  private addQueryString(
    url: URL,
    queryString?: Record<string, any> | string,
  ): URL {
    if (!queryString) return url

    const newUrl = new URL(url.toString())
    const queryStr = buildQueryString(queryString)

    if (queryStr) {
      // Merge with existing query string
      const existingParams = new URLSearchParams(newUrl.search)
      const newParams = new URLSearchParams(queryStr.slice(1)) // Remove leading '?'

      newParams.forEach((value, key) => {
        existingParams.set(key, value)
      })

      newUrl.search = existingParams.toString()
    }

    return newUrl
  }

  getCircuitBreakerState(): CircuitState {
    return this.circuitBreaker.getState()
  }

  getCircuitBreakerFailures(): number {
    return this.circuitBreaker.getFailures()
  }

  clearURLCache(): void {
    this.urlCache.clear()
  }

  close(): void {
    this.clearURLCache()
  }

  /**
   * Execute before request hooks
   */
  private async executeBeforeRequestHooks(
    req: Request,
    options: ProxyRequestOptions,
  ): Promise<void> {
    if (options.beforeRequest) {
      await options.beforeRequest(req, options)
    }
  }

  /**
   * Execute before circuit breaker hooks
   */
  private async executeBeforeCircuitBreakerHooks(
    req: Request,
    options: ProxyRequestOptions,
  ): Promise<void> {
    if (options.beforeCircuitBreakerExecution) {
      await options.beforeCircuitBreakerExecution(req, options)
    }
  }

  /**
   * Execute after circuit breaker hooks
   */
  private async executeAfterCircuitBreakerHooks(
    req: Request,
    result: CircuitBreakerResult,
    options: ProxyRequestOptions,
  ): Promise<void> {
    if (options.afterCircuitBreakerExecution) {
      await options.afterCircuitBreakerExecution(req, result)
    }
  }

  /**
   * Execute after response hooks
   */
  private async executeAfterResponseHooks(
    req: Request,
    response: Response,
    options: ProxyRequestOptions,
  ): Promise<void> {
    if (options.afterResponse) {
      await options.afterResponse(req, response, response.body)
    }
  }
}
