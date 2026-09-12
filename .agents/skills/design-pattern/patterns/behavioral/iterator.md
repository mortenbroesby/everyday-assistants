# Iterator

## When to Use

- You want to traverse a collection without exposing internal representation
- The same collection needs multiple traversal strategies
- Different structures should share a unified traversal contract

## Key Principles

- **Single Responsibility**: Iteration logic is separated from collection storage
- **Interface Segregation**: Clients depend on iterator interfaces only

## Example

```typescript
// Iterator interface
interface Iterator<T> {
  hasNext(): boolean;
  next(): T;
}

// Collection interface
interface IterableCollection<T> {
  createIterator(): Iterator<T>;
}

// Concrete collection — numeric range without array storage
class NumberRange implements IterableCollection<number> {
  constructor(private start: number, private end: number) {}

  createIterator(): Iterator<number> {
    return new NumberRangeIterator(this.start, this.end);
  }
}

class NumberRangeIterator implements Iterator<number> {
  private current: number;

  constructor(start: number, private end: number) {
    this.current = start;
  }

  hasNext(): boolean { return this.current <= this.end; }

  next(): number {
    if (!this.hasNext()) throw new Error("No more elements");
    return this.current++;
  }
}

// Usage
const range = new NumberRange(1, 5);
const iter = range.createIterator();

while (iter.hasNext()) {
  console.log(iter.next()); // 1, 2, 3, 4, 5
}

// In TypeScript/JS, Symbol.iterator is common:
class FibonacciSequence {
  constructor(private count: number) {}

  *[Symbol.iterator]() {
    let [a, b] = [0, 1];
    for (let i = 0; i < this.count; i++) {
      yield a;
      [a, b] = [b, a + b];
    }
  }
}

for (const num of new FibonacciSequence(8)) {
  console.log(num); // 0, 1, 1, 2, 3, 5, 8, 13
}
```
