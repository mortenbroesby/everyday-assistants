# Command

## When to Use

- You want to encapsulate operations as objects (undo/redo support)
- Requests must be queued, logged, delayed, or replayed
- You need macro commands that combine multiple operations
- You want to decouple request invokers from receivers

## Key Principles

- **Single Responsibility**: Each command encapsulates one action
- **Open/Closed**: Add new commands without changing invoker logic

## Example

```typescript
// Command interface
interface Command {
  execute(): void;
  undo(): void;
}

// Receiver
class TextEditor {
  private content = "";

  insert(text: string, position: number) {
    this.content = this.content.slice(0, position) + text + this.content.slice(position);
  }

  delete(position: number, length: number): string {
    const deleted = this.content.slice(position, position + length);
    this.content = this.content.slice(0, position) + this.content.slice(position + length);
    return deleted;
  }

  getContent() { return this.content; }
}

// Concrete command — insert
class InsertCommand implements Command {
  constructor(
    private editor: TextEditor,
    private text: string,
    private position: number
  ) {}

  execute() { this.editor.insert(this.text, this.position); }
  undo()    { this.editor.delete(this.position, this.text.length); }
}

// Concrete command — delete
class DeleteCommand implements Command {
  private deletedText = "";

  constructor(
    private editor: TextEditor,
    private position: number,
    private length: number
  ) {}

  execute() { this.deletedText = this.editor.delete(this.position, this.length); }
  undo()    { this.editor.insert(this.deletedText, this.position); }
}

// Invoker with history
class CommandHistory {
  private history: Command[] = [];

  execute(cmd: Command) {
    cmd.execute();
    this.history.push(cmd);
  }

  undo() {
    const cmd = this.history.pop();
    cmd?.undo();
  }
}

// Usage
const editor = new TextEditor();
const history = new CommandHistory();

history.execute(new InsertCommand(editor, "Hello", 0));
history.execute(new InsertCommand(editor, " World", 5));
console.log(editor.getContent()); // "Hello World"

history.undo();
console.log(editor.getContent()); // "Hello"
```
