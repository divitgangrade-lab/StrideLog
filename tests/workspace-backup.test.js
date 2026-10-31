import test from "node:test";
import assert from "node:assert/strict";
import { createBackupDocument, parseBackupDocument } from "../workspace-backup.js";

const workspace = {
  students: [{
    id: "student-1",
    name: "Jordan Lee",
    quarters: { Q1: [{ id: "test-1", title: "Quiz", score: 85 }] },
  }],
  classes: ["Room 204"],
  reportDrafts: {},
};

test("workspace backup round-trips workspace data and binary files", async () => {
  const source = new Blob([new Uint8Array([0, 1, 2, 127, 128, 255])], { type: "application/octet-stream" });
  const backup = await createBackupDocument(workspace, [{
    id: "file-1",
    studentId: "student-1",
    quarter: "Q1",
    name: "resource.bin",
    type: source.type,
    data: source,
  }], "2026-10-31T12:00:00.000Z");
  const restored = await parseBackupDocument(JSON.stringify(backup));

  assert.deepEqual(restored.workspace, workspace);
  assert.equal(restored.files.length, 1);
  assert.equal(restored.files[0].name, "resource.bin");
  assert.deepEqual([...new Uint8Array(await restored.files[0].data.arrayBuffer())], [0, 1, 2, 127, 128, 255]);
});

test("workspace backup rejects unsupported formats and invalid file ownership", async () => {
  await assert.rejects(() => parseBackupDocument("{}"), /not a supported StrideLog/);
  const backup = await createBackupDocument(workspace, []);
  backup.files.push({
    id: "file-1",
    studentId: "missing-student",
    quarter: "Q1",
    name: "orphan.bin",
    data: "",
  });
  await assert.rejects(() => parseBackupDocument(JSON.stringify(backup)), /invalid student or quarter/);
});
