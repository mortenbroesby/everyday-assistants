# Observer

## When to Use

- One object change should notify many dependents automatically
- Publishers should not know subscriber concrete types
- You need loose one-to-many event relationships

## Key Principles

- **Open/Closed**: Add observers without touching subject code
- **Dependency Inversion**: Subject depends on observer abstraction

## Example

```typescript
// Observer interface
interface Observer<T> {
  update(event: T): void;
}

// Subject
class EventEmitter<T> {
  private observers: Observer<T>[] = [];

  subscribe(observer: Observer<T>) {
    this.observers.push(observer);
  }

  unsubscribe(observer: Observer<T>) {
    this.observers = this.observers.filter(o => o !== observer);
  }

  protected notify(event: T) {
    for (const observer of this.observers) {
      observer.update(event);
    }
  }
}

// Concrete subject — product price updates
interface PriceChange {
  product: string;
  oldPrice: number;
  newPrice: number;
}

class ProductStore extends EventEmitter<PriceChange> {
  private prices = new Map<string, number>();

  setPrice(product: string, price: number) {
    const old = this.prices.get(product) ?? 0;
    this.prices.set(product, price);
    if (old !== price) {
      this.notify({ product, oldPrice: old, newPrice: price });
    }
  }
}

// Concrete observers
class PriceLogger implements Observer<PriceChange> {
  update(event: PriceChange) {
    console.log(`[LOG] ${event.product}: $${event.oldPrice} → $${event.newPrice}`);
  }
}

class PriceAlert implements Observer<PriceChange> {
  constructor(private threshold: number) {}

  update(event: PriceChange) {
    if (event.newPrice < this.threshold) {
      console.log(`🔔 ${event.product} dropped below $${this.threshold}!`);
    }
  }
}

// Usage
const store = new ProductStore();
store.subscribe(new PriceLogger());
store.subscribe(new PriceAlert(50));

store.setPrice("Widget", 75);   // [LOG] Widget: $0 → $75
store.setPrice("Widget", 45);   // [LOG] Widget: $75 → $45  +  🔔 Widget dropped below $50!
```
