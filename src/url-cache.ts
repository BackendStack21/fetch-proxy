/**
 * LRU-based URL cache for performance optimization
 */

export class URLCache {
  private cache = new Map<string, URL>()
  private maxSize: number

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize
  }

  get(key: string): URL | undefined {
    if (this.maxSize === 0) return undefined
    return this.cache.get(key)
  }

  set(key: string, url: URL): void {
    if (this.maxSize === 0) return

    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, url)
  }

  clear(): void {
    this.cache.clear()
  }
}
