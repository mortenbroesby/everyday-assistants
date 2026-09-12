# Singleton

## When to Use

- Only one instance of a class should exist system-wide (e.g., configuration manager, logger, database connection pool)
- A global access point is needed to coordinate system behavior
- Expensive-to-create objects need to be shared and reused (e.g., thread pool, cache)

## Core Idea

Ensure a class has only one instance and provide a global access point to it.

## Example

```typescript
class DatabaseConnection {
  private static instance: DatabaseConnection;
  private connection: string;

  private constructor() {
    this.connection = "connected";
    console.log("Database connection established");
  }

  static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  query(sql: string): string {
    return `Executing: ${sql} on ${this.connection}`;
  }
}

// Usage
const db1 = DatabaseConnection.getInstance();
const db2 = DatabaseConnection.getInstance();
console.log(db1 === db2); // true — same instance
```

## Caveats

- In multi-threaded environments, consider thread safety (use locks or language-level mechanisms)
- Overuse introduces implicit global state and reduces testability
- Prefer dependency injection over hard-coded singleton references
