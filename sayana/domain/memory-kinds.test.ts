import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { memoryDraftsFromExtract } from "./memory-kinds.ts";
import type { DumpExtract } from "./types.ts";

function base(): DumpExtract {
  return {
    summary: "I dumped.",
    summaryBullets: ["I dumped."],
    languageMix: "en",
    lane: "work",
    overwhelmed: false,
    steps: [{ title: "Make 20 cold calls" }],
    people: [{ name: "Priya" }],
    openLoops: [],
    commitments: [],
    decisions: [{ title: "I slipped the deck to Friday" }],
    ideas: [{ title: "Maybe a Sunday market stall" }],
    questions: [{ title: "Why do we still do Monday sync?" }],
  };
}

describe("memoryDraftsFromExtract", () => {
  it("uses steps as commitments when commitments are empty", () => {
    const drafts = memoryDraftsFromExtract(base());
    assert.equal(
      drafts.some((d) => d.kind === "commitment" && d.title === "Make 20 cold calls"),
      true,
    );
    assert.equal(drafts.some((d) => d.kind === "decision"), true);
    assert.equal(drafts.some((d) => d.kind === "idea"), true);
    assert.equal(drafts.some((d) => d.kind === "person" && d.title === "Priya"), true);
    assert.equal(drafts.some((d) => d.kind === "question"), true);
  });

  it("does not duplicate a commitment that is already listed", () => {
    const extract = base();
    extract.commitments = [{ title: "Make 20 cold calls" }];
    const drafts = memoryDraftsFromExtract(extract);
    assert.equal(drafts.filter((d) => d.kind === "commitment").length, 1);
  });

  it("skips briefing drafts for a life ramble", () => {
    const extract = base();
    extract.lane = "life";
    assert.equal(memoryDraftsFromExtract(extract).length, 0);
  });
});
