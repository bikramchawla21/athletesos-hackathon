import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasArabicScript } from "./script.ts";

describe("hasArabicScript", () => {
  it("flags Urdu/Arabic letters and ignores Hindi Devanagari", () => {
    assert.equal(hasArabicScript("میں ٹھیک ہوں"), true);
    assert.equal(hasArabicScript("मैं ठीक हूँ"), false);
    assert.equal(hasArabicScript("I made 20 cold calls"), false);
  });
});
