import { createHash } from "node:crypto";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const tagPattern = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/u;
export const registryOrigin = "https://registry.cloudflare.com";
export const productionImageName = "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production";
const pageSize = 100;
const maximumPageBytes = 1024 * 1024;
export const defaultRetainedImages = 10;

export interface RegistryImageTag {
  tag: string;
  digest: string;
}

export interface ImageHold {
  digest: string;
  reason: "active" | "recovery" | "uncertain" | "explicit";
}

export interface RetentionPlanInput {
  repository: string;
  expectedRepository: string;
  inventoryComplete: boolean;
  tags: readonly RegistryImageTag[];
  /** Newest first. Empty is valid only before the first accepted release. */
  acceptedDigests: readonly string[];
  holds?: readonly ImageHold[];
  retainAccepted?: number;
}

export interface PlannedImage {
  digest: string;
  tags: string[];
  reason: "retained_window" | "active" | "recovery" | "uncertain" | "explicit" | "accepted_surplus" | "untracked";
}

export interface RetentionPlan {
  repository: string;
  retainedAcceptedCount: number;
  protected: PlannedImage[];
  candidates: PlannedImage[];
}

export interface RegistryInventory {
  repository: string;
  tags: RegistryImageTag[];
  inventoryComplete: true;
  catalogPages: number;
  tagPages: number;
}

export interface AcceptedImageRelease {
  commit: string;
  digest: string;
  acceptedAt: string;
}

export interface ImageRetentionLedger {
  schema: 1;
  repository: string;
  /** Newest first; every accepted commit supports idempotent replay detection. */
  accepted: AcceptedImageRelease[];
  /** Current accepted commit's cleanup checkpoint; absent until the first accepted release. */
  cleanup?: { commit: string; inFlight?: { digest: string; tag: string }; completedAt?: string };
}

const fail = (reason: string): never => { throw new Error(`image_retention_${reason}`); };

const validTimestamp = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** Strictly parses the durable ledger; unknown fields are rejected rather than ignored. */
export function parseImageRetentionLedger(value: unknown, expectedRepository: string): ImageRetentionLedger {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("ledger_invalid");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["schema", "repository", "accepted", "cleanup"].includes(key))
    || record.schema !== 1 || record.repository !== expectedRepository || !Array.isArray(record.accepted)) fail("ledger_invalid");
  const rows = record.accepted as unknown[];
  const parseAcceptedRows = (items: unknown[]): AcceptedImageRelease[] => {
    const seen = new Set<string>();
    const parsed: AcceptedImageRelease[] = [];
    let previousTime = Number.POSITIVE_INFINITY;
    for (const row of items) {
      if (!row || typeof row !== "object" || Array.isArray(row)) fail("ledger_invalid");
      const entry = row as Record<string, unknown>;
      if (Object.keys(entry).length !== 3 || Object.keys(entry).some((key) => !["commit", "digest", "acceptedAt"].includes(key))
        || typeof entry.commit !== "string" || !/^[0-9a-f]{40}$/u.test(entry.commit)
        || typeof entry.digest !== "string" || !digestPattern.test(entry.digest)
        || !validTimestamp(entry.acceptedAt)) fail("ledger_invalid");
      const commit = entry.commit as string;
      const imageDigest = entry.digest as string;
      const acceptedAt = entry.acceptedAt as string;
      const acceptedTime = Date.parse(acceptedAt);
      if (seen.has(commit) || acceptedTime > previousTime) fail("ledger_invalid");
      seen.add(commit);
      previousTime = acceptedTime;
      parsed.push({ commit, digest: imageDigest, acceptedAt });
    }
    return parsed;
  };
  const accepted = parseAcceptedRows(rows);
  let cleanup: ImageRetentionLedger["cleanup"];
  if (record.cleanup !== undefined) {
    if (!record.cleanup || typeof record.cleanup !== "object" || Array.isArray(record.cleanup)) fail("ledger_invalid");
    const checkpoint = record.cleanup as Record<string, unknown>;
    let inFlight: { digest: string; tag: string } | undefined;
    if (checkpoint.inFlight !== undefined) {
      if (!checkpoint.inFlight || typeof checkpoint.inFlight !== "object" || Array.isArray(checkpoint.inFlight)) fail("ledger_invalid");
      const flight = checkpoint.inFlight as Record<string, unknown>;
      if (Object.keys(flight).length !== 2 || typeof flight.digest !== "string" || !digestPattern.test(flight.digest)
        || typeof flight.tag !== "string" || !tagPattern.test(flight.tag)) fail("ledger_invalid");
      inFlight = { digest: flight.digest as string, tag: flight.tag as string };
    }
    if (Object.keys(checkpoint).some((key) => !["commit", "inFlight", "completedAt"].includes(key))
      || Object.keys(checkpoint).length < 1 || typeof checkpoint.commit !== "string" || !/^[0-9a-f]{40}$/u.test(checkpoint.commit)
      || !accepted.some(({ commit }) => commit === checkpoint.commit)
      || (checkpoint.completedAt !== undefined && !validTimestamp(checkpoint.completedAt))) fail("ledger_invalid");
    cleanup = {
      commit: checkpoint.commit as string,
      ...(inFlight ? { inFlight } : {}),
      ...(checkpoint.completedAt ? { completedAt: checkpoint.completedAt as string } : {}),
    };
  }
  return {
    schema: 1,
    repository: expectedRepository,
    accepted,
    ...(cleanup ? { cleanup } : {}),
  };
}

