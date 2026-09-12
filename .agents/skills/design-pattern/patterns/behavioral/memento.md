# Memento

## When to Use

- You need to save and restore object history (undo, snapshots, rollback)
- You want state capture without breaking encapsulation
- You need checkpoint functionality

## Key Principles

- **Encapsulation**: Mementos hide internal state details
- **Single Responsibility**: Originator creates/restores snapshots; Caretaker stores them

## Example

```typescript
// Memento — state snapshot
class EditorMemento {
  constructor(
    private readonly content: string,
    private readonly cursorPos: number
  ) {}

  getContent()   { return this.content; }
  getCursorPos() { return this.cursorPos; }
}

// Originator — create and restore state
class Editor {
  private content = "";
  private cursorPos = 0;

  type(text: string) {
    this.content =
      this.content.slice(0, this.cursorPos) +
      text +
      this.content.slice(this.cursorPos);
    this.cursorPos += text.length;
  }

  moveCursor(pos: number) {
    this.cursorPos = Math.max(0, Math.min(pos, this.content.length));
  }

  save(): EditorMemento {
    return new EditorMemento(this.content, this.cursorPos);
  }

  restore(memento: EditorMemento) {
    this.content = memento.getContent();
    this.cursorPos = memento.getCursorPos();
  }

  toString() {
    return `"${this.content}" (cursor: ${this.cursorPos})`;
  }
}

// Caretaker — manage snapshot history
class History {
  private snapshots: EditorMemento[] = [];

  push(memento: EditorMemento) { this.snapshots.push(memento); }

  pop(): EditorMemento | undefined { return this.snapshots.pop(); }
}

// Usage
const editor = new Editor();
const history = new History();

history.push(editor.save());
editor.type("Hello");
history.push(editor.save());
editor.type(" World");
console.log(editor.toString()); // "Hello World" (cursor: 11)

editor.restore(history.pop()!);
console.log(editor.toString()); // "Hello" (cursor: 5)

editor.restore(history.pop()!);
console.log(editor.toString()); // "" (cursor: 0)
```
