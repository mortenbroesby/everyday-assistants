---
name: design-pattern
description: "Guides evidence-based selection of the 23 Gang of Four design patterns. Use when the user explicitly asks about design patterns or names a GoF pattern. Excludes general refactoring and architecture work without a demonstrated pattern-shaped problem."
license: MIT
metadata:
  repository: https://github.com/NetBT/big-bang
  commit: fa6059cd6484044ae6ba3a9b4a3bd45f236c179d
  adapted: true
---

# Design Pattern Skill

## Prompt

Start with the no-pattern baseline. In TypeScript and frontend code, prefer a
plain function, discriminated union, module, built-in iterator, or platform API
when it solves the problem. Apply a named pattern only when the current code
demonstrates the variation, coupling, lifecycle, or state complexity that the
pattern addresses.

When a demonstrated problem suggests a named pattern, follow these steps:

1. Describe the current pain and the axis of change it exposes.
2. Compare the no-pattern baseline with the one relevant pattern reference.
3. Choose the simpler option unless the pattern removes demonstrated coupling, duplication, invalid states, or lifecycle risk.
4. When a pattern is chosen, state its trade-off in proportion to the decision.

### Pattern Selection Prompt Hints

Use these requirement cues as prompt triggers when deciding which pattern(s) to recommend. See the Common Design Patterns section below for the reference file of each pattern.

| Requirement Cue in User Prompt                                                      | Pattern to Prioritize   |
| ----------------------------------------------------------------------------------- | ----------------------- |
| "only one instance", "global shared instance", "single config/logger/pool"          | Singleton               |
| "create different object types by condition", "defer object creation to subclasses" | Factory Method          |
| "switch entire family/theme/platform of related objects"                            | Abstract Factory        |
| "complex object construction", "many optional parameters", "step-by-step build"     | Builder                 |
| "clone existing object", "copy expensive object efficiently"                        | Prototype               |
| "integrate incompatible API", "wrap legacy/third-party interface"                   | Adapter                 |
| "two independent dimensions of change", "avoid class explosion from combinations"   | Bridge                  |
| "tree structure", "treat leaf and group uniformly"                                  | Composite               |
| "add behavior dynamically", "stack optional behaviors"                              | Decorator               |
| "simplify complex subsystem", "one high-level API"                                  | Facade                  |
| "too many similar objects", "memory optimization by sharing state"                  | Flyweight               |
| "access control / lazy loading / caching proxy"                                     | Proxy                   |
| "pass request through multiple handlers", "pipeline/approval chain"                 | Chain of Responsibility |
| "encapsulate action as object", "undo/redo", "queue commands"                       | Command                 |
| "custom mini language", "evaluate expression tree"                                  | Interpreter             |
| "custom traversal without exposing collection internals"                            | Iterator                |
| "many-to-many object interactions", "central coordinator"                           | Mediator                |
| "snapshot and restore state", "rollback", "history"                                 | Memento                 |
| "one-to-many notifications", "publish-subscribe"                                    | Observer                |
| "behavior changes by state", "replace large state conditionals"                     | State                   |
| "multiple interchangeable algorithms", "runtime strategy switching"                 | Strategy                |
| "fixed workflow skeleton with overridable steps"                                    | Template Method         |
| "add new operations over stable object structure"                                   | Visitor                 |

## When NOT to Apply a Pattern

Patterns are tools, not goals. Skip a pattern when any of the following holds:

- The problem has a single, stable use case with no foreseen variation — prefer a direct, readable implementation.
- Introducing the pattern adds more indirection than the current pain justifies (YAGNI).
- The codebase, team, or language idiom already solves the problem cleanly (e.g., first-class functions can replace Strategy/Command; modules can replace Singleton).
- The pattern would be applied speculatively for hypothetical future requirements.
- Readability or debuggability would noticeably degrade with no measurable benefit.

When declining a pattern, state the simpler alternative chosen and the trigger that would justify revisiting the decision.

## Combining Patterns

Real designs usually mix patterns. When multiple cues match:

1. Pick a primary pattern that captures the dominant axis of change; treat others as secondary collaborators.
2. Prefer composition of patterns over nesting at the same layer.
3. Common, well-tested combinations:
   - Factory Method or Abstract Factory + Strategy: factory selects the strategy implementation.
   - Composite + Visitor: traverse a tree while adding operations without modifying nodes.
   - Composite + Iterator: expose uniform traversal over hierarchical structures.
   - Decorator + Chain of Responsibility: layered cross-cutting behavior (logging, auth, retry).
   - State + Strategy: state owns transitions, strategy owns interchangeable algorithms per state.
   - Builder + Prototype: builder configures a base object, prototype clones variants.
   - Facade + Adapter: facade simplifies a subsystem whose parts are adapted from legacy APIs.
