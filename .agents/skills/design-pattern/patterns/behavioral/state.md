# State

## When to Use

- Object behavior changes by internal state with frequent transitions
- You want to remove large conditionals (`if/else` or `switch`) for state branching
- Runtime behavior switching is required

## Key Principles

- **Single Responsibility**: Each state class owns behavior for one state
- **Open/Closed**: Add states without modifying existing behavior

## Example

```typescript
// State interface
interface OrderState {
  next(order: Order): void;
  cancel(order: Order): void;
  toString(): string;
}

// Context
class Order {
  private state: OrderState;

  constructor(public id: string) {
    this.state = new PendingState();
  }

  setState(state: OrderState) { this.state = state; }
  next()   { this.state.next(this); }
  cancel() { this.state.cancel(this); }
  getStatus() { return this.state.toString(); }
}

// Concrete states
class PendingState implements OrderState {
  next(order: Order) {
    console.log(`Order ${order.id}: Pending → Confirmed`);
    order.setState(new ConfirmedState());
  }
  cancel(order: Order) {
    console.log(`Order ${order.id}: Pending → Cancelled`);
    order.setState(new CancelledState());
  }
  toString() { return "Pending"; }
}

class ConfirmedState implements OrderState {
  next(order: Order) {
    console.log(`Order ${order.id}: Confirmed → Shipped`);
    order.setState(new ShippedState());
  }
  cancel(order: Order) {
    console.log(`Order ${order.id}: Confirmed → Cancelled (refund issued)`);
    order.setState(new CancelledState());
  }
  toString() { return "Confirmed"; }
}

class ShippedState implements OrderState {
  next(order: Order) {
    console.log(`Order ${order.id}: Shipped → Delivered`);
    order.setState(new DeliveredState());
  }
  cancel(_order: Order) {
    console.log("Cannot cancel a shipped order");
  }
  toString() { return "Shipped"; }
}

class DeliveredState implements OrderState {
  next(_order: Order) { console.log("Order already delivered"); }
  cancel(_order: Order) { console.log("Cannot cancel a delivered order"); }
  toString() { return "Delivered"; }
}

class CancelledState implements OrderState {
  next(_order: Order) { console.log("Order is cancelled"); }
  cancel(_order: Order) { console.log("Already cancelled"); }
  toString() { return "Cancelled"; }
}

// Usage
const order = new Order("ORD-001");
order.next();   // Pending → Confirmed
order.next();   // Confirmed → Shipped
order.cancel(); // Cannot cancel a shipped order
order.next();   // Shipped → Delivered
```
