# Builder

## When to Use

- Object construction is complex, requiring multiple steps or many optional parameters
- The same construction process should produce different representations (e.g., HTML report vs PDF report)
- You want to avoid telescoping constructors (constructors with too many parameters)

## Key Principles

- **Single Responsibility**: The Builder encapsulates construction logic; the Director controls the build flow
- **Open/Closed**: Add a new Builder implementation to produce a new product representation

## Example

```typescript
class HttpRequest {
  method: string = "GET";
  url: string = "";
  headers: Record<string, string> = {};
  body?: string;
  timeout: number = 30000;
}

class HttpRequestBuilder {
  private request = new HttpRequest();

  setMethod(method: string): this {
    this.request.method = method;
    return this;
  }

  setUrl(url: string): this {
    this.request.url = url;
    return this;
  }

  addHeader(key: string, value: string): this {
    this.request.headers[key] = value;
    return this;
  }

  setBody(body: string): this {
    this.request.body = body;
    return this;
  }

  setTimeout(ms: number): this {
    this.request.timeout = ms;
    return this;
  }

  build(): HttpRequest {
    if (!this.request.url) {
      throw new Error("URL is required");
    }
    return { ...this.request };
  }
}

// Usage — fluent chaining for readability
const request = new HttpRequestBuilder()
  .setMethod("POST")
  .setUrl("https://api.example.com/users")
  .addHeader("Content-Type", "application/json")
  .addHeader("Authorization", "Bearer token123")
  .setBody(JSON.stringify({ name: "Alice" }))
  .setTimeout(5000)
  .build();
```
