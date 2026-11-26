import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import type { z } from "zod";

/** Compact the advertised output while retaining Zod's exact runtime validator. */
export const compactOutputSchema = (
  schema: z.ZodType,
): StandardSchemaWithJSON => {
  const standard = schema["~standard"];
  return {
    "~standard": {
      ...standard,
      jsonSchema: {
        ...standard.jsonSchema,
        output: (options) =>
          standard.jsonSchema.output({
            ...options,
            libraryOptions: { ...options.libraryOptions, reused: "ref" },
          }),
      },
    },
  };
};
