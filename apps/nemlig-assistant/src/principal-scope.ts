import { createHash } from "node:crypto";
import { z } from "zod";

export const principalScopeFor = (principalKey: string): string => {
  const key = z.string().trim().min(1).max(500).parse(principalKey);
  return createHash("sha256").update(key, "utf8").digest("hex");
};