/** Projects accepted commit history into the unique image order used by retention. */
export function acceptedImageDigests(ledgerInput: ImageRetentionLedger): string[] {
  const ledger = parseImageRetentionLedger(ledgerInput, ledgerInput.repository);
  return [...new Set(ledger.accepted.map(({ digest }) => digest))];
}

/** Adds exact successful runtime acceptance evidence. */
export function recordAcceptedImageRelease(
  ledgerInput: ImageRetentionLedger,
  release: AcceptedImageRelease,
): ImageRetentionLedger {
  const ledger = parseImageRetentionLedger(ledgerInput, ledgerInput.repository);
  const existing = ledger.accepted.find((entry) => entry.commit === release.commit);
  if (existing) {
    if (existing.digest !== release.digest) fail("ledger_commit_conflict");
    return ledger;
  }
  const next = parseImageRetentionLedger({
    ...ledger,
    accepted: [release, ...ledger.accepted],
    cleanup: { commit: release.commit },
  }, ledger.repository);
  return next;
}

export function markImageRetentionComplete(ledgerInput: ImageRetentionLedger, completedAt: string): ImageRetentionLedger {
  const ledger = parseImageRetentionLedger(ledgerInput, ledgerInput.repository);
  const cleanup = ledger.cleanup;
  if (!validTimestamp(completedAt) || !ledger.accepted[0] || cleanup?.commit !== ledger.accepted[0].commit || cleanup?.inFlight) fail("ledger_invalid");
  return { ...ledger, cleanup: { commit: cleanup!.commit, completedAt } };
}

export function recordRetentionDeleteIntent(ledgerInput: ImageRetentionLedger, digest: string, tag: string): ImageRetentionLedger {
  const ledger = parseImageRetentionLedger(ledgerInput, ledgerInput.repository);
  const cleanup = ledger.cleanup;
  if (!cleanup || cleanup.commit !== ledger.accepted[0]?.commit || cleanup.completedAt || cleanup.inFlight
    || !digestPattern.test(digest) || !tagPattern.test(tag)) fail("delete_intent_invalid");
  return { ...ledger, cleanup: { ...cleanup!, inFlight: { digest, tag } } };
}

