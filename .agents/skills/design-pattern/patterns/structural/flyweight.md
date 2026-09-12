# Flyweight

## When to Use

- The system has many similar objects and memory usage is a bottleneck
- Most state can be externalized while a small immutable core can be shared
- You need object reuse across different contexts

## Key Principles

- **Single Responsibility**: Flyweights store intrinsic shared state only
- Intrinsic state is shared and immutable; extrinsic state is context-specific and passed by clients

## Example

```typescript
// Flyweight object — shared intrinsic state (text style)
class TextStyle {
  constructor(
    public readonly font: string,
    public readonly size: number,
    public readonly color: string
  ) {}
}

// Flyweight factory — ensure each style is created once
class TextStyleFactory {
  private cache = new Map<string, TextStyle>();

  getStyle(font: string, size: number, color: string): TextStyle {
    const key = `${font}-${size}-${color}`;
    if (!this.cache.has(key)) {
      this.cache.set(key, new TextStyle(font, size, color));
    }
    return this.cache.get(key)!;
  }

  get cacheSize() { return this.cache.size; }
}

// Extrinsic state — character position/content are not shared
interface CharacterRender {
  char: string;
  x: number;
  y: number;
  style: TextStyle; // flyweight reference
}

// Usage
const factory = new TextStyleFactory();
const chars: CharacterRender[] = [];

const body = factory.getStyle("Arial", 14, "#333");
const heading = factory.getStyle("Arial", 24, "#000");

// 1000 characters share one body style object
for (let i = 0; i < 1000; i++) {
  chars.push({ char: "a", x: i * 10, y: 0, style: body });
}

console.log(`Characters: ${chars.length}, Unique styles: ${factory.cacheSize}`);
// Characters: 1000, Unique styles: 2
```
