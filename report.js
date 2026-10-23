import { QUARTERS } from "./importer.js";

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function buildProgressReport(student, date = new Date()) {
  const assessments = QUARTERS.flatMap((quarter) =>
    (student.quarters[quarter] || []).map((assessment) => ({ ...assessment, quarter })),
  );
  const scored = assessments.filter(
    (assessment) => Number.isFinite(assessment.score) && assessment.score >= 0 && assessment.score <= 100,
  );
  const average = scored.length
    ? `${(scored.reduce((sum, assessment) => sum + assessment.score, 0) / scored.length).toFixed(1)}%`
    : "Not available";
  const assessmentLines = assessments.length
    ? assessments.map((assessment) => {
      const score = Number.isFinite(assessment.score) ? `${assessment.score}%` : "No score recorded";
      return `  - ${assessment.quarter}: ${assessment.title || "Assessment"} — ${score}`;
    })
    : ["  - No assessments recorded yet."];
  const notes = student.notes?.trim() || "[Add observations about this student's progress.]";

  return [
    "STUDENT PROGRESS REPORT",
    "=======================",
    `Student: ${student.name}`,
    `Class: ${student.className || "[Enter class / course]"}`,
    `Reporting period: [Enter reporting period]`,
    `Prepared: ${formatDate(date)}`,
    "",
    "IEP GOAL / OBJECTIVE",
    "[Enter the goal or objective exactly as written in the student's IEP.]",
    "",
    "PROGRESS MEASURE",
    "[Describe the measure, data source, and frequency used to monitor progress.]",
    "",
    "TARGET / CRITERION",
    "[Enter the measurable target or mastery criterion.]",
    "",
    "PROGRESS SUMMARY",
    `[Summarize progress toward the goal and whether the student is on track. Current recorded assessment average: ${average} (${scored.length} scored of ${assessments.length} listed).]`,
    "",
    "ASSESSMENT RECORD",
    ...assessmentLines,
    "",
    "TEACHER OBSERVATIONS",
    notes,
    "",
    "NEXT STEPS / SUPPORTS",
    "[Describe the next instructional steps, accommodations, or supports.]",
    "",
    "This is an editable working template, not an official VDOE or district form.",
  ].join("\n");
}

export function reportFileName(studentName) {
  const safeName = studentName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${safeName || "student"}-progress-report.txt`;
}
