# Interpreter

## When to Use

- You need to parse and evaluate a small custom language or expression set
- Grammar rules are simple and stable
- You want business rules represented as composable expressions

## Key Principles

- **Open/Closed**: Add new grammar rules by adding expression types
- **Composite**: Expression trees represent grammar structure

## Caveats

- Best for simple grammars. Use parser generators for complex languages.

## Example

```typescript
// Context — variable storage
type Context = Record<string, number>;

// Abstract expression
interface Expression {
  interpret(ctx: Context): number;
}

// Terminal expression — number literal
class NumberLiteral implements Expression {
  constructor(private value: number) {}
  interpret(_ctx: Context) { return this.value; }
}

// Terminal expression — variable reference
class Variable implements Expression {
  constructor(private name: string) {}
  interpret(ctx: Context) {
    if (!(this.name in ctx)) throw new Error(`Undefined variable: ${this.name}`);
    return ctx[this.name];
  }
}

// Non-terminal expression — addition
class Add implements Expression {
  constructor(private left: Expression, private right: Expression) {}
  interpret(ctx: Context) {
    return this.left.interpret(ctx) + this.right.interpret(ctx);
  }
}

// Non-terminal expression — multiplication
class Multiply implements Expression {
  constructor(private left: Expression, private right: Expression) {}
  interpret(ctx: Context) {
    return this.left.interpret(ctx) * this.right.interpret(ctx);
  }
}

// Usage — expression: (price * quantity) + tax
const expression = new Add(
  new Multiply(new Variable("price"), new Variable("quantity")),
  new Variable("tax")
);

const context: Context = { price: 25, quantity: 4, tax: 8 };
console.log(expression.interpret(context)); // 108
```
