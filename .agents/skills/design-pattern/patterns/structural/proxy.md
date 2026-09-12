# Proxy

## When to Use

- **Virtual proxy**: Lazily load expensive objects (large files, remote resources)
- **Protection proxy**: Enforce access control before forwarding calls
- **Caching proxy**: Cache expensive operation results
- **Logging proxy**: Audit access and behavior

## Key Principles

- **Open/Closed**: Enhance behavior through indirection, not source edits
- **Liskov Substitution**: Proxy and real subject share the same interface

## Example

```typescript
// Subject interface
interface ImageLoader {
  load(url: string): Promise<Buffer>;
}

// Real subject — always performs network fetch
class RemoteImageLoader implements ImageLoader {
  async load(url: string): Promise<Buffer> {
    console.log(`Fetching ${url} from network...`);
    // Simulated network request
    return Buffer.from(`image-data-for-${url}`);
  }
}

// Caching proxy
class CachingImageProxy implements ImageLoader {
  private cache = new Map<string, Buffer>();

  constructor(private real: ImageLoader) {}

  async load(url: string): Promise<Buffer> {
    if (this.cache.has(url)) {
      console.log(`Cache hit for ${url}`);
      return this.cache.get(url)!;
    }

    const data = await this.real.load(url);
    this.cache.set(url, data);
    return data;
  }
}

// Usage
const loader: ImageLoader = new CachingImageProxy(new RemoteImageLoader());

await loader.load("https://example.com/photo.jpg"); // Fetching from network...
await loader.load("https://example.com/photo.jpg"); // Cache hit
```
