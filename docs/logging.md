# Logging Configuration Guide

The fetch-gate library includes comprehensive logging capabilities using [Pino](https://github.com/pinojs/pino), a fast and low-overhead logging library for Node.js.

## Table of Contents

- [Basic Usage](#basic-usage)
- [Logger Configuration](#logger-configuration)
- [Log Levels](#log-levels)
- [Event Types](#event-types)
- [Production Setup](#production-setup)
- [Development Setup](#development-setup)
- [Custom Serializers](#custom-serializers)
- [Security Considerations](#security-considerations)

## Basic Usage

### Default Logger

The simplest way to enable logging is to use the default logger:

```typescript
import { FetchProxy } from "fetch-gate"

const proxy = new FetchProxy({
  // Default logger is automatically configured
})
```

The default logger uses:

- **Level**: `info` in production, `debug` in development
- **Format**: JSON in production, pretty-printed in development
- **Output**: stdout

### Custom Logger

You can provide your own Pino logger instance:

```typescript
import { FetchProxy } from "fetch-gate"
import pino from "pino"

const logger = pino({
  level: "warn",
  transport: {
    target: "pino/file",
    options: { destination: "./proxy.log" },
  },
})

const proxy = new FetchProxy({
  logger: logger,
})
```

## Logger Configuration

### ProxyOptions

```typescript
interface ProxyOptions {
  logger?: Logger // Pino logger instance
  // ... other options
}
```

### ProxyRequestOptions

```typescript
interface ProxyRequestOptions extends RequestInit {
  logger?: Logger // Override proxy-level logger for specific requests
  // ... other options
}
```

## Log Levels

The library uses the following log levels according to Pino standards:

| Level   | Numeric | Usage                                  |
| ------- | ------- | -------------------------------------- |
| `trace` | 10      | Very detailed debugging information    |
| `debug` | 20      | Debugging information                  |
| `info`  | 30      | General information about operations   |
| `warn`  | 40      | Warning conditions                     |
| `error` | 50      | Error conditions                       |
| `fatal` | 60      | Critical errors that cause termination |

### Setting Log Levels

```typescript
const logger = pino({ level: "info" })
```

## Event Types

The library logs various types of events:

### Request Lifecycle Events

```typescript
// Request start (info level)
{
  "event": "request_start",
  "requestId": "req-123",
  "method": "GET",
  "url": "https://api.example.com/data",
  "timestamp": "2024-01-01T12:00:00.000Z"
}

// Request success (info level)
{
  "event": "request_success",
  "requestId": "req-123",
  "status": 200,
  "duration": 250,
  "cacheHit": false
}

// Request error (error level)
{
  "event": "request_error",
  "requestId": "req-123",
  "error": "Network timeout",
  "duration": 5000
}
```

### Security Events

```typescript
// Protocol validation (warn level)
{
  "event": "security_protocol_validation",
  "requestId": "req-123",
  "protocol": "file:",
  "message": "Unsupported protocol detected"
}

// Header injection attempt (warn level)
{
  "event": "security_header_validation",
  "requestId": "req-123",
  "headerName": "X-Custom",
  "issue": "CRLF injection attempt"
}
```

### Circuit Breaker Events

```typescript
// Circuit breaker state change (warn level)
{
  "event": "circuit_breaker_state_change",
  "requestId": "req-123",
  "previousState": "closed",
  "newState": "open",
  "errorRate": 0.6,
  "errorCount": 6,
  "totalCount": 10
}
```

### Performance Events

```typescript
// Performance metrics (debug level)
{
  "event": "performance_metrics",
  "requestId": "req-123",
  "timing": {
    "total": 250,
    "dns": 10,
    "tcp": 20,
    "request": 50,
    "response": 170
  }
}
```

### Cache Events

```typescript
// Cache operations (debug level)
{
  "event": "cache_operation",
  "requestId": "req-123",
  "operation": "hit",
  "key": "GET:https://api.example.com/data",
  "age": 1500
}
```

## Production Setup

For production environments, configure structured logging with appropriate levels:

```typescript
import pino from "pino"

const productionLogger = pino({
  level: "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
    log: (object) => ({
      ...object,
      service: "fetch-gate",
      environment: "production",
    }),
  },
  // Redact sensitive information
  redact: ["password", "token", "authorization", "cookie"],
  // File output for log aggregation
  transport: {
    target: "pino/file",
    options: {
      destination: "./logs/proxy.log",
      mkdir: true,
    },
  },
})
```

### Log Rotation

For production log rotation, use `pino-roll`:

```bash
npm install pino-roll
```

```typescript
const logger = pino({
  level: "info",
  transport: {
    target: "pino-roll",
    options: {
      file: "./logs/proxy.log",
      frequency: "daily",
      size: "10m",
    },
  },
})
```

## Development Setup

For development, use pretty-printed logs with detailed information:

```typescript
const developmentLogger = pino({
  level: "debug",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
      ignore: "pid,hostname",
      messageFormat: "{msg} [{requestId}]",
    },
  },
})
```

## Custom Serializers

Customize how objects are logged:

```typescript
const logger = pino({
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: sanitizeHeaders(req.headers),
    }),
    res: (res) => ({
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
    }),
    err: pino.stdSerializers.err,
  },
})

function sanitizeHeaders(headers) {
  const sanitized = { ...headers }
  // Remove sensitive headers
  delete sanitized.authorization
  delete sanitized.cookie
  return sanitized
}
```

## Security Considerations

### Sensitive Data Redaction

Always redact sensitive information in logs:

```typescript
const logger = pino({
  redact: {
    paths: [
      "password",
      "token",
      "authorization",
      "cookie",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
})
```

### Log Level in Production

Use appropriate log levels to avoid logging sensitive debugging information:

```typescript
// Production: Only log important events
const prodLogger = pino({ level: "warn" })

// Development: Log everything for debugging
const devLogger = pino({ level: "trace" })
```

### Structured Logging for Security

Use structured logging for security events to enable easy monitoring:

```typescript
// Good: Structured security event
logger.warn({
  event: "security_validation_failed",
  requestId: "req-123",
  validationType: "header_injection",
  attemptedValue: "malicious\r\nheader",
})

// Avoid: Unstructured security logs
logger.warn("Header validation failed for request req-123")
```

## Monitoring Integration

### Application Performance Monitoring (APM)

Integrate with APM tools by adding custom hooks:

```typescript
const apmLogger = pino({
  hooks: {
    logMethod(inputArgs, method, level) {
      if (level >= 50) {
        // Error level
        // Send to APM/monitoring system
        apm.captureError(new Error(inputArgs[0]))
      }
      return method.apply(this, inputArgs)
    },
  },
})
```

### Metrics Collection

Extract metrics from logs for monitoring dashboards:

```typescript
const metricsLogger = pino({
  formatters: {
    log: (object) => ({
      ...object,
      // Add correlation IDs for tracing
      traceId: getTraceId(),
      // Add environment context
      environment: process.env.NODE_ENV,
      version: process.env.APP_VERSION,
    }),
  },
})
```

## Examples

See the [examples directory](../examples/logger-examples.ts) for complete configuration examples including:

- Basic setup
- Production configuration
- Development configuration
- Structured logging
- Custom serializers
- Monitoring integration

## Troubleshooting

### Common Issues

1. **Logs not appearing**: Check log level configuration
2. **Performance impact**: Use appropriate log levels for production
3. **Sensitive data in logs**: Configure redaction properly
4. **Log rotation**: Set up proper log rotation for production

### Debug Mode

Enable debug mode to see all logging events:

```typescript
const debugProxy = new FetchProxy({
  logger: pino({ level: "trace" }),
})
```

This will log all events including detailed request/response information and internal operations.
