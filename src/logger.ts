/**
 * Logging utilities for fetch-gate
 */

import pino, { type Logger, type LoggerOptions } from "pino"
import type { CircuitBreakerResult, CircuitState } from "./types"

/**
 * Default logger configuration optimized for production use
 */
export const DEFAULT_LOGGER_CONFIG: LoggerOptions = {
  level: process.env.LOG_LEVEL || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label }
    },
  },
  serializers: {
    req: (req: Request) => ({
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries()),
    }),
    res: (res: Response) => ({
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
    }),
    error: pino.stdSerializers.err,
  },
}

/**
 * Creates a default logger instance with recommended settings for fetch-gate
 */
export function createDefaultLogger(options?: LoggerOptions): Logger {
  return pino({
    ...DEFAULT_LOGGER_CONFIG,
    ...options,
  })
}

/**
 * Creates a no-op logger that doesn't output anything (useful for testing or when logging is disabled)
 */
export function createSilentLogger(): Logger {
  return pino({ enabled: false })
}

/**
 * Logging context for structured logging
 */
export interface LogContext {
  requestId?: string
  method?: string
  url?: string
  baseUrl?: string
  timeout?: number
  circuitBreakerState?: CircuitState
  executionTime?: number
  [key: string]: any
}

/**
 * Proxy-specific logging methods with structured context
 */
export class ProxyLogger {
  constructor(private logger: Logger) {}

  /**
   * Log request start
   */
  logRequestStart(req: Request, context: LogContext = {}) {
    try {
      this.logger.info(
        {
          req,
          ...context,
          event: "request_start",
        },
        `Starting ${req.method} request to ${req.url}`,
      )
    } catch (error) {
      // Silently handle logger errors to prevent proxy breakage
      console.warn("Logger error in logRequestStart:", error)
    }
  }

  /**
   * Log successful response
   */
  logRequestSuccess(req: Request, res: Response, context: LogContext = {}) {
    try {
      this.logger.info(
        {
          req,
          res,
          ...context,
          event: "request_success",
        },
        `Request completed successfully: ${res.status} ${res.statusText}`,
      )
    } catch (error) {
      // Silently handle logger errors to prevent proxy breakage
      console.warn("Logger error in logRequestSuccess:", error)
    }
  }

  /**
   * Log request error
   */
  logRequestError(req: Request, error: Error, context: LogContext = {}) {
    try {
      this.logger.error(
        {
          req,
          error,
          ...context,
          event: "request_error",
        },
        `Request failed: ${error.message}`,
      )
    } catch (logError) {
      // Silently handle logger errors to prevent proxy breakage
      console.warn("Logger error in logRequestError:", logError)
    }
  }

  /**
   * Log circuit breaker events
   */
  logCircuitBreakerEvent(
    event:
      | "execution_start"
      | "execution_success"
      | "execution_failure"
      | "state_change",
    req: Request,
    result?: CircuitBreakerResult,
    context: LogContext = {},
  ) {
    try {
      const level =
        event === "execution_failure" || event === "state_change"
          ? "warn"
          : "debug"

      this.logger[level](
        {
          req,
          circuitBreaker: result
            ? {
                state: result.state,
                failureCount: result.failureCount,
                executionTime: result.executionTimeMs,
                success: result.success,
              }
            : undefined,
          ...context,
          event: `circuit_breaker_${event}`,
        },
        `Circuit breaker ${event}: ${result?.state || "unknown"}`,
      )
    } catch (error) {
      // Silently handle logger errors to prevent proxy breakage
      console.warn("Logger error in logCircuitBreakerEvent:", error)
    }
  }

  /**
   * Log security validation events
   */
  logSecurityEvent(
    type:
      | "header_validation"
      | "query_validation"
      | "method_validation"
      | "protocol_validation"
      | "path_validation",
    req: Request,
    details: string,
    context: LogContext = {},
  ) {
    try {
      this.logger.warn(
        {
          req,
          security: {
            type,
            details,
          },
          ...context,
          event: "security_validation",
        },
        `Security validation failed: ${type} - ${details}`,
      )
    } catch (error) {
      // Silently handle logger errors to prevent proxy breakage
      console.warn("Logger error in logSecurityEvent:", error)
    }
  }

  /**
   * Log performance metrics
   */
  logPerformanceMetrics(
    req: Request,
    metrics: {
      totalTime: number
      circuitBreakerTime?: number
      networkTime?: number
      cacheHit?: boolean
    },
    context: LogContext = {},
  ) {
    try {
      this.logger.debug(
        {
          req,
          performance: metrics,
          ...context,
          event: "performance_metrics",
        },
        `Request performance: ${metrics.totalTime}ms total`,
      )
    } catch (error) {
      // Silently handle logger errors to prevent proxy breakage
      console.warn("Logger error in logPerformanceMetrics:", error)
    }
  }

  /**
   * Log cache operations
   */
  logCacheEvent(
    event: "hit" | "miss" | "set" | "eviction",
    key: string,
    context: LogContext = {},
  ) {
    try {
      this.logger.debug(
        {
          cache: {
            event,
            key,
          },
          ...context,
          event: "cache_operation",
        },
        `Cache ${event}: ${key}`,
      )
    } catch (error) {
      // Silently handle logger errors to prevent proxy breakage
      console.warn("Logger error in logCacheEvent:", error)
    }
  }

  /**
   * Log timeout events
   */
  logTimeout(req: Request, timeout: number, context: LogContext = {}) {
    try {
      this.logger.warn(
        {
          req,
          timeout,
          ...context,
          event: "request_timeout",
        },
        `Request timed out after ${timeout}ms`,
      )
    } catch (error) {
      // Silently handle logger errors to prevent proxy breakage
      console.warn("Logger error in logTimeout:", error)
    }
  }

  /**
   * Get the underlying Pino logger for custom logging
   */
  getLogger(): Logger {
    return this.logger
  }
}

/**
 * Creates a ProxyLogger instance with the given logger
 */
export function createProxyLogger(logger: Logger): ProxyLogger {
  return new ProxyLogger(logger)
}
