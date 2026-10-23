import test from "node:test";
import assert from "node:assert/strict";
import { buildProgressReport, reportFileName } from "../report.js";

test("builds an editable progress report with IEP prompts and recorded assessments", () => {
  const report = buildProgressReport({
    name: "Jordan Lee",
    className: "Room 204",
    notes: "Uses the number line independently.",
    quarters: {
      Q1: [{ title: "Fractions check", score: 80 }],
      Q2: [{ title: "Reading observation", score: null }],
      Q3: [],
      Q4: [],
    },
  }, new Date("2026-05-20T12:00:00Z"));

  assert.match(report, /Student: Jordan Lee/);
  assert.match(report, /Class: Room 204/);
  assert.match(report, /Reporting period: \[Enter reporting period\]/);
  assert.match(report, /IEP GOAL \/ OBJECTIVE/);
  assert.match(report, /Q1: Fractions check — 80%/);
  assert.match(report, /Q2: Reading observation — No score recorded/);
  assert.match(report, /Current recorded assessment average: 80\.0%/);
  assert.match(report, /Uses the number line independently\./);
  assert.match(report, /not an official VDOE or district form/);
});

test("builds a report without scores and a safe download filename", () => {
  const report = buildProgressReport({
    name: "Alex",
    className: "",
    notes: "",
    quarters: { Q1: [], Q2: [], Q3: [], Q4: [] },
  }, new Date("2026-05-20T12:00:00Z"));

  assert.match(report, /Class: \[Enter class \/ course\]/);
  assert.match(report, /Current recorded assessment average: Not available/);
  assert.match(report, /No assessments recorded yet/);
  assert.match(report, /Add observations about this student's progress/);
  assert.equal(reportFileName("Zoë O'Neil / Jr."), "Zoe-O-Neil-Jr-progress-report.txt");
});
