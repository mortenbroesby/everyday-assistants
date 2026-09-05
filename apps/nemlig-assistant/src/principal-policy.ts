import { z } from "zod";

export const MAX_PRINCIPAL_POLICY_BYTES = 16_384;
export const MAX_PRINCIPALS = 16;

const windowSchema = z.object({
  minute: z.number().int().positive(),
  month: z.number().int().positive(),
}).strict();

const tierLimitsSchema = z.object({
  "0": z.number().int().positive(),
  "1": z.number().int().positive(),
  "2": z.number().int().positive(),
}).strict();

const principalSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  principal_key: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/u),
  tier: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  enabled: z.boolean(),
}).strict();

const budgetsSchema = z.object({
  principal_minute_limits: tierLimitsSchema,
  tier0_reserve: windowSchema,
  guest_limit: windowSchema,
  tier1_shed_at: windowSchema,
  tier2_shed_at: windowSchema,
}).strict();

const refineBudgets = (budgets: z.infer<typeof budgetsSchema>, context: z.RefinementCtx): void => {
  for (const window of ["minute", "month"] as const) {
    if (budgets.tier2_shed_at[window] >= budgets.tier1_shed_at[window]
      || budgets.tier1_shed_at[window] > budgets.guest_limit[window]) {
      context.addIssue({ code: "custom", message: `invalid ${window} tier order` });
    }
  }
};

const version1PolicySchema = z.object({
  schema_version: z.literal(1),
  revision: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/u),
  budgets: budgetsSchema,
  principals: z.array(principalSchema.extend({
    nemlig: z.object({
      username: z.string().trim().min(1).max(320),
      password: z.string().min(1).max(1_024),
    }).strict(),
  }).strict()).min(1).max(MAX_PRINCIPALS),
}).strict().superRefine(({ budgets, principals }, context) => {
  if (new Set(principals.map(({ subject }) => subject)).size !== principals.length) {
    context.addIssue({ code: "custom", message: "duplicate subject" });
  }
  if (new Set(principals.map(({ principal_key }) => principal_key)).size !== principals.length) {
    context.addIssue({ code: "custom", message: "duplicate principal key" });
  }
  if (principals.filter(({ enabled, tier }) => enabled && tier === 0).length !== 1) {
    context.addIssue({ code: "custom", message: "exactly one enabled Tier 0 owner is required" });
  }
  refineBudgets(budgets, context);
});

const version2PolicySchema = z.object({
  schema_version: z.literal(2),
  revision: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/u),
  budgets: budgetsSchema,
  organization: z.object({
    id: z.string().regex(/^org_[A-Za-z0-9]{8,64}$/u),
  }).strict(),
  invitation: z.object({ default_tier: z.literal(1) }).strict(),
  owner: principalSchema.extend({ tier: z.literal(0), enabled: z.literal(true) }).strict(),
}).strict().superRefine(({ budgets }, context) => refineBudgets(budgets, context));

type Credentials = { username: string; password: string };
export interface Principal {
  subject: string;
  principal_key: string;
  tier: 0 | 1 | 2;
  enabled: boolean;
  nemlig?: Credentials;
}
export interface PrincipalPolicy {
  schema_version: 1 | 2;
  revision: string;
  budgets: z.infer<typeof budgetsSchema>;
  principals: Principal[];
  organization?: { id: string };
  invitation?: { default_tier: 1 };
}

export function parsePrincipalPolicy(raw: string | undefined): PrincipalPolicy {
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_PRINCIPAL_POLICY_BYTES) {
    throw new Error("NEMLIG_MCP_PRINCIPALS is invalid.");
  }
  try {
    const value: unknown = JSON.parse(raw);
    const version = value && typeof value === "object" && "schema_version" in value
      ? (value as { schema_version?: unknown }).schema_version
      : undefined;
    if (version === 1) return version1PolicySchema.parse(value);
    if (version === 2) {
      const policy = version2PolicySchema.parse(value);
      return { ...policy, principals: [policy.owner] };
    }
    throw new Error("invalid policy version");
  } catch {
    throw new Error("NEMLIG_MCP_PRINCIPALS is invalid.");
  }
}

export function findEnabledPrincipal(policy: PrincipalPolicy, subject: string): Principal | undefined {
  return policy.principals.find((principal) => principal.enabled && principal.subject === subject);
}
