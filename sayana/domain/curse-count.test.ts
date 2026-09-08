import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countSpeech } from "./curse-count.ts";

describe("countSpeech", () => {
  it("keeps fuck, bhenchod, madarchod as separate keys and totals the sum", () => {
    const text = "fuck fuck fuck fuck fuck fuck fuck fuck fuck fuck fuck fuck bhenchod bhenchod bhenchod bhenchod bhenchod madhchod madarchod";
    const s = countSpeech(text);
    assert.equal(s.curseCounts.fuck, 12);
    assert.equal(s.curseCounts.bhenchod, 5);
    assert.equal(s.curseCounts.madarchod, 2);
    assert.equal(s.totalCurseCount, 19);
    assert.equal(s.curseCounts.motherfucker, undefined);
  });

  it("does not count fuck inside motherfucker", () => {
    const s = countSpeech("you motherfucker");
    assert.equal(s.curseCounts.motherfucker, 1);
    assert.equal(s.curseCounts.fuck ?? 0, 0);
    assert.equal(s.totalCurseCount, 1);
  });

  it("collapses Devanagari and romanization of the same slur", () => {
    const s = countSpeech("मादरचोद madarchod");
    assert.equal(s.curseCounts.madarchod, 2);
    assert.equal(s.totalCurseCount, 2);
  });

  it("counts standalone mc/bc only as tokens", () => {
    const s = countSpeech("mc bc mcdonald");
    assert.equal(s.curseCounts.madarchod, 1);
    assert.equal(s.curseCounts.bhenchod, 1);
  });
});
