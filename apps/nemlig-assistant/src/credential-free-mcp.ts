const basketIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean => Object.keys(value).every((key) => allowed.includes(key));

const isLocalBasketStart = (name: string, args: unknown): boolean =>
  name === "start_product_review" &&
  isRecord(args) &&
  Object.keys(args).length === 0;

const isUpdateTool = (name: string): boolean =>
  name === "update_product_review" ||
  name === "update_product_review_conversation";

const isLocalReadAction = (kind: unknown): boolean =>
  kind === "list" || kind === "show";

const isExplicitLocalMutation = (kind: unknown, basketId: unknown): boolean =>
  (kind === "select" || kind === "delete" || kind === "heartbeat") &&
  typeof basketId === "string" &&
  basketIdPattern.test(basketId);

const isLocalBasketAction = (name: string, args: unknown): boolean => {
  if (!isUpdateTool(name) || !isRecord(args)) {
    return false;
  }
  if (!hasOnlyKeys(args, ["action", "basket_id"]) || !isRecord(args.action)) {
    return false;
  }
  if (!hasOnlyKeys(args.action, ["kind"])) {
    return false;
  }
  return (
    isLocalReadAction(args.action.kind) ||
    isExplicitLocalMutation(args.action.kind, args.basket_id)
  );
};

/** True only for MCP tool calls that do not need Nemlig credentials or access. */
export const isCredentialFreeMcpCall = (
  name: unknown,
  args: unknown,
): boolean =>
  typeof name === "string" &&
  (isLocalBasketStart(name, args) || isLocalBasketAction(name, args));
