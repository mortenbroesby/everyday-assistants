import { z } from "zod";

export const MAX_PRINCIPAL_POLICY_BYTES = 16_384;
export const MAX_PRINCIPALS = 16;

const subjectSchema = z.string().min(1).max(500).refine((value) => value.trim() === value);
const principalSchema = z.object({
  subject: subjectSchema,
  principal_key: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/u),
  enabled: z.boolean(),
}).strict();

const policySchema = z.object({
  schema_version: z.literal(3),
  revision: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/u),
  owner_subject: subjectSchema,
  principals: z.array(principalSchema).min(1).max(MAX_PRINCIPALS),
}).strict().superRefine(({ owner_subject, principals }, context) => {
  if (new Set(principals.map(({ subject }) => subject)).size !== principals.length) {
    context.addIssue({ code: "custom", message: "duplicate subject" });
  }
  if (new Set(principals.map(({ principal_key }) => principal_key)).size !== principals.length) {
    context.addIssue({ code: "custom", message: "duplicate principal key" });
  }
  if (principals.filter(({ subject, enabled }) => subject === owner_subject && enabled).length !== 1) {
    context.addIssue({ code: "custom", message: "exactly one enabled configured owner is required" });
  }
});

export type Principal = z.infer<typeof principalSchema>;
export type PrincipalPolicy = z.infer<typeof policySchema>;

export function parsePrincipalPolicy(raw: string | undefined): PrincipalPolicy {
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_PRINCIPAL_POLICY_BYTES) {
    throw new Error("NEMLIG_MCP_PRINCIPALS is invalid.");
  }
  try {
    return policySchema.parse(JSON.parse(raw));
  } catch {
    throw new Error("NEMLIG_MCP_PRINCIPALS is invalid.");
  }
}

export function findEnabledPrincipal(policy: PrincipalPolicy, subject: string): Principal | undefined {
  return policy.principals.find((principal) => principal.enabled && principal.subject === subject);
}
