# Composite

## When to Use

- Data has a tree structure (file systems, org charts, UI trees, nested menus)
- Clients should treat single objects and object groups uniformly
- Recursive traversal and common operations are required across all nodes

## Key Principles

- **Liskov Substitution**: Leaf and composite nodes share one interface
- **Open/Closed**: Add new node types without changing client code

## Example

```typescript
// Component interface
interface FileSystemNode {
  getName(): string;
  getSize(): number;
  print(indent?: string): void;
}

// Leaf node — file
class File implements FileSystemNode {
  constructor(private name: string, private size: number) {}

  getName() { return this.name; }
  getSize() { return this.size; }
  print(indent = "") {
    console.log(`${indent}📄 ${this.name} (${this.size} KB)`);
  }
}

// Composite node — folder
class Folder implements FileSystemNode {
  private children: FileSystemNode[] = [];

  constructor(private name: string) {}

  add(node: FileSystemNode): this {
    this.children.push(node);
    return this;
  }

  getName() { return this.name; }

  getSize(): number {
    return this.children.reduce((sum, child) => sum + child.getSize(), 0);
  }

  print(indent = "") {
    console.log(`${indent}📁 ${this.name} (${this.getSize()} KB)`);
    this.children.forEach(child => child.print(indent + "  "));
  }
}

// Usage
const root = new Folder("project");
const src = new Folder("src");
src.add(new File("index.ts", 12));
src.add(new File("utils.ts", 8));
root.add(src);
root.add(new File("README.md", 3));

root.print();
// project (23 KB)
//   src (20 KB)
//     index.ts (12 KB)
//     utils.ts (8 KB)
//   README.md (3 KB)
```