4. Reject combinations that fight each other (e.g., Singleton + Strategy injection usually hides dependencies — prefer DI).

## Common Anti-Patterns and Pitfalls

Avoid these recurring misuses:

- Singleton as a global mutable state holder; hides dependencies and breaks testability. Prefer dependency injection with a single composition-root instance.
- Pattern-driven design: choosing a pattern first and bending the problem to fit it.
- Deep Decorator stacks that make execution order opaque; flatten or document the order explicitly.
- God Facade that grows into a kitchen-sink API; split by subsystem responsibility.
- Visitor over an unstable structure; every node change forces visitor changes.
- Observer without unsubscribe semantics; causes leaks and ghost callbacks.
- Chain of Responsibility with no terminator or with hidden side effects across handlers.
- Abstract Factory with only one concrete family; collapse to direct construction until a second family appears.
- Builder for objects with 2–3 fields; a plain constructor or named arguments is clearer.
- Template Method that forces subclassing where composition (Strategy) would suffice.

## Design Pattern Principles

- Single Responsibility Principle (SRP): Each class should have only one reason to change.
- Open/Closed Principle (OCP): Software entities should be open for extension but closed for modification.
- Liskov Substitution Principle (LSP): Subtypes must be substitutable for their base types.
- Interface Segregation Principle (ISP): Clients should not be forced to depend on interfaces they do not use.
- Dependency Inversion Principle (DIP): Depend on abstractions, not on concretions.
- Law of Demeter (LoD): A class should have limited knowledge about other classes.

## Common Design Patterns

Each pattern has a dedicated reference file with application scenarios and example code. Read the relevant file when applying a specific pattern.

### Creational Patterns

| Pattern          | File                                                                               |
| ---------------- | ---------------------------------------------------------------------------------- |
| Singleton        | [patterns/creational/singleton.md](patterns/creational/singleton.md)               |
| Factory Method   | [patterns/creational/factory-method.md](patterns/creational/factory-method.md)     |
| Abstract Factory | [patterns/creational/abstract-factory.md](patterns/creational/abstract-factory.md) |
| Builder          | [patterns/creational/builder.md](patterns/creational/builder.md)                   |
| Prototype        | [patterns/creational/prototype.md](patterns/creational/prototype.md)               |

### Structural Patterns

| Pattern   | File                                                                 |
| --------- | -------------------------------------------------------------------- |
| Adapter   | [patterns/structural/adapter.md](patterns/structural/adapter.md)     |
| Bridge    | [patterns/structural/bridge.md](patterns/structural/bridge.md)       |
| Composite | [patterns/structural/composite.md](patterns/structural/composite.md) |
| Decorator | [patterns/structural/decorator.md](patterns/structural/decorator.md) |
| Facade    | [patterns/structural/facade.md](patterns/structural/facade.md)       |
| Flyweight | [patterns/structural/flyweight.md](patterns/structural/flyweight.md) |
| Proxy     | [patterns/structural/proxy.md](patterns/structural/proxy.md)         |

### Behavioral Patterns

| Pattern                 | File                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Chain of Responsibility | [patterns/behavioral/chain-of-responsibility.md](patterns/behavioral/chain-of-responsibility.md) |
| Command                 | [patterns/behavioral/command.md](patterns/behavioral/command.md)                                 |
| Interpreter             | [patterns/behavioral/interpreter.md](patterns/behavioral/interpreter.md)                         |
| Iterator                | [patterns/behavioral/iterator.md](patterns/behavioral/iterator.md)                               |
| Mediator                | [patterns/behavioral/mediator.md](patterns/behavioral/mediator.md)                               |
| Memento                 | [patterns/behavioral/memento.md](patterns/behavioral/memento.md)                                 |
| Observer                | [patterns/behavioral/observer.md](patterns/behavioral/observer.md)                               |
| State                   | [patterns/behavioral/state.md](patterns/behavioral/state.md)                                     |
| Strategy                | [patterns/behavioral/strategy.md](patterns/behavioral/strategy.md)                               |
| Template Method         | [patterns/behavioral/template-method.md](patterns/behavioral/template-method.md)                 |
| Visitor                 | [patterns/behavioral/visitor.md](patterns/behavioral/visitor.md)                                 |

## Proportional Output

Do not add design boilerplate to routine work. When a named pattern materially
affects a decision, record only what a reviewer needs:

```
Design Notes
- Problem: <demonstrated design pressure>
- Choice: <pattern or no-pattern baseline>
- Trade-off: <why the added indirection is or is not justified>
```
