import { FetchProxy } from "../src/index"
import pino from "pino"

// Example 1: Basic logger setup with default configuration
const basicProxy = new FetchProxy({
  // Uses default logger configuration (info level, pretty printing in dev)
})

// Example 2: Custom logger with production configuration
const productionLogger = pino({
  level: "warn",
  transport: {
    target: "pino/file",
    options: { destination: "./proxy.log" },
  },
})

const productionProxy = new FetchProxy({
  logger: productionLogger,
})

// Example 3: Development logger with detailed debugging
// Simple version without additional dependencies
const developmentLogger = pino({
  level: "debug",
  transport: {
    target: "pino/file",
    options: { destination: 1 }, // stdout
  },
})

// Alternative with pino-pretty (requires: npm install pino-pretty)
// Uncomment when pino-pretty is installed:
/*
const developmentLoggerPretty = pino({
  level: "debug",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
      ignore: "pid,hostname",
    },
  },
})
*/

const devProxy = new FetchProxy({
  logger: developmentLogger, // Use developmentLoggerPretty if pino-pretty is installed
})

// Example 4: Custom logger with structured logging
const structuredLogger = pino({
  level: "info",
  formatters: {
    level: (label) => ({ level: label }),
    log: (object) => ({ ...object, service: "fetch-gate" }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ["password", "token", "authorization"],
})

const structuredProxy = new FetchProxy({
  logger: structuredLogger,
  timeout: 5000,
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeout: 30000,
    enabled: true,
  },
})

// Example 5: Logger with custom serializers for enhanced debugging
const debugLogger = pino({
  level: "trace",
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
    }),
    res: (res) => ({
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
    }),
    err: pino.stdSerializers.err,
  },
})

const debugProxy = new FetchProxy({
  logger: debugLogger,
})

// Example usage with logging
async function exampleUsage() {
  try {
    console.log("Making request with production proxy...")
    const request = new Request("https://api.example.com/data", {
      method: "GET",
      headers: {
        "User-Agent": "fetch-gate-example/1.0",
      },
    })

    const response = await productionProxy.proxy(request)

    console.log("Response received:", response.status)
  } catch (error) {
    console.error("Request failed:", error)
  }
}

// Example with request-specific logger options
async function requestSpecificLogging() {
  const customRequestLogger = pino({
    level: "debug",
    // Note: Using console transport instead of pino-pretty to avoid dependency requirement
    transport: {
      target: "pino/file",
      options: { destination: 1 }, // stdout
    },
  })

  const request = new Request("https://httpbin.org/json", {
    method: "GET",
  })

  const response = await basicProxy.proxy(request, undefined, {
    logger: customRequestLogger, // Override proxy-level logger for this request
  })

  return response
}

// Example: Monitoring and alerting setup
const monitoringLogger = pino({
  level: "info",
  hooks: {
    logMethod(inputArgs, method, level) {
      // Custom hook for monitoring/alerting
      if (level >= 50) {
        // Error level
        // Send to monitoring system
        console.error("ALERT: Proxy error detected", inputArgs[0])
      }
      return method.apply(this, inputArgs)
    },
  },
})

const monitoringProxy = new FetchProxy({
  logger: monitoringLogger,
  circuitBreaker: {
    failureThreshold: 5,
    timeout: 60000,
    resetTimeout: 30000,
  },
})

export {
  basicProxy,
  productionProxy,
  devProxy,
  structuredProxy,
  debugProxy,
  monitoringProxy,
  exampleUsage,
  requestSpecificLogging,
}
