# Adapter

## When to Use

- An existing class has an incompatible interface with what your system expects
- You are integrating third-party or legacy code without modifying it
- You need to unify different APIs behind one client-friendly interface

## Key Principles

- **Open/Closed**: Extend compatibility without changing existing code
- **Interface Segregation**: Expose only what the client needs

## Example

```typescript
// Target interface expected by the system
interface PaymentProcessor {
  charge(amount: number, currency: string): Promise<string>;
}

// Legacy third-party SDK with an incompatible interface
class LegacyPaymentSDK {
  makePayment(cents: number, currencyCode: string, callback: (id: string) => void) {
    setTimeout(() => callback(`txn_${Date.now()}`), 100);
  }
}

// Adapter converts the legacy API into the target API
class LegacyPaymentAdapter implements PaymentProcessor {
  constructor(private sdk: LegacyPaymentSDK) {}

  charge(amount: number, currency: string): Promise<string> {
    const cents = Math.round(amount * 100);
    return new Promise((resolve) => {
      this.sdk.makePayment(cents, currency, (id) => resolve(id));
    });
  }
}

// Usage
async function checkout(processor: PaymentProcessor) {
  const txnId = await processor.charge(29.99, "USD");
  console.log(`Payment successful: ${txnId}`);
}

const adapter = new LegacyPaymentAdapter(new LegacyPaymentSDK());
checkout(adapter);
```
