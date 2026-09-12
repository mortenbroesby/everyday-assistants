# Visitor

## When to Use

- You need multiple unrelated operations over a stable object structure
- New operations are added often, but element types rarely change
- You want to keep operation logic out of data classes

## Key Principles

- **Single Responsibility**: Each visitor encapsulates one operation
- **Open/Closed**: Add operations by adding visitors

## Caveats

- If element types change frequently, every visitor must be updated

## Example

```typescript
// Visitor interface
interface ASTVisitor {
  visitNumberNode(node: NumberNode): string;
  visitBinaryOpNode(node: BinaryOpNode): string;
  visitFunctionCallNode(node: FunctionCallNode): string;
}

// Element interface
interface ASTNode {
  accept(visitor: ASTVisitor): string;
}

// Concrete elements
class NumberNode implements ASTNode {
  constructor(public value: number) {}
  accept(visitor: ASTVisitor) { return visitor.visitNumberNode(this); }
}

class BinaryOpNode implements ASTNode {
  constructor(public op: string, public left: ASTNode, public right: ASTNode) {}
  accept(visitor: ASTVisitor) { return visitor.visitBinaryOpNode(this); }
}

class FunctionCallNode implements ASTNode {
  constructor(public name: string, public args: ASTNode[]) {}
  accept(visitor: ASTVisitor) { return visitor.visitFunctionCallNode(this); }
}

// Concrete visitor — pretty printer
class PrintVisitor implements ASTVisitor {
  visitNumberNode(node: NumberNode) { return `${node.value}`; }

  visitBinaryOpNode(node: BinaryOpNode) {
    const l = node.left.accept(this);
    const r = node.right.accept(this);
    return `(${l} ${node.op} ${r})`;
  }

  visitFunctionCallNode(node: FunctionCallNode) {
    const args = node.args.map(a => a.accept(this)).join(", ");
    return `${node.name}(${args})`;
  }
}

// Concrete visitor — evaluator
class EvalVisitor implements ASTVisitor {
  visitNumberNode(node: NumberNode) { return `${node.value}`; }

  visitBinaryOpNode(node: BinaryOpNode) {
    const l = Number(node.left.accept(this));
    const r = Number(node.right.accept(this));
    switch (node.op) {
      case "+": return `${l + r}`;
      case "*": return `${l * r}`;
      default:  throw new Error(`Unknown op: ${node.op}`);
    }
  }

  visitFunctionCallNode(node: FunctionCallNode) {
    const args = node.args.map(a => Number(a.accept(this)));
    if (node.name === "max") return `${Math.max(...args)}`;
    throw new Error(`Unknown function: ${node.name}`);
  }
}

// Usage — AST: max(2 + 3, 4 * 5)
const ast = new FunctionCallNode("max", [
  new BinaryOpNode("+", new NumberNode(2), new NumberNode(3)),
  new BinaryOpNode("*", new NumberNode(4), new NumberNode(5)),
]);

console.log(ast.accept(new PrintVisitor())); // max((2 + 3), (4 * 5))
console.log(ast.accept(new EvalVisitor()));  // 20
```
