# Strategy

## When to Use

- A task has multiple interchangeable algorithms or policies
- You want runtime switching instead of hard-coded branching
- Algorithm changes should not affect client usage

## Key Principles

- **Open/Closed**: Add new strategies without changing context code
- **Dependency Inversion**: Context depends on strategy interfaces

## Example

```typescript
// Strategy interface
interface PricingStrategy {
  calculate(basePrice: number): number;
}

// Concrete strategies
class RegularPricing implements PricingStrategy {
  calculate(basePrice: number) { return basePrice; }
}

class MemberPricing implements PricingStrategy {
  constructor(private discount: number) {} // 0.0 ~ 1.0

  calculate(basePrice: number) {
    return basePrice * (1 - this.discount);
  }
}

class PromotionPricing implements PricingStrategy {
  constructor(private buyCount: number, private freeCount: number) {}

  calculate(basePrice: number) {
    // Buy N get M free
    const payRatio = this.buyCount / (this.buyCount + this.freeCount);
    return basePrice * payRatio;
  }
}

// Context
class ShoppingCart {
  private items: { name: string; price: number }[] = [];
  private strategy: PricingStrategy = new RegularPricing();

  setPricingStrategy(strategy: PricingStrategy) {
    this.strategy = strategy;
  }

  addItem(name: string, price: number) {
    this.items.push({ name, price });
  }

  checkout(): number {
    return this.items.reduce(
      (total, item) => total + this.strategy.calculate(item.price),
      0
    );
  }
}

// Usage
const cart = new ShoppingCart();
cart.addItem("Keyboard", 100);
cart.addItem("Mouse", 50);

cart.setPricingStrategy(new RegularPricing());
console.log(cart.checkout()); // 150

cart.setPricingStrategy(new MemberPricing(0.2));
console.log(cart.checkout()); // 120

cart.setPricingStrategy(new PromotionPricing(2, 1));
console.log(cart.checkout()); // 100 (buy 2 get 1)
```
