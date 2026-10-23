import test from "node:test";
import assert from "node:assert/strict";
import { parseSpreadsheetRows } from "../importer.js";

const headers = [
  "Student Name",
  "Test Number 1 in percent",
  "Test Number 2",
  "Test Number 3",
  "Notes",
  "Links to files",
];

test("imports names, quarters, named scores, notes, and file links", () => {
  const students = parseSpreadsheetRows([
    ["EXAMPLE"],
    headers,
    ["Josh Q1", "50 - Inequalities Test", "60 - Vocab Quiz", "70 - Chapter exam", "He slowly improved", "https://school.example/iep"],
    ["Josh Q2", "80", "", "90 - Exit Ticket", "Same as last quarter", ""],
    ["Bella Q3", "30", "50 - Quiz", "40", "", ""],
  ]);

  assert.equal(students.length, 2);
  assert.equal(students[0].name, "Josh");
  assert.deepEqual(students[0].quarters.Q1.map(({ title, score }) => [title, score]), [
    ["Inequalities Test", 50],
    ["Vocab Quiz", 60],
    ["Chapter exam", 70],
  ]);
  assert.deepEqual(students[0].quarters.Q2.map(({ title, score }) => [title, score]), [
    ["Test 1", 80],
    ["Exit Ticket", 90],
  ]);
  assert.equal(students[0].notes, "He slowly improved\nSame as last quarter");
  assert.deepEqual(students[0].links, ["https://school.example/iep"]);
  assert.equal(students[1].quarters.Q3.length, 3);
  assert.deepEqual(students[1].quarters.Q1, []);
});

test("skips blank assessment slots and repeated header rows", () => {
  const students = parseSpreadsheetRows([
    headers,
    ["Alex Q1", "", "95 - Final", ""],
    headers,
    ["Student Name", "Test Number 1 in percent", "Test Number 2", "Test Number 3", "Notes", "Links to files"],
  ]);

  assert.equal(students.length, 1);
  assert.equal(students[0].quarters.Q1.length, 1);
  assert.equal(students[0].quarters.Q1[0].title, "Final");
  assert.equal(students[0].quarters.Q1[0].score, 95);
});

test("keeps non-score test names and represents an unscored assessment", () => {
  const [student] = parseSpreadsheetRows([
    ["Student Name", "Test Number 1"],
    ["Sam", "Reading observation"],
  ]);

  assert.equal(student.name, "Sam");
  assert.equal(student.quarters.Q1[0].title, "Reading observation");
  assert.equal(student.quarters.Q1[0].score, null);
});

test("reports a useful error when required spreadsheet headers are missing", () => {
  assert.throws(
    () => parseSpreadsheetRows([["Name", "Score"], ["Sam", "90"]]),
    /Student Name/,
  );
  assert.throws(
    () => parseSpreadsheetRows([["Student Name", "Notes"], ["Sam", "Ready"]]),
    /No test columns/,
  );
});
