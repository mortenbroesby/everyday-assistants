# Bridge

## When to Use

- A class has two independent dimensions of change (for example, message type and delivery channel)
- You want to avoid class explosion from all possible combinations
- You want abstraction and implementation to evolve independently

## Key Principles

- **Single Responsibility**: Abstraction and implementation each own one axis of change
- **Dependency Inversion**: Abstractions depend on implementation interfaces

## Example

```typescript
// Implementation dimension — delivery channel
interface MessageSender {
  send(title: string, body: string): void;
}

class EmailSender implements MessageSender {
  send(title: string, body: string) {
    console.log(`Email [${title}]: ${body}`);
  }
}

class SlackSender implements MessageSender {
  send(title: string, body: string) {
    console.log(`Slack #general [${title}]: ${body}`);
  }
}

// Abstraction dimension — message type
abstract class Message {
  constructor(protected sender: MessageSender) {}
  abstract publish(): void;
}

class AlertMessage extends Message {
  constructor(sender: MessageSender, private error: string) {
    super(sender);
  }

  publish() {
    this.sender.send("🚨 Alert", `Critical error: ${this.error}`);
  }
}

class ReportMessage extends Message {
  constructor(sender: MessageSender, private data: string) {
    super(sender);
  }

  publish() {
    this.sender.send("📊 Daily Report", this.data);
  }
}

// Usage — free combination of both dimensions
new AlertMessage(new SlackSender(), "DB connection lost").publish();
new ReportMessage(new EmailSender(), "Revenue: $10,000").publish();
```
