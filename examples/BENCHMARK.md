# Local Gateway Server Benchmark

This example demonstrates how to benchmark the performance of the fetch-proxy library by creating two local HTTP servers:

1. **Backend Server** (port 3001) - Simulates a real API service
2. **Gateway Server** (port 3000) - Uses fetch-proxy to proxy requests to the backend

## Running the Benchmark

```bash
npm run example:benchmark
```

## Available Endpoints

### Backend Endpoints (via Gateway)

- `GET /api/small` - Small JSON response (~200 bytes)
- `GET /api/medium` - Medium JSON response (~100 items, ~5KB)
- `GET /api/large` - Large JSON response (~1000 items, ~50KB)
- `GET /api/error` - Randomly returns 500 errors (30% failure rate)
- `GET /api/slow` - Slow response with 100ms delay
- `GET /api/health` - Health check endpoint

### Gateway-Specific Endpoints

- `GET /stats` - Performance statistics and metrics
- `GET /reset` - Reset performance statistics
- `GET /benchmark` - Run automated benchmark tests

## Benchmark Examples

### Small Response Benchmark

```bash
curl 'http://localhost:3000/benchmark?iterations=100&concurrency=10&endpoint=/api/small'
```

### Medium Response Benchmark

```bash
curl 'http://localhost:3000/benchmark?iterations=50&concurrency=5&endpoint=/api/medium'
```

### Large Response Benchmark

```bash
curl 'http://localhost:3000/benchmark?iterations=20&concurrency=3&endpoint=/api/large'
```

### Error Handling Benchmark

```bash
curl 'http://localhost:3000/benchmark?iterations=50&concurrency=5&endpoint=/api/error'
```

## Performance Monitoring

### View Current Statistics

```bash
curl http://localhost:3000/stats
```

Example output:

```json
{
  "gateway": {
    "totalRequests": 156,
    "errorCount": 3,
    "averageLatency": 12.5,
    "circuitBreakerState": "CLOSED",
    "circuitBreakerFailures": 0
  },
  "recentLatencies": [15, 12, 18, 9, 14, 11, 16, 13, 10, 12],
  "timestamp": "2025-05-30T18:47:34.637Z"
}
```

### Reset Statistics

```bash
curl http://localhost:3000/reset
```

## Performance Comparison

Compare direct backend access vs gateway proxying:

```bash
# Direct backend access
time curl -s http://localhost:3001/api/small > /dev/null

# Via fetch-proxy gateway
time curl -s http://localhost:3000/api/small > /dev/null
```

## Circuit Breaker Testing

Test the circuit breaker by making multiple requests to the error endpoint:

```bash
for i in {1..10}; do
  echo "Request $i:"
  curl -s http://localhost:3000/api/error | head -c 100
  echo
done
```

## Features Demonstrated

1. **Performance Metrics** - Request counting, latency tracking, error monitoring
2. **Circuit Breaker** - Automatic failure detection and recovery
3. **Header Management** - Request ID tracking, timestamp headers
4. **Concurrent Benchmarking** - Configurable concurrency and iteration counts
5. **Error Handling** - Graceful degradation and error reporting
6. **Memory Efficiency** - Sliding window for latency tracking

## Benchmark Parameters

- `iterations` - Number of requests to make (default: 100)
- `concurrency` - Number of concurrent requests (default: 10)
- `endpoint` - Target endpoint to benchmark (default: /api/small)

## Expected Performance

On a typical development machine, you can expect:

- **Small responses**: 200-500 requests/second
- **Medium responses**: 100-300 requests/second
- **Large responses**: 50-150 requests/second
- **Gateway overhead**: ~1-2ms additional latency

Performance will vary based on:

- System resources (CPU, memory)
- Network conditions
- Concurrent load
- Response sizes
- Backend processing time

## Use Cases

This benchmark example is useful for:

1. **Performance Testing** - Measure fetch-proxy overhead
2. **Load Testing** - Test gateway behavior under load
3. **Circuit Breaker Validation** - Verify fault tolerance
4. **Latency Analysis** - Understand response time patterns
5. **Capacity Planning** - Determine optimal configuration
