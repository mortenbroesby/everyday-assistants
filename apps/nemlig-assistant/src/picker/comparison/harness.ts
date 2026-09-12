import type { PickerPayload } from "../contract.js";
import type {
  ComparisonCandidate,
  ComparisonChoice,
  ComparisonDisplayModel,
  ComparisonHost,
  ComparisonMessage,
  ComparisonState,
} from "./types.js";

export const samplePayload: PickerPayload = {
  pantry_assumptions: ["salt", "peber"],
  items: [{
    ingredient: "mælk",
    quantity: 1,
    confidence: 72,
    favorite_match: true,
    product: {
      id: 1,
      name: "Letmælk",
      available: true,
      image_url: "https://nemlig.com/scommerce/images/milk.jpg",
    },
    alternatives: [
      { id: 2, name: "Minimælk", available: true, image_url: "https://www.nemlig.com/scommerce/images/mini.jpg" },
      { id: 3, name: "Udsolgt mælk", available: false, image_url: "javascript:alert(1)" },
    ],
  }],
  rejected: [{ ingredient: "sæsonvare", reason: "Ikke fundet" }],
};

export const expectedDisplayModel: ComparisonDisplayModel = {
  pantry: ["salt", "peber"],
  rejected: ["sæsonvare"],
  items: [{
    ingredient: "mælk",
    quantity: 1,
    confidence: 72,
    favoriteMatch: true,
    proposed: {
      id: 1,
      name: "Letmælk",
      available: true,
      imageUrl: "https://nemlig.com/scommerce/images/milk.jpg",
    },
    alternatives: [{
      id: 2,
      name: "Minimælk",
      available: true,
      imageUrl: "https://www.nemlig.com/scommerce/images/mini.jpg",
      choice: "0:2",
    }],
  }],
};

export const scenarios = ["success", "failure", "duplicate", "replacement", "stale-completion", "dispose", "remount"] as const;
export type ComparisonScenario = typeof scenarios[number];

const firstChoice: ComparisonChoice = { id: 2, ingredient: "mælk", key: "0:2" };
const secondChoice: ComparisonChoice = { id: 4, ingredient: "mælk", key: "0:4" };
const firstMessage = "Choose product 2 for mælk instead.";
const secondMessage = "Choose product 4 for mælk instead.";

type Deferred = Readonly<{
  reject(error: Error): void;
  resolve(value?: unknown): void;
}>;

class DeferredHost implements ComparisonHost {
  readonly messages: string[] = [];
  readonly pending: Deferred[] = [];
  constructor(private readonly trace: string[]) {}

  sendMessage(message: ComparisonMessage): Promise<unknown> {
    const text = message.content[0].text;
    this.messages.push(text);
    this.trace.push(`send:${text}`);
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
  }
}

const stateLabel = ({ status, choice }: ComparisonState): string => `state:${status}${choice ? `:${choice}` : ""}`;

const expectedFor = (scenario: ComparisonScenario): Readonly<{ messages: readonly string[]; trace: readonly string[] }> => {
  switch (scenario) {
    case "success":
    case "duplicate":
      return { messages: [firstMessage], trace: [`state:pending:${firstChoice.key}`, `send:${firstMessage}`, `state:selected:${firstChoice.key}`] };
    case "failure":
      return { messages: [firstMessage], trace: [`state:pending:${firstChoice.key}`, `send:${firstMessage}`, `state:error:${firstChoice.key}`] };
    case "replacement":
      return { messages: [firstMessage], trace: [`state:pending:${firstChoice.key}`, `send:${firstMessage}`, "state:idle"] };
    case "stale-completion":
      return {
        messages: [firstMessage, secondMessage],
        trace: [
          `state:pending:${firstChoice.key}`,
          `send:${firstMessage}`,
          "state:idle",
          `state:pending:${secondChoice.key}`,
          `send:${secondMessage}`,
          `state:selected:${secondChoice.key}`,
        ],
      };
    case "dispose":
      return { messages: [firstMessage], trace: [`state:pending:${firstChoice.key}`, `send:${firstMessage}`, "state:disposed"] };
    case "remount":
      return {
        messages: [firstMessage, secondMessage],
        trace: [
          `state:pending:${firstChoice.key}`,
          `send:${firstMessage}`,
          "state:disposed",
          `state:pending:${secondChoice.key}`,
          `send:${secondMessage}`,
          `state:selected:${secondChoice.key}`,
        ],
      };
  }
};

export const runComparisonScenario = async (candidate: ComparisonCandidate, scenario: ComparisonScenario) => {
  const trace: string[] = [];
  const host = new DeferredHost(trace);
  const emit = (state: ComparisonState) => trace.push(stateLabel(state));
  let session = candidate.createSession(host, emit);
  const first = session.choose(firstChoice);

  switch (scenario) {
    case "success":
      host.pending[0]?.resolve();
      break;
    case "failure":
      host.pending[0]?.reject(new Error("synthetic send failure"));
      break;
    case "duplicate": {
      const duplicate = session.choose(firstChoice);
      host.pending[0]?.resolve();
      await duplicate;
      break;
    }
    case "replacement":
      session.replace();
      host.pending[0]?.resolve();
      break;
    case "stale-completion": {
      session.replace();
      const second = session.choose(secondChoice);
      host.pending[0]?.resolve();
      host.pending[1]?.resolve();
      await second;
      break;
    }
    case "dispose":
      session.dispose();
      host.pending[0]?.resolve();
      break;
    case "remount": {
      session.dispose();
      session = candidate.createSession(host, emit);
      const second = session.choose(secondChoice);
      host.pending[0]?.resolve();
      host.pending[1]?.resolve();
      await second;
      break;
    }
  }

  await first;
  return {
    actual: { messages: host.messages, trace },
    expected: expectedFor(scenario),
  };
};
