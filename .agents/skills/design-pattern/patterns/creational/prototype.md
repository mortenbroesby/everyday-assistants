# Prototype

## When to Use

- Creating an object is expensive (e.g., involves database queries or complex computation), so cloning an existing instance is more efficient
- The system doesn't need to know the concrete type — it just copies an existing object
- You need to create independent copies of objects at runtime while allowing modifications

## Key Principles

- **Open/Closed**: Adding new clonable types doesn't require changes to client code
- **Liskov Substitution**: Cloned objects behave identically to the prototype

## Caveats

- Deep copy vs shallow copy: when properties contain reference types, deep copy is required to avoid shared mutable state

## Example

```typescript
interface Cloneable<T> {
  clone(): T;
}

class ChartConfig implements Cloneable<ChartConfig> {
  constructor(
    public type: string,
    public colors: string[],
    public title: string,
    public showLegend: boolean
  ) {}

  clone(): ChartConfig {
    // Deep copy — colors is a reference type, so clone the array
    return new ChartConfig(
      this.type,
      [...this.colors],
      this.title,
      this.showLegend
    );
  }
}

// Usage — quickly derive new charts from a default config
const defaultBar = new ChartConfig("bar", ["#3b82f6", "#ef4444"], "Sales", true);

const revenueChart = defaultBar.clone();
revenueChart.title = "Revenue by Quarter";
revenueChart.colors = ["#10b981", "#f59e0b"];

const userChart = defaultBar.clone();
userChart.title = "Active Users";
userChart.showLegend = false;
```
