import { z } from "zod";
import { productViewSchema } from "./product-view-schema.js";
import type { ProductView } from "./product-presentation.js";

const reviewItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().int().positive(),
  state: z.enum(["needs-review", "ready"]),
  view: productViewSchema,
});

/** The public review payload; private draft and journal state are not serialized here. */
export const reviewSnapshotSchema = z.object({
  basketMode: z.enum(["native-list", "direct-basket"]).optional(),
  draftId: z.string().uuid().optional(),
  draftExpiresAt: z.number().int().nonnegative().optional(),
  shoppingListId: z.number().int().positive().optional(),
  reviewContextId: z.string().uuid().optional(),
  shoppingListName: z.string().optional(),
  saveStatus: z.enum(["saving", "saved", "partial", "uncertain"]).optional(),
  shoppingListDirty: z.boolean().optional(),
  updateStatus: z.enum(["saving", "partial", "uncertain"]).optional(),
  conflictItems: z.array(reviewItemSchema).optional(),
  saveProgress: z
    .object({
      completed: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .strict()
    .optional(),
  actionNotice: z.string().max(300).optional(),
  revision: z.number().int().nonnegative().optional(),
  operationStatus: z.enum(["editing", "submitting"]).optional(),
  submissionAttempted: z.boolean().optional(),
  destination: z.enum(["needs-review", "ready", "alternatives"]),
  items: z.array(reviewItemSchema),
  alternatives: z
    .object({
      product_id: z.number().int().positive(),
      origin: z.enum(["needs-review", "ready"]),
      query: z.string(),
      views: z.array(productViewSchema),
    })
    .optional(),
  submission: z
    .object({
      submission_id: z.string().uuid(),
      status: z.enum(["prepared", "submitted", "uncertain", "partial"]),
      verified_additions: z.number().int().nonnegative().optional(),
      cleanup_warning: z.string().optional(),
      skipped_products: z
        .array(
          z.object({
            product_id: z.number().int().positive(),
            name: z.string(),
          }),
        )
        .optional(),
      expires_at: z.string(),
      review: z.record(z.string(), z.unknown()),
    })
    .optional(),
});

const nonnegativeAmount = z.number().finite().nonnegative();
const submittedLineSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().int().positive(),
  name: z.string().optional(),
  unit_size: z.string().optional(),
  item_price: nonnegativeAmount.optional(),
  line_total: nonnegativeAmount.optional(),
});
const submissionDetailsSchema = z
  .object({
    lines: z.array(submittedLineSchema).optional(),
    expected_products_price: nonnegativeAmount.optional(),
    skipped_products: z
      .array(
        z.object({ product_id: z.number().int().positive(), name: z.string() }),
      )
      .optional(),
  })
  .catchall(z.unknown());

/** Cached host cards may omit origin/expiry and have older product fact shapes. */
export const viewerReviewSchema = reviewSnapshotSchema.extend({
  items: z.array(reviewItemSchema.extend({ view: z.unknown() })),
  conflictItems: z
    .array(reviewItemSchema.extend({ view: z.unknown() }))
    .optional(),
  alternatives: reviewSnapshotSchema.shape.alternatives
    .unwrap()
    .extend({
      origin: z.enum(["needs-review", "ready"]).optional(),
      views: z.array(z.unknown()),
    })
    .optional(),
  submission: reviewSnapshotSchema.shape.submission
    .unwrap()
    .extend({
      expires_at: z.string().optional(),
      review: submissionDetailsSchema,
    })
    .optional(),
});

export type ReviewWireSnapshot = z.infer<typeof reviewSnapshotSchema>;

export type ReviewItem = Omit<ReviewWireSnapshot["items"][number], "view"> & {
  view: ProductView;
};

export type ReviewSubmissionDetails = z.infer<typeof submissionDetailsSchema>;

/** ProductView is narrower than its published schema; callers validate it separately. */
export type ReviewSnapshot = Omit<
  ReviewWireSnapshot,
  "items" | "conflictItems" | "alternatives" | "submission"
> & {
  items: ReviewItem[];
  conflictItems?: ReviewItem[];
  alternatives?: Omit<
    NonNullable<ReviewWireSnapshot["alternatives"]>,
    "views"
  > & { views: ProductView[] };
  submission?: Omit<NonNullable<ReviewWireSnapshot["submission"]>, "review"> & {
    review: ReviewSubmissionDetails;
  };
};

/** Cached host cards and visual fixtures predate these two server-only fields. */
export type ViewerReview = Omit<
  ReviewSnapshot,
  "alternatives" | "submission"
> & {
  alternatives?: Omit<NonNullable<ReviewSnapshot["alternatives"]>, "origin"> & {
    origin?: ReviewItem["state"];
  };
  submission?: Omit<NonNullable<ReviewSnapshot["submission"]>, "expires_at"> & {
    expires_at?: string;
  };
};
