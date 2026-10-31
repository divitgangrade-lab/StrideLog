export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

const TEST_HEADER = /^test\s*(?:number\s*)?(\d+)/i;

function emptyStudent(name) {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    name,
    className: "",
    notes: "",
    links: [],
    quarters: Object.fromEntries([...QUARTERS, "Misc files"].map((quarter) => [quarter, []])),
  };
}

function parseStudentLabel(label) {
  const match = label.trim().match(/^(.*?)\s+(Q[1-4])$/i);
  return match
    ? { name: match[1].trim(), quarter: match[2].toUpperCase() }
    : { name: label.trim(), quarter: "Q1" };
}

function parseAssessment(value, number) {
  const text = value.trim();
  if (!text) return null;

  const match = text.match(/^(\d+(?:\.\d+)?)\s*(?:%|[-–:]\s*)?(.*)$/);
  const score = match && Number(match[1]) <= 100 ? Number(match[1]) : null;
  const title = match ? (match[2].trim() || `Test ${number}`) : text;
  return {
    id: `import-${number}-${crypto.randomUUID()}`,
    title,
    score,
    category: "Other",
  };
}

export function parseSpreadsheetRows(rows) {
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => cell.trim().toLowerCase() === "student name"),
  );
  if (headerIndex < 0) {
    throw new Error('Could not find a "Student Name" header in the spreadsheet.');
  }

  const headers = rows[headerIndex].map((cell) => cell.trim());
  const nameIndex = headers.findIndex((cell) => cell.toLowerCase() === "student name");
  const noteIndex = headers.findIndex((cell) => cell.toLowerCase() === "notes");
  const linksIndex = headers.findIndex((cell) => cell.toLowerCase() === "links to files");
  const testColumns = headers.flatMap((header, index) => {
    const match = header.match(TEST_HEADER);
    return match ? [{ index, number: Number(match[1]) }] : [];
  });
  if (testColumns.length === 0) {
    throw new Error("No test columns were found in the spreadsheet.");
  }

  const students = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    const label = row[nameIndex]?.trim();
    if (!label) continue;
    if (label.toLowerCase() === "student name") continue;

    const { name, quarter } = parseStudentLabel(label);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!students.has(key)) students.set(key, emptyStudent(name));
    const student = students.get(key);
    const assessments = student.quarters[quarter];

    for (const column of testColumns) {
      const assessment = parseAssessment(row[column.index] || "", column.number);
      if (assessment) assessments.push(assessment);
    }

    const note = row[noteIndex]?.trim();
    if (note) student.notes = [student.notes, note].filter(Boolean).join("\n");
    const links = row[linksIndex]?.split(/\s*,\s*|\n/).filter(Boolean) || [];
    student.links.push(...links);
  }

  if (students.size === 0) {
    throw new Error("The spreadsheet contains no student rows.");
  }
  return [...students.values()];
}
