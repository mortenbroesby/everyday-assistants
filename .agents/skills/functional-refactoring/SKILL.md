---
name: functional-refactoring
description: Refactor TypeScript or frontend code toward a functional core with thin effectful boundaries, and use design patterns only for demonstrated recurring complexity. Use for explicit functional-programming or design-pattern work. Excludes general cleanup, performance, and security audits.
license: MIT
---

# Functional refactoring

## Routing

- General readability cleanup uses `code-simplification`.
- Explicit functional-core or effect-boundary work uses this skill.
- An explicit Gang of Four question or demonstrated pattern-shaped problem uses `design-pattern`; read only the relevant pattern reference.
- Do not invoke all three skills by default.

Use these published sources as the model, adapted to the repository rather than copied mechanically:

- Martin Fowler's [Refactoring](https://refactoring.com/) and [catalog](https://refactoring.com/catalog/): preserve behavior through small, verified transformations.
- Gary Bernhardt's [Boundaries](https://www.destroyallsoftware.com/talks/boundaries): keep decisions in a functional core and effects in a thin imperative shell.
- React's [Keeping Components Pure](https://react.dev/learn/keeping-components-pure) and [reducer guidance](https://react.dev/learn/extracting-state-logic-into-a-reducer): render from inputs and move complex state transitions into pure reducers.
- TypeScript's [discriminated unions and exhaustive checking](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking): model finite states as data and make missing cases fail at compile time.

## Workflow

1. Trace the real entry point, callers, effects, and published behavior. Name the concrete maintenance cost; leave code alone when there is none.
2. Establish focused characterization coverage, then make one behavior-preserving change at a time.
3. Move deterministic parsing, validation, ranking, policy, calculations, and state transitions into pure functions over plain data.
4. Keep network, storage, environment, clock, randomness, logging, CLI, HTTP, MCP, and DOM writes at explicit boundaries.
5. Prefer JavaScript and TypeScript primitives already in use: array methods, `Map`, `Set`, `Promise.all`, plain objects, discriminated unions, exhaustive `never`, and Zod at untrusted inputs.
6. Avoid mutating caller-owned values. Local mutation of newly created data is fine when it is clearer and cannot escape.
7. Reuse the repository's existing error model. Do not introduce `Result`, `Option`, pipelines, lenses, or an effect system merely to make code look functional.

## Pattern restraint

- A pattern name explains a proven shape; it is not a reason to add that shape.
- Use an injected function as Strategy only when two real algorithms vary.
- Use an Adapter only at an actual external boundary with a mismatched contract.
- Use a discriminated union and pure reducer for multiple bug-prone states or transitions.
- Use Command data only when an action must be delayed, serialized, audited, retried, or undone.
- Do not add a factory, builder, singleton, class hierarchy, or interface with one implementation.

## Frontend

- Keep rendering deterministic from input state; perform effects in event handlers or explicit boundary code.
- Introduce a reducer only when scattered state transitions are already causing complexity or defects.
- Preserve the current stack. For a small embedded interface, prefer native HTML, CSS, and DOM APIs over adding a framework.

## Dependency gate

Add an FP dependency only for a named feature with repeated needs that native TypeScript does not cover. First prove in a small spike that it reduces total production code and does not create unacceptable learning, type-check, bundle, runtime, or migration cost. Add it to the consuming package, not the workspace root.

Finish with the focused test and the repository verification gate. Report behavior preserved, code removed or added, and dependency impact.
