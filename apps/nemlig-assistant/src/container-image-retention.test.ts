import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptedImageDigests,
  executeImageRetention,
  markLegacyImageResetComplete,
  parseImageRetentionLedger,
  parseRetentionCount,
  planImageRetention,
  readRegistryInventory,
  recordAcceptedImageRelease,
  recordRetentionDeleteIntent,
  resolveRetentionDeleteIntent,
  retentionDryRunFingerprint,
  type ImageRetentionLedger,
  type RegistryImageTag,
} from "../scripts/container-image-retention.js";

const accountId = "0123456789abcdef0123456789abcdef";
const repository = `${accountId}/nemlig-mcp-cloudflare-production-nemligmcpcontainer-production`;
const digest = (number: number): string => `sha256:${number.toString(16).padStart(64, "0")}`;
const image = (number: number, tag = `release-${number}`): RegistryImageTag => ({ tag, digest: digest(number) });

test("retention count defaults to ten and accepts any positive safe integer", () => {
  assert.equal(parseRetentionCount(undefined), 10);
  assert.equal(parseRetentionCount("1"), 1);
  assert.equal(parseRetentionCount("50"), 50);
  assert.equal(parseRetentionCount("25"), 25);
  assert.equal(parseRetentionCount("101"), 101);
  assert.equal(parseRetentionCount(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
  for (const value of ["0", "-1", "01", "1.5", "9007199254740992", "NaN"]) {
    assert.throws(() => parseRetentionCount(value), /image_retention_policy_invalid/u);
  }
});

test("retention fingerprint is stable and changes when production references change", () => {
  const accepted = { commit: "a".repeat(40), digest: digest(1), acceptedAt: "2026-09-23T08:00:00.000Z" };
  const inventory = { repository, tags: [image(1, accepted.commit)], inventoryComplete: true as const, catalogPages: 1, tagPages: 1 };
  const plan = planImageRetention({ repository, expectedRepository: repository, inventoryComplete: true, tags: inventory.tags, acceptedDigests: [accepted.digest] });
  const fingerprint = retentionDryRunFingerprint({ repository, inventory, holds: [], plan });
  assert.match(fingerprint, /^[0-9a-f]{64}$/u);

  const reordered = retentionDryRunFingerprint({ repository, inventory: { ...inventory, tags: [...inventory.tags].reverse() }, holds: [], plan });
  assert.equal(reordered, fingerprint, "provider ordering should not create false drift");
  const held = retentionDryRunFingerprint({ repository, inventory, holds: [{ digest: accepted.digest, reason: "recovery" }], plan });
  assert.notEqual(held, fingerprint, "changed live references invalidate prior evidence");
});

test("retains the configured accepted digest window newest-first and proposes oldest surplus first", () => {
  const acceptedDigests = Array.from({ length: 12 }, (_, index) => digest(index + 1));
  const plan = planImageRetention({
    repository, expectedRepository: repository, inventoryComplete: true,
    acceptedDigests,
    retainAccepted: 10,
    tags: [...acceptedDigests.map((value, index) => image(index + 1, `release-${value.slice(-2)}`)), image(1, "alias-current")],
  });

  assert.equal(plan.retainedAcceptedCount, 10);
  assert.deepEqual(plan.protected.map(({ digest: value }) => value), acceptedDigests.slice(0, 10));
  assert.deepEqual(plan.candidates.map(({ digest: value }) => value), [digest(12), digest(11)]);
  assert.deepEqual(plan.candidates[1]?.tags, ["release-0b"]);
  assert.deepEqual(plan.protected[0]?.tags, ["alias-current", "release-01"]);
});

test("active, recovery, uncertain, explicit and untracked images remain protected beyond the window", () => {
  const acceptedDigests = Array.from({ length: 12 }, (_, index) => digest(index + 1));
  const tags = [...acceptedDigests.map((_, index) => image(index + 1)), image(20), image(21), image(22), image(23)];
  const plan = planImageRetention({
    repository, expectedRepository: repository, inventoryComplete: true, acceptedDigests, tags, retainAccepted: 10,
    holds: [
      { digest: digest(11), reason: "active" },
      { digest: digest(12), reason: "recovery" },
      { digest: digest(20), reason: "uncertain" },
      { digest: digest(21), reason: "explicit" },
    ],
  });

  assert.deepEqual(plan.candidates.map(({ digest: value }) => value), []);
  assert.equal(plan.protected.find(({ digest: value }) => value === digest(11))?.reason, "active");
  assert.equal(plan.protected.find(({ digest: value }) => value === digest(12))?.reason, "recovery");
  assert.equal(plan.protected.find(({ digest: value }) => value === digest(20))?.reason, "uncertain");
  assert.equal(plan.protected.find(({ digest: value }) => value === digest(21))?.reason, "explicit");
  assert.equal(plan.protected.find(({ digest: value }) => value === digest(22))?.reason, "untracked");
});

test("the approved legacy reset selects every untracked digest but preserves live, recovery and uncertain holds", () => {
  const acceptedDigests = [digest(1)];
  const plan = planImageRetention({
    repository, expectedRepository: repository, inventoryComplete: true, acceptedDigests,
    tags: [image(1), image(20, "old-a"), image(21, "old-b"), image(22, "old-alias")],
    holds: [{ digest: digest(21), reason: "recovery" }, { digest: digest(23), reason: "uncertain" }],
    resetLegacy: true,
  });

  assert.deepEqual(plan.candidates.map(({ digest: value, reason }) => [value, reason]), [
    [digest(20), "legacy_reset"], [digest(22), "legacy_reset"],
  ]);
  assert.deepEqual(plan.protected.find(({ digest: value }) => value === digest(21)), {
    digest: digest(21), tags: ["old-b"], reason: "recovery",
  });
  assert.deepEqual(plan.protected.find(({ digest: value }) => value === digest(23)), {
    digest: digest(23), tags: [], reason: "uncertain",
  });
});

test("accepted-image ledger is exact, newest-first, idempotent, and records reset only after completion", () => {
  const empty: ImageRetentionLedger = { schema: 1, repository, accepted: [] };
  const first = { commit: "a".repeat(40), digest: digest(1), acceptedAt: "2026-09-23T06:00:00.000Z" };
  const second = { commit: "b".repeat(40), digest: digest(1), acceptedAt: "2026-09-23T07:00:00.000Z" };
  const ledger = recordAcceptedImageRelease(recordAcceptedImageRelease(empty, first), second);
  assert.deepEqual(ledger.accepted, [second, first], "distinct accepted commits retain their order even when they reuse one image digest");
  assert.deepEqual(acceptedImageDigests(ledger), [digest(1)], "retention counts unique images, not accepted commits");
  assert.deepEqual(recordAcceptedImageRelease(ledger, second), ledger, "a recovered replay of the same accepted release is a no-op");
  assert.equal(ledger.legacyResetCompletedAt, undefined);
  const reset = markLegacyImageResetComplete(ledger, "2026-09-23T08:00:00.000Z");
  assert.equal(reset.legacyResetCompletedAt, "2026-09-23T08:00:00.000Z");
  assert.deepEqual(markLegacyImageResetComplete(reset, "2026-09-23T09:00:00.000Z"), reset, "completed reset evidence is immutable");
  assert.throws(() => parseImageRetentionLedger({ ...ledger, extra: true }, repository), /image_retention_ledger_invalid/u);
  assert.throws(() => parseImageRetentionLedger({ ...ledger, repository: "other/repository" }, repository), /image_retention_ledger_invalid/u);
  assert.throws(() => recordAcceptedImageRelease(ledger, { ...second, digest: digest(3) }), /image_retention_ledger_commit_conflict/u);
  assert.throws(() => parseImageRetentionLedger({ ...ledger, accepted: [first, second] }, repository), /image_retention_ledger_invalid/u);

  let longHistory = recordAcceptedImageRelease(empty, { ...first, digest: digest(2) });
  for (let index = 1; index <= 100; index += 1) {
    longHistory = recordAcceptedImageRelease(longHistory, {
      commit: index.toString(16).padStart(40, "0"), digest: digest(1),
      acceptedAt: new Date(Date.parse("2026-09-23T08:00:00.000Z") + index * 1_000).toISOString(),
    });
  }
  assert.equal(longHistory.accepted.length, 101, "accepted commit evidence is not silently truncated");
  assert.equal(longHistory.accepted.at(-1)?.commit, first.commit, "older accepted releases remain available for replay detection");
  assert.deepEqual(recordAcceptedImageRelease(longHistory, { ...first, digest: digest(2) }), longHistory, "replaying an old accepted commit stays idempotent");
  assert.deepEqual(acceptedImageDigests(longHistory), [digest(1), digest(2)], "each digest appears once in newest-accepted order");
});

test("accepted image order derives from commit evidence without a duplicate digest ledger", () => {
  const accepted = [
    { commit: "c".repeat(40), digest: digest(3), acceptedAt: "2026-09-23T08:00:00.000Z" },
    { commit: "b".repeat(40), digest: digest(2), acceptedAt: "2026-09-23T07:00:00.000Z" },
    { commit: "a".repeat(40), digest: digest(2), acceptedAt: "2026-09-23T06:00:00.000Z" },
  ];
  const ledger = { schema: 1 as const, repository, accepted, cleanup: { commit: accepted[0]!.commit } };
  assert.deepEqual(acceptedImageDigests(ledger as ImageRetentionLedger), [digest(3), digest(2)]);
  assert.equal("images" in ledger, false);
});

test("durable delete intents never replay a tag whose outcome remains uncertain", () => {
  const accepted = { commit: "a".repeat(40), digest: digest(1), acceptedAt: "2026-09-23T08:00:00.000Z" };
  const ledger: ImageRetentionLedger = { schema: 1, repository, accepted: [accepted], cleanup: { commit: accepted.commit } };
  const intent = recordRetentionDeleteIntent(ledger, digest(2), "old-image");
  assert.deepEqual(intent.cleanup?.inFlight, { digest: digest(2), tag: "old-image" });
  assert.throws(() => resolveRetentionDeleteIntent(intent, true), /image_retention_delete_outcome_uncertain/u);
  const resolved = resolveRetentionDeleteIntent(intent, false);
  assert.equal(resolved.cleanup?.inFlight, undefined);
  assert.throws(() => recordRetentionDeleteIntent(intent, digest(3), "another-image"), /image_retention_delete_intent_invalid/u);
});

test("the plan includes every safe oldest-first candidate while unknown images stay held", () => {
  const acceptedDigests = Array.from({ length: 23 }, (_, index) => digest(index + 1));
  const tags = Array.from({ length: 25 }, (_, index) => image(index + 1));
  const plan = planImageRetention({
    repository, expectedRepository: repository, inventoryComplete: true,
    acceptedDigests, tags, retainAccepted: 10,
  });

  assert.deepEqual(plan.candidates.map(({ digest: value }) => value), [digest(23), digest(22), digest(21), digest(20), digest(19), digest(18), digest(17), digest(16), digest(15), digest(14), digest(13), digest(12), digest(11)]);
  assert.ok(plan.candidates.every(({ reason }) => reason === "accepted_surplus"));
  assert.equal(plan.protected.find(({ digest: value }) => value === digest(24))?.reason, "untracked");
  assert.deepEqual(plan, planImageRetention({
    repository, expectedRepository: repository, inventoryComplete: true, acceptedDigests, tags, retainAccepted: 10,
  }), "an unchanged registry and ledger produce a stable report");
});

test("a long-lived held accepted image does not cap or discard larger accepted-image histories", () => {
  const acceptedDigests = Array.from({ length: 125 }, (_, index) => digest(index + 1));
  const plan = planImageRetention({
    repository, expectedRepository: repository, inventoryComplete: true, acceptedDigests,
    retainAccepted: 10,
    tags: Array.from({ length: acceptedDigests.length }, (_, index) => image(index + 1)),
    holds: [{ digest: digest(125), reason: "recovery" }],
  });

  assert.equal(plan.retainedAcceptedCount, 11, "an accepted image held for recovery remains protected beyond the nominal window");
  assert.equal(plan.candidates.length, 114);
  assert.equal(plan.protected.find(({ digest: value }) => value === digest(125))?.reason, "recovery");
});

test("retention processes every safe candidate with fresh references and readback after each tag", async () => {
  let tags = Array.from({ length: 23 }, (_, index) => image(index + 1, `legacy-${index + 1}`));
  const ledger: ImageRetentionLedger = {
    schema: 1, repository,
    accepted: [{ commit: "a".repeat(40), digest: digest(1), acceptedAt: "2026-09-23T07:00:00.000Z" }],
    cleanup: { commit: "a".repeat(40) },
  };
  let holdReads = 0;
  let deleteCalls = 0;
  const savedLedgers: ImageRetentionLedger[] = [];
  const result = await executeImageRetention({ repository, expectedRepository: repository, ledger, retainAccepted: 10 }, {
    readInventory: async () => ({ repository, tags: [...tags], inventoryComplete: true, catalogPages: 1, tagPages: 1 }),
    readHolds: async () => {
      holdReads += 1;
      return [{ digest: digest(21), reason: "active" }, { digest: digest(22), reason: "recovery" }, { digest: digest(23), reason: "uncertain" }];
    },
    deleteTag: async (tag, expectedDigest) => {
      deleteCalls += 1;
      const current = tags.find((entry) => entry.tag === tag);
      assert.equal(current?.digest, expectedDigest, "delete receives a fresh exact tag/digest mapping");
      tags = tags.filter((entry) => entry.tag !== tag);
    },
    collectGarbage: async () => {},
    persistLedger: async (updated) => { savedLedgers.push(updated); },
    now: () => new Date("2026-09-23T08:00:00.000Z"),
  });

  assert.equal(result.deletedTags, 19);
  assert.equal(deleteCalls, 19);
  assert.deepEqual(result.deletedDigests, Array.from({ length: 19 }, (_, index) => digest(index + 2)).sort());
  assert.ok(result.inventoryReads > deleteCalls, "fresh inventory/readback occurs throughout cleanup");
  assert.ok(holdReads >= result.inventoryReads, "production references are re-read alongside each inventory");
  assert.deepEqual(tags.map(({ digest: value }) => value).sort(), [digest(1), digest(21), digest(22), digest(23)].sort());
  assert.ok(savedLedgers.length > 1, "every provider delete has a durable intent and readback checkpoint");
  assert.equal(savedLedgers.at(-1)?.cleanup?.inFlight, undefined);
  assert.equal(savedLedgers.at(-1)?.legacyResetCompletedAt, undefined);
  assert.equal(result.legacyResetCompleted, false);
  assert.equal(result.cleanupComplete, false);

  const resumed = await executeImageRetention({ repository, expectedRepository: repository, ledger: savedLedgers.at(-1)! }, {
    readInventory: async () => ({ repository, tags: [...tags], inventoryComplete: true, catalogPages: 1, tagPages: 1 }),
    readHolds: async () => [],
    deleteTag: async (tag, expectedDigest) => {
      assert.equal(tags.find((entry) => entry.tag === tag)?.digest, expectedDigest);
      tags = tags.filter((entry) => entry.tag !== tag);
    },
    collectGarbage: async () => {},
    persistLedger: async (updated) => { savedLedgers.push(updated); },
    now: () => new Date("2026-09-23T08:00:00.000Z"),
  });
  assert.equal(resumed.deletedTags, 3, "a later cleanup pass removes formerly held legacy images");
  assert.equal(savedLedgers.at(-1)?.legacyResetCompletedAt, "2026-09-23T08:00:00.000Z");
  assert.equal(resumed.cleanupComplete, true);
  assert.deepEqual(tags.map(({ digest: value }) => value), [digest(1)]);
});

test("ambiguous deletion stops without a second attempt or reset completion", async () => {
  const ledger: ImageRetentionLedger = {
    schema: 1, repository,
    accepted: [{ commit: "a".repeat(40), digest: digest(1), acceptedAt: "2026-09-23T07:00:00.000Z" }],
    cleanup: { commit: "a".repeat(40) },
  };
  let deletes = 0;
  let persistedLedger: ImageRetentionLedger | undefined;
  await assert.rejects(executeImageRetention({ repository, expectedRepository: repository, ledger }, {
    readInventory: async () => ({ repository, tags: [image(1), image(2)], inventoryComplete: true, catalogPages: 1, tagPages: 1 }),
    readHolds: async () => [],
    deleteTag: async () => { deletes += 1; throw new Error("network outcome uncertain"); },
    collectGarbage: async () => {},
    persistLedger: async (updated) => { persistedLedger = updated; },
    now: () => new Date("2026-09-23T08:00:00.000Z"),
  }), /network outcome uncertain/u);
  assert.equal(deletes, 1);
  assert.deepEqual(persistedLedger?.cleanup?.inFlight, { digest: digest(2), tag: "release-2" });
  await assert.rejects(executeImageRetention({ repository, expectedRepository: repository, ledger: persistedLedger! }, {
    readInventory: async () => ({ repository, tags: [image(1), image(2)], inventoryComplete: true, catalogPages: 1, tagPages: 1 }),
    readHolds: async () => [],
    deleteTag: async () => { throw new Error("must not replay an uncertain delete"); },
    collectGarbage: async () => {},
    persistLedger: async () => {},
    now: () => new Date("2026-09-23T08:00:00.000Z"),
  }), /image_retention_delete_outcome_uncertain/u);
  assert.equal(deletes, 1);
});

test("accepted-surplus cleanup continues after readback and can resume from its stale durable ledger", async () => {
  const releases = Array.from({ length: 12 }, (_, index) => ({
    commit: (index + 1).toString(16).padStart(40, "0"), digest: digest(12 - index),
    acceptedAt: new Date(Date.parse("2026-09-23T07:00:00.000Z") - index * 1_000).toISOString(),
  }));
  const ledger: ImageRetentionLedger = { schema: 1, repository, accepted: releases, cleanup: { commit: releases[0]!.commit } };
  let tags = releases.map(({ digest: value }) => ({ tag: `release-${value.slice(-2)}`, digest: value }));
  const result = await executeImageRetention({ repository, expectedRepository: repository, ledger, retainAccepted: 10 }, {
    readInventory: async () => ({ repository, tags: [...tags], inventoryComplete: true, catalogPages: 1, tagPages: 1 }),
    readHolds: async () => [],
    deleteTag: async (tag, expectedDigest) => {
      assert.equal(tags.find((entry) => entry.tag === tag)?.digest, expectedDigest);
      tags = tags.filter((entry) => entry.tag !== tag);
    },
    collectGarbage: async () => {},
    persistLedger: async () => {},
    now: () => new Date("2026-09-23T08:00:00.000Z"),
  });

  assert.equal(result.deletedTags, 2);
  assert.equal(result.cleanupComplete, true);
  assert.deepEqual(tags.map(({ digest: value }) => value).sort(), releases.slice(0, 10).map(({ digest: value }) => value).sort());
  assert.deepEqual(result.protected.map(({ digest: value }) => value).sort(), releases.slice(0, 10).map(({ digest: value }) => value).sort());
});

test("a newly observed recovery hold stops alias deletion and does not report the digest deleted", async () => {
  const accepted = { commit: "a".repeat(40), digest: digest(1), acceptedAt: "2026-09-23T07:00:00.000Z" };
  const ledger: ImageRetentionLedger = { schema: 1, repository, accepted: [accepted], cleanup: { commit: accepted.commit } };
  let tags = [image(1), image(2, "first-alias"), image(2, "second-alias")];
  let deleteCalls = 0;
  const report = await executeImageRetention({ repository, expectedRepository: repository, ledger }, {
    readInventory: async () => ({ repository, tags: [...tags], inventoryComplete: true, catalogPages: 1, tagPages: 1 }),
    readHolds: async () => deleteCalls > 0 ? [{ digest: digest(2), reason: "recovery" }] : [],
    deleteTag: async (tag, expectedDigest) => {
      assert.equal(tags.find((entry) => entry.tag === tag)?.digest, expectedDigest);
      deleteCalls += 1;
      tags = tags.filter((entry) => entry.tag !== tag);
    },
    collectGarbage: async () => {},
    persistLedger: async () => {},
    now: () => new Date("2026-09-23T08:00:00.000Z"),
  });

  assert.equal(deleteCalls, 1, "fresh recovery state prevents deleting the second alias");
  assert.deepEqual(report.deletedDigests, [], "the digest is still referenced by an undeleted alias");
  assert.deepEqual(tags.map(({ tag }) => tag), ["release-1", "second-alias"]);
  assert.equal(report.protected.find(({ digest: value }) => value === digest(2))?.reason, "recovery");
  assert.equal(report.legacyResetCompleted, false, "a held pre-reset image keeps the one-time reset resumable");
  assert.equal(report.cleanupComplete, false);
});

test("runner loss after tag deletion resumes from fresh inventory without replaying that delete", async () => {
  const releases = Array.from({ length: 12 }, (_, index) => ({
    commit: (index + 1).toString(16).padStart(40, "0"), digest: digest(12 - index),
    acceptedAt: new Date(Date.parse("2026-09-23T07:00:00.000Z") - index * 1_000).toISOString(),
  }));
  const latestCommit = releases[0]!.commit;
  const ledger: ImageRetentionLedger = {
    schema: 1, repository, accepted: releases,
    cleanup: { commit: latestCommit }, legacyResetCompletedAt: "2026-09-23T06:00:00.000Z",
  };
  let tags = releases.map(({ digest: value }) => ({ tag: `release-${value.slice(-2)}`, digest: value }));
  const deleteAttempts: string[] = [];
  const dependencies = {
    readInventory: async () => ({ repository, tags: [...tags], inventoryComplete: true as const, catalogPages: 1, tagPages: 1 }),
    readHolds: async () => [],
    deleteTag: async (tag: string, expectedDigest: string) => {
      deleteAttempts.push(expectedDigest);
      tags = tags.filter((entry) => entry.tag !== tag);
      if (deleteAttempts.length === 1) throw new Error("runner lost after provider delete");
    },
    collectGarbage: async () => {},
    persistLedger: async () => {},
    now: () => new Date("2026-09-23T08:00:00.000Z"),
  };

  await assert.rejects(executeImageRetention({ repository, expectedRepository: repository, ledger, retainAccepted: 10 }, dependencies), /runner lost after provider delete/u);
  const resumed = await executeImageRetention({ repository, expectedRepository: repository, ledger, retainAccepted: 10 }, dependencies);
  assert.equal(deleteAttempts.length, 2, "the fresh-inventory retry deletes only the still-present surplus digest");
  assert.equal(new Set(deleteAttempts).size, 2, "a successfully removed tag is never blindly retried");
  assert.equal(resumed.cleanupComplete, true);
  assert.equal(tags.length, 10);
});

test("incomplete or wrong-repository inventory fails closed", () => {
  assert.throws(() => planImageRetention({ repository, expectedRepository: repository, inventoryComplete: false, tags: [], acceptedDigests: [] }), /image_retention_inventory_incomplete/u);
  assert.throws(() => planImageRetention({ repository: "foreign", expectedRepository: repository, inventoryComplete: true, tags: [], acceptedDigests: [] }), /image_retention_repository_mismatch/u);
});

test("malformed, duplicate or missing accepted ledger entries fail closed", () => {
  const base = { repository, expectedRepository: repository, inventoryComplete: true, tags: [image(1)], acceptedDigests: [digest(1)] };
  assert.throws(() => planImageRetention({ ...base, acceptedDigests: [digest(1), digest(1)] }), /image_retention_ledger_invalid/u);
  assert.throws(() => planImageRetention({ ...base, acceptedDigests: ["bad"] }), /image_retention_ledger_invalid/u);
  assert.throws(() => planImageRetention({ ...base, acceptedDigests: [digest(2)] }), /image_retention_ledger_image_missing/u);
  assert.throws(() => planImageRetention({ ...base, tags: [...base.tags, image(2, "duplicate-release")] , retainAccepted: 0 }), /image_retention_policy_invalid/u);
});

test("tag changes, duplicate inventory rows, and malformed holds fail closed", () => {
  const base = { repository, expectedRepository: repository, inventoryComplete: true, tags: [image(1)], acceptedDigests: [digest(1)] };
  assert.throws(() => planImageRetention({ ...base, tags: [...base.tags, image(2, base.tags[0]!.tag)] }), /image_retention_tag_alias_changed/u);
  assert.throws(() => planImageRetention({ ...base, tags: [...base.tags, base.tags[0]!] }), /image_retention_tag_duplicate/u);
  assert.throws(() => planImageRetention({ ...base, holds: [{ digest: "bad", reason: "active" }] }), /image_retention_holds_invalid/u);
});

test("registry inventory follows bounded pagination and resolves every exact-repository tag", async () => {
  const seen: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    seen.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    assert.equal(new Headers(init?.headers).get("authorization"), "Basic dGVzdA==");
    if (url.pathname === "/v2/_catalog") {
      return url.searchParams.has("last")
        ? new Response(JSON.stringify({ repositories: [repository] }))
        : new Response(JSON.stringify({ repositories: ["other/repository"] }), {
          headers: { Link: `<${url.origin}/v2/_catalog?n=100&last=other%2Frepository>; rel="next"` },
        });
    }
    if (url.pathname === `/v2/${repository}/tags/list`) {
      return url.searchParams.has("last")
        ? new Response(JSON.stringify({ name: repository, tags: ["third"] }))
        : new Response(JSON.stringify({ name: repository, tags: ["one", "two"] }), {
          headers: { Link: `<${url.origin}${url.pathname}?n=100&last=two>; rel="next"` },
        });
    }
    if (url.pathname.startsWith(`/v2/${repository}/manifests/`)) {
      const tag = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      const number = { one: 1, two: 2, third: 3 }[tag as "one" | "two" | "third"];
      return new Response(null, { status: 200, headers: { "Docker-Content-Digest": digest(number) } });
    }
    throw new Error(`unexpected registry request ${url.pathname}`);
  };
  const inventory = await readRegistryInventory({ accountId, repository, authorization: "Basic dGVzdA==", fetcher });

  assert.deepEqual(inventory, {
    repository, inventoryComplete: true, catalogPages: 2, tagPages: 2,
    tags: [{ tag: "one", digest: digest(1) }, { tag: "third", digest: digest(3) }, { tag: "two", digest: digest(2) }],
  });
  assert.equal(seen.filter((request) => request.startsWith("HEAD ")).length, 3);
});

test("registry inventory rejects incomplete catalogs, cross-origin pagination, and changing tags", async () => {
  const input = { accountId, repository, authorization: "Basic dGVzdA==", fetcher: (async () => new Response(JSON.stringify({ repositories: [] }))) as typeof fetch };
  await assert.rejects(readRegistryInventory(input), /image_retention_registry_repository_missing/u);

  const crossOrigin: typeof fetch = async () => new Response(JSON.stringify({ repositories: [] }), {
    headers: { Link: "<https://attacker.invalid/v2/_catalog?n=100&last=x>; rel=next" },
  });
  await assert.rejects(readRegistryInventory({ ...input, fetcher: crossOrigin }), /image_retention_registry_pagination_invalid/u);

  const duplicate: typeof fetch = async (request) => {
    const url = new URL(String(request));
    if (url.pathname === "/v2/_catalog") return new Response(JSON.stringify({ repositories: [repository] }));
    if (url.pathname.endsWith("/tags/list")) return new Response(JSON.stringify({ name: repository, tags: ["one", "one"] }));
    throw new Error("a repeated tag must fail before manifest requests");
  };
  await assert.rejects(readRegistryInventory({ ...input, fetcher: duplicate }), /image_retention_registry_tag_duplicate/u);
});

test("registry inventory resolves every repository tag without an arbitrary concurrency cap", async () => {
  const tags = Array.from({ length: 1_001 }, (_, index) => `tag-${index}`);
  let inFlight = 0;
  let peak = 0;
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/v2/_catalog") return new Response(JSON.stringify({ repositories: [repository] }));
    if (url.pathname === `/v2/${repository}/tags/list`) return new Response(JSON.stringify({ name: repository, tags }));
    if (!url.pathname.startsWith(`/v2/${repository}/manifests/`)) throw new Error("unexpected registry request");
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await Promise.resolve();
    inFlight -= 1;
    return new Response(null, { status: 200, headers: { "Docker-Content-Digest": digest(1) } });
  };
  const inventory = await readRegistryInventory({ accountId, repository, authorization: "Basic dGVzdA==", fetcher });

  assert.equal(inventory.tags.length, 1_001);
  assert.equal(peak, 1_001);
});
