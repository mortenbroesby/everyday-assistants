# Factory Method

## When to Use

- The exact type of the object to create is unknown at compile time and must be decided dynamically
- You want to decouple object creation logic from usage logic
- Multiple implementations of the same interface exist, and subclasses decide which one to instantiate

## Core Idea

Define an interface for creating objects, and let subclasses decide which class to instantiate.

## Example

```typescript
// Product interface
interface Notification {
  send(message: string): void;
}

// Concrete products
class EmailNotification implements Notification {
  send(message: string): void {
    console.log(`Email: ${message}`);
  }
}

class SmsNotification implements Notification {
  send(message: string): void {
    console.log(`SMS: ${message}`);
  }
}

class PushNotification implements Notification {
  send(message: string): void {
    console.log(`Push: ${message}`);
  }
}

// Factory
abstract class NotificationFactory {
  abstract createNotification(): Notification;

  notify(message: string): void {
    const notification = this.createNotification();
    notification.send(message);
  }
}

class EmailFactory extends NotificationFactory {
  createNotification(): Notification {
    return new EmailNotification();
  }
}

class SmsFactory extends NotificationFactory {
  createNotification(): Notification {
    return new SmsNotification();
  }
}

// Usage
const factory: NotificationFactory = new EmailFactory();
factory.notify("Your order has been shipped");
```

## Caveats

- Each new product type requires a new factory subclass, which can lead to class proliferation
- If product types are limited and stable, a simple factory (static method) may be more appropriate
