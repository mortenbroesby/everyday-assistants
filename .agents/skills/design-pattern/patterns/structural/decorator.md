# Decorator

## When to Use

- You need to add behavior dynamically without modifying the original class
- Inheritance would create too many subclasses for behavior combinations
- You want runtime composition of behaviors such as logging, caching, auth, or compression

## Key Principles

- **Open/Closed**: Extend behavior through wrappers
- **Single Responsibility**: Each decorator adds one concern

## Example

```typescript
// Core interface
interface DataSource {
  read(): string;
  write(data: string): void;
}

// Base implementation
class FileDataSource implements DataSource {
  private data = "";

  read(): string {
    return this.data;
  }

  write(data: string): void {
    this.data = data;
  }
}

// Decorator base class
abstract class DataSourceDecorator implements DataSource {
  constructor(protected wrapped: DataSource) {}

  read(): string { return this.wrapped.read(); }
  write(data: string): void { this.wrapped.write(data); }
}

// Concrete decorator — encryption
class EncryptionDecorator extends DataSourceDecorator {
  write(data: string): void {
    const encrypted = Buffer.from(data).toString("base64");
    super.write(encrypted);
  }

  read(): string {
    const data = super.read();
    return Buffer.from(data, "base64").toString("utf-8");
  }
}

// Concrete decorator — logging
class LoggingDecorator extends DataSourceDecorator {
  write(data: string): void {
    console.log(`[LOG] Writing ${data.length} chars`);
    super.write(data);
  }

  read(): string {
    console.log("[LOG] Reading data");
    return super.read();
  }
}

// Usage — flexible decorator composition
let source: DataSource = new FileDataSource();
source = new EncryptionDecorator(source); // encrypt first
source = new LoggingDecorator(source);    // then add logging

source.write("sensitive data");
console.log(source.read()); // "sensitive data" (auto-decoded)
```
