# Chain of Responsibility

## When to Use

- Multiple objects can handle a request, and the handler should be selected at runtime
- You need ordered processing (middleware pipelines, approval flows, validation chains)
- You want to decouple request senders from concrete handlers

## Key Principles

- **Single Responsibility**: Each handler deals with one kind of request
- **Open/Closed**: Add new handlers without changing existing ones

## Example

```typescript
interface Request {
  type: string;
  amount: number;
  approved?: boolean;
}

// Abstract handler
abstract class ApprovalHandler {
  private next?: ApprovalHandler;

  setNext(handler: ApprovalHandler): ApprovalHandler {
    this.next = handler;
    return handler;
  }

  handle(request: Request): Request {
    if (this.canHandle(request)) {
      return this.process(request);
    }
    if (this.next) {
      return this.next.handle(request);
    }
    return { ...request, approved: false };
  }

  protected abstract canHandle(request: Request): boolean;
  protected abstract process(request: Request): Request;
}

// Concrete handlers
class ManagerApproval extends ApprovalHandler {
  protected canHandle(req: Request) { return req.amount <= 1000; }
  protected process(req: Request) {
    console.log(`Manager approved $${req.amount}`);
    return { ...req, approved: true };
  }
}

class DirectorApproval extends ApprovalHandler {
  protected canHandle(req: Request) { return req.amount <= 10000; }
  protected process(req: Request) {
    console.log(`Director approved $${req.amount}`);
    return { ...req, approved: true };
  }
}

class VPApproval extends ApprovalHandler {
  protected canHandle(req: Request) { return req.amount <= 100000; }
  protected process(req: Request) {
    console.log(`VP approved $${req.amount}`);
    return { ...req, approved: true };
  }
}

// Usage
const manager = new ManagerApproval();
const director = new DirectorApproval();
const vp = new VPApproval();
manager.setNext(director).setNext(vp);

manager.handle({ type: "purchase", amount: 500 });    // Manager approved
manager.handle({ type: "purchase", amount: 5000 });   // Director approved
manager.handle({ type: "purchase", amount: 50000 });  // VP approved
```
