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
  validateHttpMethod,
} from "./utils"
import {
  createDefaultLogger,
  createSilentLogger,
  createProxyLogger,
  type ProxyLogger,
} from "./logger"
import type {
  ProxyOptions,
  ProxyRequestOptions,
  CircuitState,
  CircuitBreakerResult,
} from "./types"
import type { Logger } from "pino"

export class FetchProxy {
  private options: Required<Omit<ProxyOptions, "logger">> & { logger: Logger }
  private circuitBreaker: CircuitBreaker
  private urlCache: URLCache
  private proxyLogger: ProxyLogger

  constructor(options: ProxyOptions = {}) {
    // Create logger instance - use provided logger or create default
    const logger = options.logger || createDefaultLogger()

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
      logger,
    }

    this.circuitBreaker = new CircuitBreaker(this.options.circuitBreaker)
    this.urlCache = new URLCache(this.options.cacheURLs)
    this.proxyLogger = createProxyLogger(logger)
  }

  async proxy(
    req: Request,
    source?: string,
    options: ProxyRequestOptions = {},
  ): Promise<Response> {
    const startTime = Date.now()
    const requestId = crypto.randomUUID()

    // Get logger instance (use request-specific logger if provided, otherwise use global)
    const currentLogger = options.logger
      ? createProxyLogger(options.logger)
      : this.proxyLogger

    // Initial request logging
    currentLogger.logRequestStart(req, {
      requestId,
      baseUrl: options.base || this.options.base,
      timeout: options.timeout || this.options.timeout,
      source,
    })

    try {
      // Execute before request hooks
      await this.executeBeforeRequestHooks(req, options)

      // Execute before circuit breaker hooks
      await this.executeBeforeCircuitBreakerHooks(req, options)

      // Log circuit breaker execution start
      currentLogger.logCircuitBreakerEvent("execution_start", req, undefined, {
        requestId,
        circuitBreakerState: this.circuitBreaker.getState(),
      })

      const response = await this.circuitBreaker.execute(async () => {
        const res = await this.executeRequest(
          req,
          source,
          options,
          currentLogger,
          requestId,
        )

        // Check if response indicates a server error (should count as circuit breaker failure)
        if (res.status >= 500) {
          throw new Error(`Server error: ${res.status} ${res.statusText}`)
        }

        return res
      })

      // Execute circuit breaker completion hooks
      const executionTime = Date.now() - startTime
      // Log circuit breaker success
      currentLogger.logCircuitBreakerEvent(
        "execution_success",
        req,
        {
          success: true,
          state: this.circuitBreaker.getState(),
          failureCount: this.circuitBreaker.getFailures(),
          executionTimeMs: executionTime,
        },
        { requestId },
      )

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

      // Log performance metrics
      currentLogger.logPerformanceMetrics(
        req,
        {
          totalTime: executionTime,
          circuitBreakerTime: executionTime,
        },
        { requestId },
      )

      return response
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      const executionTime = Date.now() - startTime

      // Log circuit breaker failure
      currentLogger.logCircuitBreakerEvent(
        "execution_failure",
        req,
        {
          success: false,
          error: err,
          state: this.circuitBreaker.getState(),
          failureCount: this.circuitBreaker.getFailures(),
          executionTimeMs: executionTime,
        },
        { requestId },
      )

      // Log request error
      currentLogger.logRequestError(req, err, { requestId, executionTime })

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
      } else if (
        err.message.includes("HTTP method") ||
        err.message.includes("Unsupported protocol") ||
        err.message.includes("Protocol override not allowed") ||
        err.message.includes("Domain override not allowed") ||
        err.message.includes("Invalid header") ||
        err.message.includes("forbidden characters")
      ) {
        return new Response(`Bad Request: ${err.message}`, { status: 400 })
      } else {
        return new Response("Bad Gateway", { status: 502 })
      }
    }
  }

  private async executeRequest(
    req: Request,
    source?: string,
    options: ProxyRequestOptions = {},
    logger?: ProxyLogger,
    requestId?: string,
  ): Promise<Response> {
    const currentLogger = logger || this.proxyLogger
    const networkStartTime = Date.now()

    // Declare variables in the method scope
    const timeout = options.timeout ?? this.options.timeout
    const controller = new AbortController()
    let timeoutId: NodeJS.Timeout | undefined

    try {
      // Validate HTTP method for security
      validateHttpMethod(req.method, currentLogger, requestId, req)

      // Build target URL
      const targetUrl = this.buildTargetURL(
        source || req.url,
        options.base,
        currentLogger,
        requestId,
        req,
      )

      // Log URL cache operation
      const cacheKey = `${options.base || this.options.base}:${source || req.url}`
      const cacheHit = this.urlCache.get(cacheKey) !== undefined
      currentLogger.logCacheEvent(cacheHit ? "hit" : "miss", cacheKey, {
        requestId,
      })

      // Prepare headers
      const requestHeaders = this.prepareHeaders(req, options)

      // Prepare request options
      const requestOptions = this.prepareRequestOptions(
        req,
        requestHeaders,
        options,
        currentLogger,
        requestId,
      )

      // Add query string if provided
      const finalUrl = this.addQueryString(
        targetUrl,
        options.queryString,
        currentLogger,
        requestId,
        req,
      )

      // Execute fetch with timeout
      timeoutId = setTimeout(() => {
        controller.abort()
        currentLogger.logTimeout(req, timeout, { requestId })
      }, timeout)

      let response = await fetch(finalUrl.toString(), {
        ...requestOptions,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const networkTime = Date.now() - networkStartTime

      // Handle redirects manually if needed
      if (
        !this.options.followRedirects &&
        response.status >= 300 &&
        response.status < 400
      ) {
        // Log successful response
        currentLogger.logRequestSuccess(req, response, {
          requestId,
          networkTime,
          circuitBreakerState: this.circuitBreaker.getState(),
        })
        return response
      }

      // Log successful response
      currentLogger.logRequestSuccess(req, response, {
        requestId,
        networkTime,
        circuitBreakerState: this.circuitBreaker.getState(),
      })

      // Execute after response hooks
      await this.executeAfterResponseHooks(req, response, options)

      return response
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      const err =
        error instanceof Error
          ? error
          : new Error(
              typeof error === "object" && error !== null && "message" in error
                ? String(error.message)
                : typeof error === "object" && error !== null
                  ? JSON.stringify(error)
                  : String(error),
            )

      if (err.name === "AbortError") {
        const timeoutError = new Error("Request timeout")
        currentLogger.logRequestError(req, timeoutError, {
          requestId,
          timeout: timeout,
        })
        throw timeoutError
      }

      // Log other request errors
      currentLogger.logRequestError(req, err, {
        requestId,
        networkTime: Date.now() - networkStartTime,
      })
      throw err
    }
  }

  private buildTargetURL(
    source: string,
    base?: string,
    logger?: ProxyLogger,
    requestId?: string,
    req?: Request,
  ): URL {
    const cacheKey = `${base || this.options.base}:${source}`
    let url = this.urlCache.get(cacheKey)

    if (!url) {
      url = buildURL(source, base || this.options.base, logger, requestId, req)
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
    logger?: ProxyLogger,
    requestId?: string,
  ): RequestInit {
    const requestOptions: RequestInit = {
      method: req.method,
      headers: recordToHeaders(headers, logger, requestId, req),
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
    logger?: ProxyLogger,
    requestId?: string,
    req?: Request,
  ): URL {
    if (!queryString) return url

    const newUrl = new URL(url.toString())

    // Build the new query string with validation
    const queryStr = buildQueryString(queryString, logger, requestId, req)

    if (queryStr) {
      // For security, we'll merge by reconstructing the entire query string
      // rather than using URLSearchParams which can decode dangerous characters

      const existingSearch = newUrl.search
      const newSearch = queryStr.slice(1) // Remove leading '?'

      if (existingSearch) {
        // Merge existing and new parameters
        // Use direct string concatenation to preserve encoding
        newUrl.search = existingSearch + "&" + newSearch
      } else {
        newUrl.search = newSearch
      }
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