export function resolveRetentionDeleteIntent(ledgerInput: ImageRetentionLedger, tagStillPresent: boolean): ImageRetentionLedger {
  const ledger = parseImageRetentionLedger(ledgerInput, ledgerInput.repository);
  const checkpoint = ledger.cleanup;
  if (!checkpoint?.inFlight || checkpoint.completedAt) fail("delete_intent_invalid");
  if (tagStillPresent) fail("delete_outcome_uncertain");
  return {
    ...ledger,
    cleanup: { commit: checkpoint!.commit },
  };
}

/** Stable, content-addressed summary of every fact that affects a dry-run decision. */
export function retentionDryRunFingerprint(input: {
  repository: string;
  inventory: RegistryInventory;
  holds: readonly ImageHold[];
  plan: RetentionPlan;
}): string {
  if (input.inventory.repository !== input.repository || input.inventory.inventoryComplete !== true
    || input.plan.repository !== input.repository) fail("inventory_incomplete");
  const canonical = {
    repository: input.repository,
    tags: [...input.inventory.tags].map(({ tag, digest }) => ({ tag, digest }))
      .sort((left, right) => left.tag.localeCompare(right.tag) || left.digest.localeCompare(right.digest)),
    holds: [...input.holds].map(({ digest, reason }) => ({ digest, reason }))
      .sort((left, right) => left.digest.localeCompare(right.digest) || left.reason.localeCompare(right.reason)),
    protected: input.plan.protected.map(({ digest, tags, reason }) => ({ digest, tags: [...tags].sort(), reason }))
      .sort((left, right) => left.digest.localeCompare(right.digest)),
    candidates: input.plan.candidates.map(({ digest, tags, reason }) => ({ digest, tags: [...tags].sort(), reason }))
      .sort((left, right) => left.digest.localeCompare(right.digest)),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

const parsedPage = async (response: Response): Promise<Record<string, unknown>> => {
  if (!response.ok) fail(`registry_http_${response.status}`);
  const raw = await response.text();
  if (Buffer.byteLength(raw, "utf8") > maximumPageBytes) fail("registry_page_oversized");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail("registry_response_invalid"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("registry_response_invalid");
  return value as Record<string, unknown>;
};

const nextPage = (response: Response, expectedPath: string): URL | undefined => {
  const link = response.headers.get("link");
  if (link === null) return undefined;
  const entries = link.split(/,\s*(?=<)/u);
  const parsed = entries.map((entry) => /^\s*<([^<>]+)>\s*;\s*rel="?([A-Za-z]+)"?\s*$/iu.exec(entry));
  if (parsed.some((entry) => !entry)) fail("registry_pagination_invalid");
  const match = parsed.find((entry) => entry?.[2]?.toLowerCase() === "next");
  if (!match?.[1]) return undefined;
  let url: URL;
  try { url = new URL(match[1], registryOrigin); } catch { return fail("registry_pagination_invalid"); }
  if (url.origin !== registryOrigin || url.pathname !== expectedPath || url.username || url.password
    || url.searchParams.size !== 2 || [...url.searchParams.keys()].some((key) => !["n", "last"].includes(key))
    || url.searchParams.get("n") !== String(pageSize) || !url.searchParams.get("last")) fail("registry_pagination_invalid");
  return url;
};

const pageUrl = (first: URL, previous: Response | undefined, path: string): URL => {
  const next = previous ? nextPage(previous, path) : undefined;
  return next ?? first;
};

const validRegistryReference = (value: unknown): value is string => typeof value === "string" && (tagPattern.test(value) || digestPattern.test(value));

const nextTagPage = (response: Response, references: string[], expectedPath: string): URL | undefined => {
  const link = response.headers.get("link");
  if (link === null) return undefined;

  const strict = /^\s*<([^<>]+)>\s*;\s*rel="?next"?\s*$/iu.exec(link);
  if (strict?.[1]) {
    let url: URL;
    try { url = new URL(strict[1], registryOrigin); } catch { return fail("registry_pagination_invalid"); }
    if (url.origin !== registryOrigin || url.pathname !== expectedPath || url.username || url.password
      || url.searchParams.size !== 2 || [...url.searchParams.keys()].some((key) => !["n", "last"].includes(key))
      || url.searchParams.get("n") !== String(pageSize) || !url.searchParams.get("last")) fail("registry_pagination_invalid");
    return url;
  }

  if (references.length === 0) return undefined;
  const cloudflare = /^\s*([^;<>]+)\s*;\s*rel="?next"?\s*$/iu.exec(link);
  const cloudflareUrl = cloudflare?.[1];
  if (!cloudflareUrl) return fail("registry_pagination_invalid");
  let source: URL;
  try { source = new URL(cloudflareUrl); } catch { return fail("registry_pagination_invalid"); }
  const cursor = source.searchParams.getAll("last").at(-1);
  if (source.origin !== registryOrigin || source.pathname !== expectedPath || source.username || source.password
    || typeof cursor !== "string" || cursor !== references.at(-1) || !validRegistryReference(cursor)) return fail("registry_pagination_invalid");
  const next = new URL(`${registryOrigin}${expectedPath}`);
  next.searchParams.set("n", String(pageSize));
  next.searchParams.set("last", cursor);
  return next;
};

/** Lists one exact Cloudflare registry repository and resolves every tag to an immutable digest. */
export async function readRegistryInventory(input: {
  accountId: string;
  repository: string;
  authorization: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<RegistryInventory> {
  if (!/^[0-9a-f]{32}$/u.test(input.accountId) || input.repository !== `${input.accountId}/${productionImageName}`
    || !/^Basic [A-Za-z0-9+/]+={0,2}$/u.test(input.authorization)) fail("inventory_scope_invalid");
  const deadline = AbortSignal.timeout(120_000);
  const signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
  const request = async (url: URL, init: RequestInit): Promise<Response> => {
    try { return await input.fetcher(url, { ...init, signal }); }
    catch { return fail("registry_unavailable"); }
  };
  const repositoryPath = input.repository.split("/").map(encodeURIComponent).join("/");
  const catalogPath = "/v2/_catalog";
  const catalogFirst = new URL(`${registryOrigin}${catalogPath}?n=${pageSize}`);
  const seenCatalog = new Set<string>();
  let catalogResponse: Response | undefined;
  let catalogPages = 0;
  let repositoryFound = false;
  const seenRepositories = new Set<string>();
  do {
    const url = pageUrl(catalogFirst, catalogResponse, catalogPath);
    if (seenCatalog.has(url.href)) fail("registry_pagination_invalid");
    catalogPages += 1;
    seenCatalog.add(url.href);
    const response = await request(url, { headers: { Authorization: input.authorization } });
    const body = await parsedPage(response);
    const repositories = body.repositories;
    if (!Array.isArray(repositories)
      || !repositories.every((repository: unknown) => typeof repository === "string" && repository.length > 0 && repository.length <= 256)) fail("registry_catalog_invalid");
    for (const repository of repositories as string[]) {
      const normalized = repository.replace(/^\/+/, "");
      if (seenRepositories.has(normalized)) fail("registry_repository_duplicate");
      seenRepositories.add(normalized);
      if (normalized === input.repository) repositoryFound = true;
    }
    catalogResponse = response;
  } while (nextPage(catalogResponse, catalogPath));
  if (!repositoryFound) fail("registry_repository_missing");

  const tagsPath = `/v2/${repositoryPath}/tags/list`;
  const tagsFirst = new URL(`${registryOrigin}${tagsPath}?n=${pageSize}`);
  const seenTagPages = new Set<string>();
  const tagSet = new Set<string>();
  let nextTagsUrl: URL | undefined = tagsFirst;
  let tagPages = 0;
  while (nextTagsUrl) {
    const url = nextTagsUrl;
    if (seenTagPages.has(url.href)) fail("registry_pagination_invalid");
    tagPages += 1;
    seenTagPages.add(url.href);
    const response = await request(url, { headers: { Authorization: input.authorization } });
    const body = await parsedPage(response);
    if (body.name !== input.repository || !Array.isArray(body.tags)
      || !body.tags.every(validRegistryReference)) fail("registry_tags_invalid");
    const references = body.tags as string[];
    for (const tag of references.filter((reference) => tagPattern.test(reference))) {
      if (tagSet.has(tag)) fail("registry_tag_duplicate");
      tagSet.add(tag);
    }
    nextTagsUrl = nextTagPage(response, references, tagsPath);
  }
  if (tagSet.size === 0) fail("registry_tags_missing");

  const manifestAccept = "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json";
  const tags: RegistryImageTag[] = [];
  const sortedTags = [...tagSet].sort((left, right) => left.localeCompare(right));
  tags.push(...await Promise.all(sortedTags.map(async (tag) => {
    const url = new URL(`${registryOrigin}/v2/${repositoryPath}/manifests/${encodeURIComponent(tag)}`);
    const response = await request(url, { method: "HEAD", headers: { Authorization: input.authorization, Accept: manifestAccept } });
    if (!response.ok) fail(`registry_manifest_http_${response.status}`);
    const digest = response.headers.get("docker-content-digest");
    if (!digestPattern.test(digest ?? "")) fail("registry_manifest_digest_invalid");
    return { tag, digest: digest! };
  })));
  return { repository: input.repository, tags, inventoryComplete: true, catalogPages, tagPages };
}

const positiveInteger = (value: number | undefined, fallback: number, maximum: number): number => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) fail("policy_invalid");
  return resolved;
};

export function parseRetentionCount(raw: string | undefined): number {
  if (raw === undefined) return defaultRetainedImages;
  if (!/^[1-9][0-9]*$/u.test(raw)) fail("policy_invalid");
  return positiveInteger(Number(raw), defaultRetainedImages, Number.MAX_SAFE_INTEGER);
}

/** Pure, deterministic policy. All provider/reference reads must be complete before calling. */
export function planImageRetention(input: RetentionPlanInput): RetentionPlan {
  if (typeof input.repository !== "string" || input.repository.length === 0 || input.repository !== input.expectedRepository) fail("repository_mismatch");
  if (input.inventoryComplete !== true) fail("inventory_incomplete");
  const retainAccepted = positiveInteger(input.retainAccepted, defaultRetainedImages, Number.MAX_SAFE_INTEGER);

  const accepted = new Set<string>();
  for (const digest of input.acceptedDigests) {
    if (!digestPattern.test(digest) || accepted.has(digest)) fail("ledger_invalid");
    accepted.add(digest);
  }
  const holdByDigest = new Map<string, ImageHold["reason"]>();
  for (const hold of input.holds ?? []) {
    if (!digestPattern.test(hold.digest) || !["active", "recovery", "uncertain", "explicit"].includes(hold.reason)) fail("holds_invalid");
    const existing = holdByDigest.get(hold.digest);
    if (existing && existing !== hold.reason) {
      holdByDigest.set(hold.digest, "uncertain");
    } else {
      holdByDigest.set(hold.digest, hold.reason);
    }
  }

  const tagsByDigest = new Map<string, Set<string>>();
  const digestByTag = new Map<string, string>();
  for (const entry of input.tags) {
    if (!entry || typeof entry !== "object" || typeof entry.tag !== "string" || !tagPattern.test(entry.tag)
      || !digestPattern.test(entry.digest)) fail("inventory_invalid");
    const priorDigest = digestByTag.get(entry.tag);
    if (priorDigest && priorDigest !== entry.digest) fail("tag_alias_changed");
    if (priorDigest) fail("tag_duplicate");
    digestByTag.set(entry.tag, entry.digest);
    const aliases = tagsByDigest.get(entry.digest) ?? new Set<string>();
    aliases.add(entry.tag);
    tagsByDigest.set(entry.digest, aliases);
  }

  if (input.acceptedDigests.slice(0, retainAccepted).some((digest) => !tagsByDigest.has(digest))) fail("ledger_image_missing");

  const protectedDigests = new Set<string>(input.acceptedDigests.slice(0, retainAccepted));
  for (const digest of holdByDigest.keys()) protectedDigests.add(digest);
  const protectedImages: PlannedImage[] = [];
  const candidates: PlannedImage[] = [];

  for (const [digest, aliases] of [...tagsByDigest].sort(([left], [right]) => left.localeCompare(right))) {
    const tags = [...aliases].sort((left, right) => left.localeCompare(right));
    const hold = holdByDigest.get(digest);
    if (hold) {
      protectedImages.push({ digest, tags, reason: hold });
    } else if (protectedDigests.has(digest)) {
      protectedImages.push({ digest, tags, reason: "retained_window" });
    } else if (accepted.has(digest)) {
      candidates.push({ digest, tags, reason: "accepted_surplus" });
    } else {
      protectedImages.push({ digest, tags, reason: "untracked" });
    }
  }
  for (const [digest, reason] of holdByDigest) {
    if (!tagsByDigest.has(digest)) protectedImages.push({ digest, tags: [], reason });
  }

  // Accepted release order is authoritative; unknown images stay protected.
  const acceptedOrder = new Map(input.acceptedDigests.map((digest, index) => [digest, index]));
  candidates.sort((left, right) => {
    const leftOrder = acceptedOrder.get(left.digest);
    const rightOrder = acceptedOrder.get(right.digest);
    if (leftOrder !== undefined && rightOrder !== undefined) return rightOrder - leftOrder;
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;
    return left.digest.localeCompare(right.digest);
  });

  return {
    repository: input.repository,
    retainedAcceptedCount: [...protectedDigests].filter((digest) => accepted.has(digest)).length,
    protected: protectedImages,
    candidates,
  };
}

export interface RetentionExecutionDependencies {
  readInventory(signal: AbortSignal): Promise<RegistryInventory>;
  readHolds(signal: AbortSignal, inventory: RegistryInventory): Promise<readonly ImageHold[]>;
  deleteTag(tag: string, expectedDigest: string, signal: AbortSignal): Promise<void>;
  collectGarbage(signal: AbortSignal): Promise<void>;
  persistLedger(ledger: ImageRetentionLedger, signal: AbortSignal): Promise<void>;
  now(): Date;
}

export interface RetentionExecutionReport {
  repository: string;
  deletedDigests: string[];
  deletedTags: number;
  inventoryReads: number;
  protected: PlannedImage[];
  cleanupComplete: boolean;
}

/**
 * Deletes safe surplus tags sequentially, rechecking complete inventory and
 * protected references before each delete; uncertainty stops the operation.
 */
export async function executeImageRetention(input: {
  repository: string;
  expectedRepository: string;
  ledger: ImageRetentionLedger;
  retainAccepted?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}, dependencies: RetentionExecutionDependencies): Promise<RetentionExecutionReport> {
  let ledger = parseImageRetentionLedger(input.ledger, input.expectedRepository);
  if (ledger.repository !== input.repository) fail("repository_mismatch");
  if (ledger.accepted.length === 0) fail("accepted_baseline_missing");
  if (!ledger.cleanup || ledger.cleanup.commit !== ledger.accepted[0]?.commit || ledger.cleanup.completedAt) fail("cleanup_checkpoint_invalid");
  const timeoutMs = positiveInteger(input.timeoutMs, 600_000, 600_000);
  const retainAccepted = positiveInteger(input.retainAccepted, defaultRetainedImages, Number.MAX_SAFE_INTEGER);
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
  const deletedDigests = new Set<string>();
  let deletedTags = 0;
  let inventoryReads = 0;
  let finalPlan: RetentionPlan | undefined;

  const snapshot = async (): Promise<{ inventory: RegistryInventory; holds: readonly ImageHold[] }> => {
    if (signal.aborted) fail("deadline_exceeded");
    const inventory = await dependencies.readInventory(signal);
    inventoryReads += 1;
    if (inventory.repository !== input.repository || inventory.inventoryComplete !== true) fail("inventory_incomplete");
    const holds = await dependencies.readHolds(signal, inventory);
    return { inventory, holds };
  };
  const plan = (inventory: RegistryInventory, holds: readonly ImageHold[]): RetentionPlan => planImageRetention({
    repository: input.repository,
    expectedRepository: input.expectedRepository,
    inventoryComplete: inventory.inventoryComplete,
    tags: inventory.tags,
    acceptedDigests: acceptedImageDigests(ledger),
    holds,
    retainAccepted,
  });

  const priorIntent = ledger.cleanup?.inFlight;
  if (priorIntent) {
    const current = await snapshot();
    const tagStillPresent = current.inventory.tags.some(({ tag }) => tag === priorIntent.tag);
    ledger = resolveRetentionDeleteIntent(ledger, tagStillPresent);
    await dependencies.persistLedger(ledger, signal);
  }

  while (true) {
    const current = await snapshot();
    finalPlan = plan(current.inventory, current.holds);
    if (finalPlan.candidates.length === 0) break;

    for (const { digest } of finalPlan.candidates) {
      let digestAbsent = false;
      while (true) {
        const fresh = await snapshot();
        const freshPlan = plan(fresh.inventory, fresh.holds);
        const candidate = freshPlan.candidates.find((image) => image.digest === digest);
        if (!candidate) break;
        const tag = candidate.tags[0];
        if (!tag) fail("candidate_tag_missing");
        const mapping = fresh.inventory.tags.find((entry) => entry.tag === tag);
        if (mapping?.digest !== digest) fail("tag_mapping_changed");

        ledger = recordRetentionDeleteIntent(ledger, digest, tag);
        await dependencies.persistLedger(ledger, signal);
        await dependencies.deleteTag(tag, digest, signal);
        deletedTags += 1;

        const readback = await snapshot();
        const after = readback.inventory.tags.find((entry) => entry.tag === tag);
        if (after) fail(after.digest === digest ? "delete_readback_still_present" : "delete_readback_changed");
        digestAbsent = !readback.inventory.tags.some((entry) => entry.digest === digest);
        ledger = resolveRetentionDeleteIntent(ledger, false);
        await dependencies.persistLedger(ledger, signal);
        if (digestAbsent) break;
      }
      if (digestAbsent) deletedDigests.add(digest);
    }
  }

  if (!finalPlan) fail("inventory_incomplete");
  const acceptedDigests = acceptedImageDigests(ledger);
  const acceptedSet = new Set(acceptedDigests);
  const retainedWindow = new Set(acceptedDigests.slice(0, retainAccepted));
  const untrackedImagesStillHeld = finalPlan.protected.some((entry) => entry.tags.length > 0 && entry.reason === "untracked");
  const acceptedImagesStillHeld = finalPlan.protected.some((entry) => entry.tags.length > 0
    && acceptedSet.has(entry.digest) && !retainedWindow.has(entry.digest)
    && ["active", "recovery", "uncertain", "explicit"].includes(entry.reason));
  if (untrackedImagesStillHeld || acceptedImagesStillHeld) {
    return {
      repository: input.repository,
      deletedDigests: [...deletedDigests].sort((left, right) => left.localeCompare(right)),
      deletedTags,
      inventoryReads,
      protected: finalPlan.protected,
      cleanupComplete: false,
    };
  }
  await dependencies.collectGarbage(signal);
  const updatedLedger = markImageRetentionComplete(ledger, dependencies.now().toISOString());
  await dependencies.persistLedger(updatedLedger, signal);
  return {
    repository: input.repository,
    deletedDigests: [...deletedDigests].sort((left, right) => left.localeCompare(right)),
    deletedTags,
    inventoryReads,
    protected: finalPlan.protected,
    cleanupComplete: true,
  };
}
