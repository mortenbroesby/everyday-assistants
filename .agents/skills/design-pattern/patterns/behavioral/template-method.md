# Template Method

## When to Use

- Multiple classes share the same algorithm skeleton with different step implementations
- You must preserve step ordering while allowing selective customization
- You want to remove duplicated workflow logic

## Key Principles

- **Open/Closed**: Subclasses override hooks without changing the algorithm skeleton
- **Liskov Substitution**: Subclasses must preserve the base workflow contract

## Example

```typescript
// Abstract class — algorithm skeleton
abstract class DataImporter {
  // Template method — fixed sequence
  import(source: string): void {
    const raw = this.readData(source);
    const parsed = this.parseData(raw);
    const validated = this.validate(parsed);
    this.save(validated);
    this.onComplete(source); // optional hook
  }

  protected abstract readData(source: string): string;
  protected abstract parseData(raw: string): Record<string, unknown>[];

  // Default implementation — optional override
  protected validate(data: Record<string, unknown>[]): Record<string, unknown>[] {
    return data.filter(row => Object.keys(row).length > 0);
  }

  protected save(data: Record<string, unknown>[]) {
    console.log(`Saved ${data.length} records to database`);
  }

  // Hook — optional override
  protected onComplete(source: string) {
    console.log(`Import from ${source} completed`);
  }
}

// Concrete implementation — CSV importer
class CsvImporter extends DataImporter {
  protected readData(source: string): string {
    console.log(`Reading CSV file: ${source}`);
    return "name,age\nAlice,30\nBob,25";
  }

  protected parseData(raw: string): Record<string, unknown>[] {
    const [header, ...rows] = raw.split("\n");
    const keys = header.split(",");
    return rows.map(row => {
      const values = row.split(",");
      return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
    });
  }
}

// Concrete implementation — JSON importer
class JsonImporter extends DataImporter {
  protected readData(source: string): string {
    console.log(`Reading JSON file: ${source}`);
    return '[{"name":"Alice","age":30},{"name":"Bob","age":25}]';
  }

  protected parseData(raw: string): Record<string, unknown>[] {
    return JSON.parse(raw);
  }
}

// Usage — same flow, different implementations
new CsvImporter().import("data.csv");
new JsonImporter().import("data.json");
```
