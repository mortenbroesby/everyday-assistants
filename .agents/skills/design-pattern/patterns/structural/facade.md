# Facade

## When to Use

- Subsystems are complex and clients need a simple high-level interface
- You want to reduce coupling between clients and many subsystem classes
- You need to encapsulate orchestration and initialization steps into one call

## Key Principles

- **Law of Demeter**: Clients talk to the facade, not subsystem internals
- **Single Responsibility**: The facade coordinates workflow, subsystems keep domain logic

## Example

```typescript
// Subsystems with their own APIs
class Inventory {
  check(productId: string): boolean {
    console.log(`Checking stock for ${productId}`);
    return true;
  }

  reserve(productId: string) {
    console.log(`Reserved ${productId}`);
  }
}

class PaymentService {
  charge(userId: string, amount: number): string {
    console.log(`Charged $${amount} to user ${userId}`);
    return `pay_${Date.now()}`;
  }
}

class ShippingService {
  schedule(productId: string, address: string) {
    console.log(`Shipping ${productId} to ${address}`);
  }
}

class NotificationService {
  sendConfirmation(userId: string, orderId: string) {
    console.log(`Sent confirmation to ${userId} for order ${orderId}`);
  }
}

// Facade that unifies subsystem orchestration
class OrderFacade {
  private inventory = new Inventory();
  private payment = new PaymentService();
  private shipping = new ShippingService();
  private notification = new NotificationService();

  placeOrder(userId: string, productId: string, address: string, amount: number): string {
    if (!this.inventory.check(productId)) {
      throw new Error("Out of stock");
    }
    this.inventory.reserve(productId);
    const paymentId = this.payment.charge(userId, amount);
    this.shipping.schedule(productId, address);
    const orderId = `order_${Date.now()}`;
    this.notification.sendConfirmation(userId, orderId);
    return orderId;
  }
}

// Usage
const order = new OrderFacade();
order.placeOrder("user_1", "prod_42", "123 Main St", 99.99);
```
