import test from "node:test";
import assert from "node:assert/strict";
import { isDecliningTrend, scoreTrendFor } from "../analytics.js";

test("trend analysis uses the last three scores and a -5 point slope threshold", () => {
  assert.equal(scoreTrendFor([90, 80]), null);
  assert.equal(scoreTrendFor([90, 100, 75, 70, 65]), -5);
  assert.equal(isDecliningTrend([80, 75, 70]), true);
  assert.equal(isDecliningTrend([80, 76, 72]), false);
  assert.equal(isDecliningTrend([80, 75, 70, 80]), false);
});
