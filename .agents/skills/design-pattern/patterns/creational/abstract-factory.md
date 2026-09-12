# Abstract Factory

## When to Use

- You need to create a family of related or interdependent objects rather than a single object
- The system must support multiple themes, platforms, or configurations, each with matching components
- You want to ensure that products from the same family work together

## Core Idea

Provide an interface for creating families of related objects without specifying their concrete classes.

## Example

```typescript
// Abstract products
interface Button {
  render(): string;
}

interface Input {
  render(): string;
}

// Concrete products — Light theme
class LightButton implements Button {
  render() { return "<button class='light'>Click</button>"; }
}

class LightInput implements Input {
  render() { return "<input class='light' />"; }
}

// Concrete products — Dark theme
class DarkButton implements Button {
  render() { return "<button class='dark'>Click</button>"; }
}

class DarkInput implements Input {
  render() { return "<input class='dark' />"; }
}

// Abstract factory
interface UIFactory {
  createButton(): Button;
  createInput(): Input;
}

// Concrete factories
class LightThemeFactory implements UIFactory {
  createButton() { return new LightButton(); }
  createInput() { return new LightInput(); }
}

class DarkThemeFactory implements UIFactory {
  createButton() { return new DarkButton(); }
  createInput() { return new DarkInput(); }
}

// Usage
function buildForm(factory: UIFactory) {
  const button = factory.createButton();
  const input = factory.createInput();
  console.log(input.render(), button.render());
}

buildForm(new DarkThemeFactory());
// <input class='dark' /> <button class='dark'>Click</button>
```

## Caveats

- Adding a new product family is easy (new factories + products), but adding a new product type is hard (requires modifying all factory interfaces)
- Avoid this pattern when product types change frequently
