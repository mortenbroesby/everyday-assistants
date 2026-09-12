# Mediator

## When to Use

- Object interactions become complex and direct communication causes tight coupling
- A central coordinator is needed (chat room, form coordination, traffic control)
- You want to turn many-to-many dependencies into many-to-one

## Key Principles

- **Single Responsibility**: The mediator coordinates collaboration
- **Law of Demeter**: Components communicate through mediator only

## Example

```typescript
// Mediator interface
interface ChatMediator {
  sendMessage(message: string, sender: User): void;
  addUser(user: User): void;
}

// Component — user
class User {
  constructor(public name: string, private mediator: ChatMediator) {
    mediator.addUser(this);
  }

  send(message: string) {
    console.log(`${this.name} sends: ${message}`);
    this.mediator.sendMessage(message, this);
  }

  receive(message: string, from: string) {
    console.log(`${this.name} receives from ${from}: ${message}`);
  }
}

// Concrete mediator — chat room
class ChatRoom implements ChatMediator {
  private users: User[] = [];

  addUser(user: User) {
    this.users.push(user);
  }

  sendMessage(message: string, sender: User) {
    for (const user of this.users) {
      if (user !== sender) {
        user.receive(message, sender.name);
      }
    }
  }
}

// Usage
const room = new ChatRoom();
const alice = new User("Alice", room);
const bob   = new User("Bob", room);
const carol = new User("Carol", room);

alice.send("Hello everyone!");
// Bob receives from Alice: Hello everyone!
// Carol receives from Alice: Hello everyone!
```
