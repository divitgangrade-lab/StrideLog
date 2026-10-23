import { parseSpreadsheetRows, QUARTERS } from "./importer.js";
import { buildProgressReport, reportFileName } from "./report.js";
import { unzipHtml } from "./zip.js";
import { parseXlsxRows } from "./xlsx.js";
import { officeDocumentPreview } from "./file-preview.js";

const STORAGE_KEY = "stridelog-workspace-v1";
const TUTORIAL_KEY = "stridelog-tutorial-completed-v1";
const FILE_DB_NAME = "stridelog-resources";
const FILE_STORE_NAME = "student-files";
const QUARTER_TABS = [...QUARTERS, "Misc files"];
const AVATAR_TONES = ["", "tone-1", "tone-2", "tone-3", "tone-4"];

const studentList = document.querySelector("#roster-list");
const studentSearch = document.querySelector("#student-search");
const homeView = document.querySelector("#home-view");
const classView = document.querySelector("#class-view");
const studentView = document.querySelector("#student-view");
const emptyState = document.querySelector("#empty-state");
const overviewGrid = document.querySelector("#overview-grid");
const toast = document.querySelector("#toast");
const studentDialog = document.querySelector("#student-dialog");
const testDialog = document.querySelector("#test-dialog");
const classDialog = document.querySelector("#class-dialog");
const spreadsheetFile = document.querySelector("#spreadsheet-file");
const resourceFileInput = document.createElement("input");
resourceFileInput.type = "file";
resourceFileInput.multiple = true;
resourceFileInput.accept = ".pdf,.doc,.docx,.txt,.rtf,.png,.jpg,.jpeg,.gif,.webp,.csv,.xls,.xlsx,.zip";
resourceFileInput.className = "hidden";
resourceFileInput.setAttribute("aria-label", "Choose student files");
document.body.append(resourceFileInput);

let toastTimer;
let noteSaveTimer;
let reportSaveTimer;
let studentSaveTimer;
let fileDatabasePromise;
let revealObserver;
let activeFileUrls = [];
let fileViewerUrl = null;
let filePreviewUrl = null;
let viewedFileId = null;
let viewerMinimized = false;
let activeTab = "Q1";
let currentView = "home";
let selectedStudentId = null;
let composerMinimized = false;
let composerClosed = true;
let tutorialIndex = 0;
let tutorialOpen = false;
let data;

const TUTORIAL_STEPS = [
  {
    target: "#page-title",
    title: "Welcome to StrideLog",
    description: "Your private classroom workspace keeps student progress, assessments, notes, and resources together. This short tour shows you where to start.",
  },
  {
    target: "#home-view",
    title: "Your student roster",
    description: "Choose a student card to open their profile. Search and use the class and score filters to find students quickly.",
  },
  {
    target: "#overview-grid",
    title: "A classroom snapshot",
    description: "See your student, assessment, class, and saved-file totals at a glance. Profile edits and notes save automatically on this device.",
  },
  {
    target: "#nav-classes",
    title: "Keep classes organized",
    description: "Create class groups, then drag student names into a group. You can move students back to Unassigned at any time.",
  },
  {
    target: "#import-trigger",
    title: "Bring in your spreadsheet",
    description: "Download the Excel template or import an .xlsx workbook. StrideLog reads the student-data sheet and skips the instructions sheet.",
  },
  {
    target: "#home-view",
    title: "Open a profile to get started",
    description: "Inside a profile, add tests and explore Q1–Q4 and Misc files. Use Write progress report to open a draggable report composer, and View beside a saved file to preview it.",
  },
];

function id() {
  return crypto.randomUUID();
}

function makeAssessment(title, score) {
  return { id: id(), title, score };
}

function makeStudent(name, className = "", notes = "") {
  return {
    id: id(),
    name,
    className,
    notes,
    links: [],
    quarters: Object.fromEntries(QUARTER_TABS.map((quarter) => [quarter, []])),
  };
}

function createStarterData() {
  const josh = makeStudent("Josh", "Room 204", "He slowly improved\nSame as last quarter");
  josh.quarters.Q1 = [
    makeAssessment("Inequalities Test", 50),
    makeAssessment("Vocab Quiz", 60),
    makeAssessment("Chapter 1 Exam", 70),
    makeAssessment("Skills Check", 80),
    makeAssessment("Multiplication Test", 90),
  ];
  josh.quarters.Q2 = [
    makeAssessment("Test 1", 80),
    makeAssessment("Test 2", 70),
    makeAssessment("Exit Ticket", 90),
    makeAssessment("Test 4", 90),
    makeAssessment("Test 5", 80),
    makeAssessment("Test 6", 90),
  ];

  const bella = makeStudent("Bella", "Math support");
  bella.quarters.Q3 = [
    makeAssessment("Test 1", 30),
    makeAssessment("Quiz", 50),
    makeAssessment("Test 3", 40),
    makeAssessment("Test 4", 70),
    makeAssessment("Test 5", 80),
    makeAssessment("Test 6", 90),
    makeAssessment("Test 7", 100),
    makeAssessment("Test 8", 70),
  ];

  const bob = makeStudent("Bob", "Room 204", "Very good job");
  bob.quarters.Q4 = [
    makeAssessment("Quarter Exam", 40),
    makeAssessment("Test 2", 20),
    makeAssessment("Test 3", 50),
    makeAssessment("Test 4", 90),
    makeAssessment("Test 5", 80),
    makeAssessment("Test 6", 95),
    makeAssessment("Test 7", 92),
    makeAssessment("Test 8", 96),
    makeAssessment("Test 9", 83),
  ];

  return { students: [josh, bella, bob], classes: ["Room 204", "Math support"] };
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.remove("hidden");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.add("hidden"), 4500);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setSaveStatus("Saved on this device");
    return true;
  } catch (error) {
    setSaveStatus("Save failed", true);
    showToast(`Could not save to this device: ${error.message}`, true);
    return false;
  }
}

function setSaveStatus(message, hasError = false) {
  const label = document.querySelector("#save-status-text");
  const dot = document.querySelector("#save-status-dot");
  if (!label || !dot) return;
  label.textContent = message;
  dot.classList.toggle("save-error-dot", hasError);
  dot.classList.toggle("save-pending-dot", message === "Saving…");
}

function loadWorkspace() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      const starter = createStarterData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(starter));
      return starter;
    }
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.students) || !Array.isArray(parsed.classes)) {
      throw new Error("The saved workspace has an invalid format.");
    }
    parsed.reportDrafts ||= {};
    for (const student of parsed.students) {
      if (!student.id || !student.name || !student.quarters) {
        throw new Error("A student record in the saved workspace is incomplete.");
      }
      student.links ||= [];
      for (const quarter of QUARTER_TABS) student.quarters[quarter] ||= [];
    }
    return parsed;
  } catch (error) {
    const starter = createStarterData();
    window.setTimeout(() => showToast(`Could not initialize the saved workspace: ${error.message}. Sample data is shown; browser storage may be unavailable.`, true), 0);
    return starter;
  }
}

function allAssessments(student) {
  return QUARTERS.flatMap((quarter) =>
    (student.quarters[quarter] || []).map((assessment) => ({ ...assessment, quarter })),
  );
}

function scoredAssessments(student) {
  return allAssessments(student).filter(
    (assessment) => Number.isFinite(assessment.score) && assessment.score >= 0 && assessment.score <= 100,
  );
}

function averageFor(student) {
  const scores = scoredAssessments(student).map((assessment) => assessment.score);
  if (!scores.length) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
}

function formatScore(score) {
  return Number.isInteger(score) ? `${score}%` : `${score.toFixed(1)}%`;
}

function getSelectedStudent() {
  return data.students.find((student) => student.id === selectedStudentId) || null;
}

function getClassNames() {
  return [...new Set([...data.classes, ...data.students.map((student) => student.className).filter(Boolean)])]
    .sort((a, b) => a.localeCompare(b));
}

function matchesClassFilter(student, filter) {
  if (filter === "all") return true;
  if (filter === "unassigned") return !student.className;
  return filter.startsWith("class:") && student.className === filter.slice(6);
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function updatePageTitle(lead, accent = "") {
  const title = document.querySelector("#page-title");
  title.replaceChildren(document.createTextNode(lead));
  if (accent) {
    const span = document.createElement("span");
    span.textContent = accent;
    title.append(span);
  }
}

function createRosterButton(student, index, home = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = home ? "home-student-card" : "student-list-item";
  button.dataset.studentId = student.id;
  if (!home && student.id === selectedStudentId && currentView === "student") button.classList.add("selected");

  const avatar = document.createElement("span");
  avatar.className = `roster-avatar ${AVATAR_TONES[index % AVATAR_TONES.length]}`;
  avatar.textContent = initials(student.name);
  const nameWrap = document.createElement("span");
  nameWrap.className = "roster-name-wrap";
  const name = document.createElement("span");
  name.className = "roster-name";
  name.textContent = student.name;
  const group = document.createElement("span");
  group.className = "roster-group";
  group.textContent = student.className || "Unassigned";
  nameWrap.append(name, group);
  button.append(avatar, nameWrap);

  if (home) {
    const score = document.createElement("span");
    score.className = "home-student-score";
    const history = scoredAssessments(student);
    score.textContent = history.length ? formatScore(history.at(-1).score) : "—";
    const caption = document.createElement("small");
    caption.textContent = history.length ? "latest" : "no scores yet";
    score.append(caption);
    button.append(score);
  }
  return button;
}

function renderRoster() {
  const query = studentSearch.value.trim().toLowerCase();
  const classFilter = document.querySelector("#sidebar-class-filter").value;
  const suggestions = document.querySelector("#student-suggestions");
  suggestions.replaceChildren();
  [...data.students].sort((a, b) => a.name.localeCompare(b.name)).forEach((student) => {
    const option = document.createElement("option");
    option.value = student.name;
    option.label = student.className || "Unassigned";
    suggestions.append(option);
  });
  const students = [...data.students]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((student) => `${student.name} ${student.className}`.toLowerCase().includes(query))
    .filter((student) => matchesClassFilter(student, classFilter));
  studentList.replaceChildren();
  if (!students.length) {
    const empty = document.createElement("div");
    empty.className = "roster-empty";
    empty.textContent = data.students.length ? "No students match that search." : "Add or import students to build your roster.";
    studentList.append(empty);
  } else {
    students.forEach((student, index) => studentList.append(createRosterButton(student, index)));
  }
  setText("#roster-count", String(data.students.length));
  renderClassFilterOptions("#sidebar-class-filter", "All classes");
}

function renderClassFilterOptions(selector, allLabel) {
  const select = document.querySelector(selector);
  if (!select) return;
  const previous = select.value || "all";
  const options = [["all", allLabel], ["unassigned", "Unassigned"], ...getClassNames().map((name) => [`class:${name}`, name])];
  select.replaceChildren();
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  });
  select.value = options.some(([value]) => value === previous) ? previous : "all";
}

function renderOverview() {
  setText("#stat-students", String(data.students.length));
  setText("#stat-assessments", String(data.students.reduce((sum, student) => sum + allAssessments(student).length, 0)));
  setText("#stat-classes", String(getClassNames().length));
  const fileCount = getAllStoredFiles().then((files) => setText("#stat-files", String(files.length)));
  fileCount.catch((error) => showToast(`Could not read saved files: ${error.message}`, true));
}

function renderHome() {
  renderClassFilterOptions("#home-class-filter", "All students");
  const classFilter = document.querySelector("#home-class-filter").value;
  const sort = document.querySelector("#home-sort").value;
  const sorted = [...data.students]
    .filter((student) => matchesClassFilter(student, classFilter))
    .sort((a, b) => {
      if (sort === "average-desc") return (averageFor(b) ?? -1) - (averageFor(a) ?? -1) || a.name.localeCompare(b.name);
      if (sort === "average-asc") return (averageFor(a) ?? 101) - (averageFor(b) ?? 101) || a.name.localeCompare(b.name);
      if (sort === "latest-desc") return (scoredAssessments(b).at(-1)?.score ?? -1) - (scoredAssessments(a).at(-1)?.score ?? -1) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  setText("#home-roster-count", `${sorted.length} ${sorted.length === 1 ? "student" : "students"}`);
  const grid = document.querySelector("#home-student-grid");
  grid.replaceChildren();
  if (!sorted.length) {
    const empty = document.createElement("div");
    empty.className = "roster-empty";
    empty.textContent = "No students in this group yet.";
    grid.append(empty);
  } else {
    sorted.forEach((student, index) => grid.append(createRosterButton(student, index, true)));
  }
}

function addSvg(parent, tag, attributes = {}, text = "") {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text) element.textContent = text;
  parent.append(element);
  return element;
}

function renderChart(student) {
  const container = document.querySelector("#chart-container");
  container.replaceChildren();
  document.querySelector("#chart-point-detail").classList.add("hidden");
  const assessments = scoredAssessments(student);
  const average = averageFor(student);
  setText("#average-score", average === null ? "—" : formatScore(average));
  setText("#student-average", average === null ? "—" : formatScore(average));
  setText("#student-test-count", String(allAssessments(student).length));

  if (!assessments.length) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    const icon = document.createElement("span");
    icon.className = "empty-chart-icon";
    icon.textContent = "↗";
    const title = document.createElement("strong");
    title.textContent = "Your first score starts the story.";
    const caption = document.createElement("span");
    caption.textContent = "Add a test to see progress over time.";
    empty.append(icon, title, caption);
    container.append(empty);
    return;
  }

  const width = 720;
  const height = 200;
  const left = 37;
  const right = 12;
  const top = 12;
  const bottom = 35;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const svg = addSvg(container, "svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Assessment score trend, ordered from oldest to latest" });
  const defs = addSvg(svg, "defs");
  const gradient = addSvg(defs, "linearGradient", { id: "chart-fill", x1: "0", x2: "0", y1: "0", y2: "1" });
  addSvg(gradient, "stop", { offset: "0%", "stop-color": "#84b89a", "stop-opacity": ".23" });
  addSvg(gradient, "stop", { offset: "100%", "stop-color": "#84b89a", "stop-opacity": "0" });

  for (const value of [0, 25, 50, 75, 100]) {
    const y = top + (100 - value) / 100 * plotHeight;
    addSvg(svg, "line", { x1: left, x2: width - right, y1: y, y2: y, class: "chart-grid-line" });
    addSvg(svg, "text", { x: left - 9, y: y + 3.5, "text-anchor": "end", class: "chart-axis-label" }, `${value}%`);
  }

  const pointGap = assessments.length > 1 ? plotWidth / (assessments.length - 1) : 0;
  const points = assessments.map((assessment, index) => ({
    x: assessments.length > 1 ? left + pointGap * index : left + plotWidth / 2,
    y: top + (100 - assessment.score) / 100 * plotHeight,
    assessment,
  }));
  if (points.length > 1) {
    const area = `M ${points[0].x} ${height - bottom} ${points.map((point) => `L ${point.x} ${point.y}`).join(" ")} L ${points.at(-1).x} ${height - bottom} Z`;
    addSvg(svg, "path", { d: area, class: "chart-area" });
  }
  addSvg(svg, "polyline", { points: points.map((point) => `${point.x},${point.y}`).join(" "), class: "chart-line" });

  points.forEach(({ x, y, assessment }, index) => {
    const circle = addSvg(svg, "circle", {
      cx: x, cy: y, r: 4, class: "chart-point", tabindex: "0", role: "button",
      "aria-label": `${assessment.quarter}, ${assessment.title}: ${formatScore(assessment.score)}. Activate for details.`,
    });
    addSvg(circle, "title", {}, `${assessment.quarter} · ${assessment.title}: ${formatScore(assessment.score)}`);
    const showDetail = () => {
      const detail = document.querySelector("#chart-point-detail");
      const averageDifference = average === null ? "" : ` Overall average: ${formatScore(average)}.`;
      detail.textContent = `${assessment.quarter} · ${assessment.title} · ${formatScore(assessment.score)}.${averageDifference}`;
      detail.classList.remove("hidden");
    };
    circle.addEventListener("focus", showDetail);
    circle.addEventListener("mouseenter", showDetail);
    circle.addEventListener("click", showDetail);
    const label = assessments.length > 7
      ? `${assessment.quarter} · ${index + 1}`
      : `${assessment.quarter} · ${assessment.title}`.slice(0, 16);
    addSvg(svg, "text", { x, y: height - 11, "text-anchor": assessments.length === 1 ? "middle" : index === 0 ? "start" : index === assessments.length - 1 ? "end" : "middle", class: "chart-x-label" }, label);
  });
}

function renderTabs(student) {
  const tabs = document.querySelector("#quarter-tabs");
  tabs.replaceChildren();
  for (const quarter of QUARTER_TABS) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `quarter-tab${quarter === "Misc files" ? " misc-tab" : ""}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(activeTab === quarter));
    tab.dataset.quarter = quarter;
    tab.textContent = quarter === "Misc files" ? "Misc files" : quarter;
    if (quarter !== "Misc files") {
      const count = document.createElement("span");
      count.className = "tab-count";
      count.textContent = String(student.quarters[quarter].length);
      tab.append(count);
    }
    tabs.append(tab);
  }
  void renderTabPanel(student);
}

function appendAssessmentList(panel, student, quarter) {
  const assessments = student.quarters[quarter] || [];
  if (!assessments.length) {
    const empty = document.createElement("div");
    empty.className = "assessment-empty";
    const strong = document.createElement("strong");
    strong.textContent = `No tests yet in ${quarter}.`;
    const note = document.createElement("span");
    note.textContent = "Add an assessment whenever you're ready. Empty spreadsheet cells stay out of the way.";
    empty.append(strong, note);
    panel.append(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "assessment-list";
  assessments.forEach((assessment, index) => {
    const row = document.createElement("div");
    row.className = "assessment-row";
    const number = document.createElement("span");
    number.className = "assessment-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const info = document.createElement("span");
    info.className = "assessment-info";
    const title = document.createElement("span");
    title.className = "assessment-title";
    title.textContent = assessment.title || `Test ${index + 1}`;
    const subtitle = document.createElement("span");
    subtitle.className = "assessment-subtitle";
    subtitle.textContent = `${quarter} · Assessment ${index + 1}`;
    info.append(title, subtitle);
    const track = document.createElement("span");
    track.className = "score-track";
    if (Number.isFinite(assessment.score)) {
      const fill = document.createElement("span");
      fill.className = "score-fill";
      fill.style.width = `${Math.max(0, Math.min(100, assessment.score))}%`;
      track.append(fill);
    } else {
      track.classList.add("hidden");
    }
    const score = document.createElement("span");
    score.className = `score-value${Number.isFinite(assessment.score) ? "" : " no-score"}`;
    score.textContent = Number.isFinite(assessment.score) ? formatScore(assessment.score) : "—";
    row.append(number, info, track, score);
    list.append(row);
  });
  panel.append(list);
}

function createSafeLink(rawLink) {
  try {
    const url = new URL(rawLink, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function appendSpreadsheetLinks(panel, student) {
  const links = [...new Set(student.links)];
  if (!links.length) return;
  const heading = document.createElement("div");
  heading.className = "files-empty";
  const strong = document.createElement("strong");
  strong.textContent = "Spreadsheet links";
  heading.append(strong);
  const list = document.createElement("div");
  list.className = "file-list";
  for (const link of links) {
    const row = document.createElement("div");
    row.className = "file-row";
    const icon = document.createElement("span");
    icon.className = "file-type-icon";
    icon.textContent = "↗";
    const details = document.createElement("span");
    details.className = "file-row-details";
    const safeHref = createSafeLink(link);
    if (safeHref) {
      const anchor = document.createElement("a");
      anchor.className = "file-link";
      anchor.href = safeHref;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = link;
      details.append(anchor);
    } else {
      const text = document.createElement("strong");
      text.textContent = link;
      details.append(text);
    }
    row.append(icon, details);
    list.append(row);
  }
  panel.append(heading, list);
}

function getFileDatabase() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("This browser does not support private file storage."));
  if (!fileDatabasePromise) {
    fileDatabasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(FILE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.createObjectStore(FILE_STORE_NAME, { keyPath: "id" });
        store.createIndex("studentId", "studentId", { unique: false });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error("Could not open private file storage."));
      request.onblocked = () => reject(new Error("File storage is blocked by another open StrideLog tab. Close the other tab and try again."));
    });
  }
  return fileDatabasePromise;
}

async function getAllStoredFiles() {
  const db = await getFileDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(FILE_STORE_NAME, "readonly").objectStore(FILE_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not read saved files."));
  });
}

async function getStudentFiles(studentId, quarter) {
  const files = await getAllStoredFiles();
  return files.filter((file) => file.studentId === studentId && file.quarter === quarter);
}

async function storeStudentFile(student, quarter, file) {
  const db = await getFileDatabase();
  const entry = { id: id(), studentId: student.id, quarter, name: file.name, type: file.type, size: file.size, data: file, addedAt: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE_NAME, "readwrite");
    transaction.objectStore(FILE_STORE_NAME).put(entry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error(`Could not save ${file.name}.`));
    transaction.onabort = () => reject(transaction.error || new Error(`Could not save ${file.name}.`));
  });
}

async function deleteStudentFile(fileId) {
  const db = await getFileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE_NAME, "readwrite");
    transaction.objectStore(FILE_STORE_NAME).delete(fileId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not delete the saved file."));
  });
}

async function deleteFilesForStudent(studentId) {
  const db = await getFileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(FILE_STORE_NAME);
    const request = store.index("studentId").getAllKeys(studentId);
    request.onsuccess = () => request.result.forEach((fileId) => store.delete(fileId));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not remove this student's saved files."));
    transaction.onabort = () => reject(transaction.error || new Error("Could not remove this student's saved files."));
  });
}

async function restoreStudentFiles(files) {
  if (!files.length) return;
  const db = await getFileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(FILE_STORE_NAME);
    files.forEach((file) => store.put(file));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not restore the student's saved files."));
    transaction.onabort = () => reject(transaction.error || new Error("Could not restore the student's saved files."));
  });
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function releaseFileUrls() {
  activeFileUrls.forEach((url) => URL.revokeObjectURL(url));
  activeFileUrls = [];
}

function releaseViewerUrl() {
  if (fileViewerUrl) URL.revokeObjectURL(fileViewerUrl);
  if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
  fileViewerUrl = null;
  filePreviewUrl = null;
}

function fileExtension(name) {
  return name.split(".").at(-1)?.slice(0, 4).toUpperCase() || "FILE";
}

function appendPreviewMessage(container, title, description) {
  const message = document.createElement("div");
  message.className = "file-preview-message";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const detail = document.createElement("p");
  detail.textContent = description;
  message.append(heading, detail);
  container.append(message);
}

function appendTextPreview(container, text) {
  const pre = document.createElement("pre");
  pre.className = "file-preview-text";
  pre.textContent = text || "This file is empty.";
  container.append(pre);
}

function parseDelimitedText(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      value += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function appendTablePreview(container, rows) {
  const table = document.createElement("table");
  table.className = "file-preview-table";
  rows.forEach((row, rowIndex) => {
    const tableRow = document.createElement("tr");
    row.forEach((value) => {
      const cell = document.createElement(rowIndex === 0 ? "th" : "td");
      cell.textContent = value;
      tableRow.append(cell);
    });
    table.append(tableRow);
  });
  container.append(table);
}

async function renderFilePreview(file) {
  const content = document.querySelector("#file-preview-content");
  content.replaceChildren();
  const extension = fileExtension(file.name).toLowerCase();
  const mime = file.type.toLowerCase();

  if (extension === "pdf" || mime === "application/pdf") {
    filePreviewUrl = URL.createObjectURL(file.data);
    const frame = document.createElement("iframe");
    frame.className = "file-preview-frame pdf-preview";
    frame.title = file.name;
    frame.src = filePreviewUrl;
    content.append(frame);
    return;
  }
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"].includes(extension)) {
    filePreviewUrl = URL.createObjectURL(file.data);
    const image = document.createElement("img");
    image.className = "file-preview-image";
    image.alt = file.name;
    image.src = filePreviewUrl;
    image.addEventListener("error", () => appendPreviewMessage(content, "Image preview unavailable", "Try downloading this file to view it in another app."), { once: true });
    content.append(image);
    return;
  }
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(extension)) {
    filePreviewUrl = URL.createObjectURL(file.data);
    const audio = document.createElement("audio");
    audio.className = "file-preview-media";
    audio.controls = true;
    audio.src = filePreviewUrl;
    audio.textContent = "Your browser does not support audio playback.";
    content.append(audio);
    return;
  }
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "m4v", "ogv"].includes(extension)) {
    filePreviewUrl = URL.createObjectURL(file.data);
    const video = document.createElement("video");
    video.className = "file-preview-video";
    video.controls = true;
    video.src = filePreviewUrl;
    video.textContent = "Your browser does not support video playback.";
    content.append(video);
    return;
  }
  if (["docx", "pptx"].includes(extension)) {
    appendPreviewMessage(content, "Preparing document preview…", "The document is processed locally in this browser.");
    try {
      const text = await officeDocumentPreview(file.data);
      if (viewedFileId !== file.id) return;
      content.replaceChildren();
      appendTextPreview(content, text);
    } catch (error) {
      if (viewedFileId !== file.id) return;
      content.replaceChildren();
      appendPreviewMessage(content, "Document preview unavailable", `${error.message} You can still download the original file.`);
    }
    return;
  }
  if (extension === "xlsx" || extension === "xlsm") {
    appendPreviewMessage(content, "Preparing spreadsheet preview…", "The workbook is processed locally in this browser.");
    try {
      const rows = await parseXlsxRows(await file.data.arrayBuffer());
      if (viewedFileId !== file.id) return;
      content.replaceChildren();
      appendTablePreview(content, rows);
    } catch (error) {
      if (viewedFileId !== file.id) return;
      content.replaceChildren();
      appendPreviewMessage(content, "Spreadsheet preview unavailable", `${error.message} You can still download the original workbook.`);
    }
    return;
  }
  if (extension === "html" || extension === "htm") {
    const html = await file.data.text();
    if (viewedFileId !== file.id) return;
    const frame = document.createElement("iframe");
    frame.className = "file-preview-frame html-preview";
    frame.title = file.name;
    frame.setAttribute("sandbox", "");
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'">${html}`;
    content.append(frame);
    return;
  }
  if (extension === "csv" || extension === "tsv") {
    const text = await file.data.text();
    if (viewedFileId !== file.id) return;
    appendTablePreview(content, parseDelimitedText(text, extension === "tsv" ? "\t" : ","));
    return;
  }
  if (extension === "txt" || extension === "md" || extension === "json" || extension === "xml"
      || extension === "yaml" || extension === "yml"
      || extension === "log" || extension === "rtf" || extension === "js" || extension === "ts"
      || extension === "css" || extension === "py" || extension === "java" || extension === "c"
      || extension === "cpp" || extension === "h" || extension === "sql" || extension === "sh") {
    appendTextPreview(content, await file.data.text());
    return;
  }
  appendPreviewMessage(
    content,
    "Preview not supported for this file type",
    "This browser can preview PDFs, common images, audio/video, text files, HTML, CSV, Excel workbooks, DOCX, and PPTX. Download this file to open it in another app.",
  );
}

async function openFileViewer(file) {
  viewedFileId = file.id;
  viewerMinimized = false;
  releaseViewerUrl();
  const viewer = document.querySelector("#file-viewer");
  viewer.classList.remove("hidden", "minimized");
  viewer.setAttribute("aria-hidden", "false");
  restoreFloatingPanelPosition(viewer, "stridelog-file-panel-position");
  setText("#file-viewer-name", file.name);
  setText("#file-viewer-context", `${getSelectedStudent()?.name || "Student"} · ${file.quarter} · ${formatFileSize(file.size)}`);
  setText("#file-viewer-type", fileExtension(file.name));
  const download = document.querySelector("#file-viewer-download");
  fileViewerUrl = URL.createObjectURL(file.data);
  download.href = fileViewerUrl;
  download.download = file.name;
  document.querySelector("#file-preview-content").replaceChildren();
  await renderFilePreview(file);
}

function closeFileViewer() {
  viewedFileId = null;
  releaseViewerUrl();
  document.querySelector("#file-preview-content").replaceChildren();
  const viewer = document.querySelector("#file-viewer");
  viewer.classList.add("hidden");
  viewer.setAttribute("aria-hidden", "true");
}

function restoreFloatingPanelPosition(panel, storageKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!Number.isFinite(saved?.left) || !Number.isFinite(saved?.top)) return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(0, Math.min(saved.left, window.innerWidth - rect.width))}px`;
    panel.style.top = `${Math.max(0, Math.min(saved.top, window.innerHeight - Math.min(rect.height, 58)))}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  } catch (error) {
    showToast(`Could not restore panel position: ${error.message}`, true);
  }
}

async function renderTabPanel(student) {
  const panel = document.querySelector("#tab-panel");
  const studentId = student.id;
  const quarter = activeTab;
  releaseFileUrls();
  panel.replaceChildren();
  const addFiles = document.createElement("div");
  addFiles.className = "file-actions";
  const upload = document.createElement("button");
  upload.type = "button";
  upload.className = "button button-outline";
  upload.dataset.action = "upload-files";
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4");
  icon.append(path);
  upload.append(icon, document.createTextNode("Add files"));
  addFiles.append(upload);
  panel.append(addFiles);

  if (quarter !== "Misc files") appendAssessmentList(panel, student, quarter);
  else appendSpreadsheetLinks(panel, student);

  const drop = document.createElement("button");
  drop.type = "button";
  drop.className = "file-drop";
  drop.dataset.action = "upload-files";
  drop.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg><span>${quarter === "Misc files" ? "Add PDFs, IEPs, and other files" : "Drop files here or browse"}</span>`;
  panel.append(drop);

  try {
    const files = await getStudentFiles(studentId, quarter);
    if (getSelectedStudent()?.id !== studentId || activeTab !== quarter) return;
    if (!files.length && quarter === "Misc files" && !student.links.length) {
      const empty = document.createElement("div");
      empty.className = "files-empty";
      empty.innerHTML = "<strong>No files yet.</strong>Keep IEPs, work samples, and other resources together here.";
      panel.append(empty);
      return;
    }
    if (files.length) {
      const list = document.createElement("div");
      list.className = "file-list";
      for (const file of files) {
        const row = document.createElement("div");
        row.className = "file-row";
        const type = document.createElement("span");
        type.className = "file-type-icon";
        type.textContent = fileExtension(file.name);
        const details = document.createElement("span");
        details.className = "file-row-details";
        const name = document.createElement("strong");
        name.textContent = file.name;
        const size = document.createElement("small");
        size.textContent = formatFileSize(file.size);
        details.append(name, size);
        const download = document.createElement("button");
        download.type = "button";
        download.className = "file-remove";
        download.title = "Download file";
        download.setAttribute("aria-label", `Download ${file.name}`);
        download.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14"/></svg>';
        download.addEventListener("click", () => {
          const url = URL.createObjectURL(file.data);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = file.name;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        const preview = document.createElement("button");
        preview.type = "button";
        preview.className = "file-preview-button";
        preview.textContent = "View";
        preview.setAttribute("aria-label", `View ${file.name}`);
        preview.addEventListener("click", () => void openFileViewer(file));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "file-remove";
        remove.title = "Remove file";
        remove.setAttribute("aria-label", `Remove ${file.name}`);
        remove.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg>';
        remove.addEventListener("click", async () => {
          try {
            await deleteStudentFile(file.id);
            showToast(`${file.name} removed.`);
            renderOverview();
            void renderTabPanel(student);
          } catch (error) {
            showToast(`Could not remove file: ${error.message}`, true);
          }
        });
        row.append(type, details, preview, download, remove);
        list.append(row);
      }
      panel.append(list);
    }
  } catch (error) {
    showToast(`Could not load student files: ${error.message}`, true);
  }

  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("drag-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
  drop.addEventListener("drop", async (event) => {
    event.preventDefault();
    drop.classList.remove("drag-over");
    await saveUploadedFiles(student, quarter, [...(event.dataTransfer?.files || [])]);
  });
}

async function saveUploadedFiles(student, quarter, files) {
  if (!files.length) return;
  try {
    for (const file of files) await storeStudentFile(student, quarter, file);
    showToast(`${files.length} ${files.length === 1 ? "file" : "files"} saved under ${student.name}.`);
    renderOverview();
    if (getSelectedStudent()?.id === student.id && activeTab === quarter) void renderTabPanel(student);
  } catch (error) {
    showToast(`Could not save files: ${error.message}`, true);
  }
}

function renderStudent() {
  const student = getSelectedStudent();
  if (!student) return;
  setText("#student-name", student.name);
  setText("#student-avatar", initials(student.name));
  setText("#student-class-label", student.className ? student.className.toUpperCase() : "STUDENT PROFILE");
  setText("#student-meta", student.className ? `Class group · ${student.className}` : "Not assigned to a class group");
  setText("#student-group", student.className || "Unassigned");
  document.querySelector("#student-notes").value = student.notes || "";
  renderChart(student);
  renderTabs(student);
  getAllStoredFiles()
    .then((files) => {
      if (getSelectedStudent()?.id === student.id) {
        const fileCount = files.filter((file) => file.studentId === student.id).length;
        setText("#student-file-count", String(fileCount + student.links.length));
      }
    })
    .catch((error) => showToast(`Could not count student files: ${error.message}`, true));
  studentView.dataset.activeTab = activeTab;
  document.querySelector("#breadcrumb-current").textContent = student.name;
}

function renderReportComposer() {
  const student = getSelectedStudent();
  const composer = document.querySelector("#report-composer");
  const launcher = document.querySelector("#open-report-composer");
  const available = currentView === "student" && student;
  launcher.classList.toggle("hidden", !available || !composerClosed);
  composer.classList.toggle("hidden", !available || composerClosed);
  composer.classList.toggle("minimized", composerMinimized);
  composer.setAttribute("aria-hidden", String(!available || composerClosed));
  document.querySelector("#composer-minimize").setAttribute(
    "aria-label",
    composerMinimized ? "Restore progress report" : "Minimize progress report",
  );
  document.querySelector("#composer-minimize").title = composerMinimized ? "Restore" : "Minimize";
  if (!available || composerClosed) return;

  setText("#composer-student-name", student.name);
  const drafts = data.reportDrafts || (data.reportDrafts = {});
  if (document.querySelector("#report-editor").dataset.studentId !== student.id) {
    document.querySelector("#report-editor").value = drafts[student.id] || buildProgressReport(student);
    document.querySelector("#report-editor").dataset.studentId = student.id;
    setText("#report-save-hint", drafts[student.id] ? "Draft saved on this device" : "New draft");
  }
}

function openReportComposer() {
  if (!getSelectedStudent()) return;
  composerClosed = false;
  composerMinimized = false;
  renderReportComposer();
  restoreFloatingPanelPosition(document.querySelector("#report-composer"), "stridelog-report-panel-position");
  document.querySelector("#report-editor").focus();
}

function saveReportDraft() {
  const studentId = document.querySelector("#report-editor").dataset.studentId;
  if (!studentId) return;
  const drafts = data.reportDrafts || (data.reportDrafts = {});
  drafts[studentId] = document.querySelector("#report-editor").value;
  setText("#report-save-hint", persist() ? "Draft saved on this device" : "Could not save draft");
}

function scheduleReportSave() {
  setText("#report-save-hint", "Saving…");
  window.clearTimeout(reportSaveTimer);
  reportSaveTimer = window.setTimeout(saveReportDraft, 450);
}

function exportProgressReport() {
  const editor = document.querySelector("#report-editor");
  const student = data.students.find((entry) => entry.id === editor.dataset.studentId);
  if (!student) {
    showToast("Select a student before exporting a progress report.", true);
    return;
  }
  const blob = new Blob([editor.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFileName(student.name);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Progress report exported as a text file.");
}

function makeFloatingPanelDraggable(panel, handle, storageKey) {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button, a, input, textarea, select")) return;
    const rect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = rect.left;
    const originY = rect.top;
    handle.setPointerCapture(event.pointerId);
    panel.classList.add("is-dragging");

    const move = (moveEvent) => {
      const left = Math.max(0, Math.min(window.innerWidth - rect.width, originX + moveEvent.clientX - startX));
      const top = Math.max(0, Math.min(window.innerHeight - Math.min(rect.height, 58), originY + moveEvent.clientY - startY));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    };
    const finish = () => {
      panel.classList.remove("is-dragging");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      try {
        const rect = panel.getBoundingClientRect();
        localStorage.setItem(storageKey, JSON.stringify({ left: rect.left, top: rect.top }));
      } catch (error) {
        showToast(`Could not save panel position: ${error.message}`, true);
      }
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish, { once: true });
    handle.addEventListener("pointercancel", finish, { once: true });
  });
}

function renderClasses() {
  const grid = document.querySelector("#class-grid");
  const unassigned = document.querySelector("#unassigned-students");
  grid.replaceChildren();
  unassigned.replaceChildren();
  const classNames = getClassNames();
  if (!classNames.length) {
    const empty = document.createElement("div");
    empty.className = "empty-classes";
    empty.textContent = "Create a class group, then drag students here to get organized.";
    grid.append(empty);
  }

  classNames.forEach((className, index) => {
    const members = data.students.filter((student) => student.className === className);
    const card = document.createElement("section");
    card.className = "class-card";
    card.dataset.className = className;
    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      card.classList.add("drag-over");
    });
    card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
    card.addEventListener("drop", (event) => assignDraggedStudent(event, className));

    const header = document.createElement("div");
    header.className = "class-card-header";
    const titleWrap = document.createElement("div");
    titleWrap.className = "class-card-title";
    const symbol = document.createElement("span");
    symbol.className = "class-symbol";
    symbol.textContent = "▤";
    const titleGroup = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = className;
    const count = document.createElement("small");
    count.textContent = `${members.length} ${members.length === 1 ? "student" : "students"}`;
    titleGroup.append(title, count);
    titleWrap.append(symbol, titleGroup);
    header.append(titleWrap);
    if (data.classes.includes(className)) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "class-delete";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove class ${className}`);
      remove.addEventListener("click", () => removeClass(className));
      header.append(remove);
    }
    card.append(header);
    const memberList = document.createElement("div");
    memberList.className = "class-members";
    if (members.length) members.forEach((student) => memberList.append(createDraggableStudent(student, index)));
    else {
      const placeholder = document.createElement("span");
      placeholder.className = "class-card-empty";
      placeholder.textContent = "Drop a student here";
      memberList.append(placeholder);
    }
    card.append(memberList);
    grid.append(card);
  });

  data.students.filter((student) => !student.className)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((student, index) => unassigned.append(createDraggableStudent(student, index, true)));
  const unassignedDrop = document.querySelector("#unassigned-drop");
  unassignedDrop.ondragover = (event) => {
    event.preventDefault();
    unassignedDrop.classList.add("drag-over");
  };
  unassignedDrop.ondragleave = () => unassignedDrop.classList.remove("drag-over");
  unassignedDrop.ondrop = (event) => assignDraggedStudent(event, "");
}

function createDraggableStudent(student, index, unassigned = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = unassigned ? "unassigned-member" : "class-member";
  button.draggable = true;
  button.dataset.studentId = student.id;
  button.addEventListener("dragstart", (event) => event.dataTransfer?.setData("text/plain", student.id));
  const avatar = document.createElement("span");
  avatar.className = `roster-avatar ${AVATAR_TONES[index % AVATAR_TONES.length]}`;
  avatar.textContent = initials(student.name);
  button.append(avatar, document.createTextNode(student.name));
  button.addEventListener("click", () => selectStudent(student.id));
  return button;
}

function assignDraggedStudent(event, className) {
  event.preventDefault();
  const card = event.currentTarget;
  card.classList.remove("drag-over");
  const studentId = event.dataTransfer?.getData("text/plain");
  const student = data.students.find((entry) => entry.id === studentId);
  if (!student) return;
  student.className = className;
  if (className && !data.classes.includes(className)) data.classes.push(className);
  persist();
  render();
  showToast(`${student.name} moved to ${className || "Unassigned"}.`);
}

function removeClass(className) {
  data.students.filter((student) => student.className === className).forEach((student) => { student.className = ""; });
  data.classes = data.classes.filter((name) => name !== className);
  persist();
  render();
  showToast(`${className} removed. Its students are now unassigned.`);
}

function render() {
  renderRoster();
  renderOverview();
  renderHome();
  const hasStudents = data.students.length > 0;
  overviewGrid.classList.toggle("hidden", !hasStudents);
  emptyState.classList.toggle("hidden", hasStudents);
  homeView.classList.toggle("hidden", !hasStudents || currentView !== "home");
  classView.classList.toggle("hidden", !hasStudents || currentView !== "classes");
  studentView.classList.toggle("hidden", !hasStudents || currentView !== "student" || !getSelectedStudent());
  if (currentView === "student" && getSelectedStudent()) renderStudent();
  if (currentView === "classes") renderClasses();
  document.querySelector("#nav-roster").classList.toggle("active", currentView !== "classes");
  document.querySelector("#nav-classes").classList.toggle("active", currentView === "classes");
  if (currentView === "classes") {
    updatePageTitle("A place for ", "every learner.");
    setText("#page-subtitle", "Build groups that make your classroom easier to navigate.");
    document.querySelector("#breadcrumb-current").textContent = "Class groups";
  } else if (currentView === "student") {
    updatePageTitle("Student ", "progress.");
    setText("#page-subtitle", "A thoughtful view of progress, assessments, and resources.");
  } else {
    updatePageTitle("Every step forward, ", "in one place.");
    setText("#page-subtitle", "A clearer picture of how your students are growing.");
    document.querySelector("#breadcrumb-current").textContent = "Students";
  }
  if (!hasStudents) {
    updatePageTitle("Make room for ", "every win.");
    setText("#page-subtitle", "Start with one student, or import your spreadsheet.");
  }
  renderReportComposer();
  applyScrollReveals();
}

function applyScrollReveals() {
  const targets = document.querySelectorAll(
    ".overview-card, .home-view, .home-student-card, .student-view .panel, .class-card, .unassigned-drop, .empty-state",
  );
  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    targets.forEach((target) => target.classList.add("is-visible"));
    return;
  }
  revealObserver ||= new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  targets.forEach((target) => {
    target.classList.add("reveal");
    if (!target.classList.contains("is-visible")) revealObserver.observe(target);
  });
}

function closeTutorial(completed) {
  tutorialOpen = false;
  document.querySelector("#tour-backdrop").classList.add("hidden");
  document.querySelector("#tour-card").classList.add("hidden");
  document.querySelectorAll(".tour-highlight").forEach((element) => element.classList.remove("tour-highlight"));
  if (completed) {
    try {
      localStorage.setItem(TUTORIAL_KEY, "true");
    } catch (error) {
      showToast(`Could not remember tutorial completion: ${error.message}`, true);
    }
  }
  document.querySelector("#tutorial-trigger").focus();
}

function renderTutorialStep() {
  if (!tutorialOpen) return;
  const step = TUTORIAL_STEPS[tutorialIndex];
  document.querySelectorAll(".tour-highlight").forEach((element) => element.classList.remove("tour-highlight"));
  const selector = !data.students.length && (step.target === "#home-view" || step.target === "#overview-grid")
    ? "#empty-state"
    : step.target;
  const target = document.querySelector(selector);
  target?.classList.add("tour-highlight");
  target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  setText("#tour-progress", `STEP ${tutorialIndex + 1} OF ${TUTORIAL_STEPS.length}`);
  setText("#tour-title", step.title);
  setText("#tour-description", step.description);
  document.querySelector("#tour-back").disabled = tutorialIndex === 0;
  setText("#tour-next", tutorialIndex === TUTORIAL_STEPS.length - 1 ? "Finish" : "Next");
  document.querySelector("#tour-backdrop").classList.remove("hidden");
  document.querySelector("#tour-card").classList.remove("hidden");
}

function startTutorial() {
  if (currentView !== "home") showView("home");
  tutorialOpen = true;
  tutorialIndex = 0;
  renderTutorialStep();
  document.querySelector("#tour-next").focus();
}

function selectStudent(studentId) {
  if (selectedStudentId !== studentId) {
    closeFileViewer();
    window.clearTimeout(reportSaveTimer);
    saveReportDraft();
    document.querySelector("#report-editor").dataset.studentId = "";
  }
  selectedStudentId = studentId;
  activeTab = "Q1";
  currentView = "student";
  render();
}

function showView(view) {
  currentView = view;
  if (view !== "student") closeFileViewer();
  if (view !== "student") {
    composerClosed = true;
    window.clearTimeout(reportSaveTimer);
    saveReportDraft();
  }
  if (view === "home") selectedStudentId = null;
  render();
}

function addStudentFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  if (data.students.some((student) => student.name.toLowerCase() === name.toLowerCase())) {
    form.elements.name.setCustomValidity("A student with this name is already on the roster.");
    form.elements.name.reportValidity();
    return;
  }
  form.elements.name.setCustomValidity("");
  const className = String(formData.get("className") || "").trim();
  const student = makeStudent(name, className, String(formData.get("notes") || "").trim());
  data.students.push(student);
  if (className && !data.classes.includes(className)) data.classes.push(className);
  selectedStudentId = student.id;
  currentView = "student";
  persist();
  form.reset();
  studentDialog.close();
  render();
  showToast(`${student.name} added to your roster.`);
}

function addTestFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const student = getSelectedStudent();
  if (!student) return;
  const title = String(formData.get("title") || "").trim();
  const scoreValue = String(formData.get("score") || "").trim();
  const score = scoreValue ? Number(scoreValue) : null;
  const quarter = String(formData.get("quarter"));
  if (!title || !QUARTERS.includes(quarter) || (score !== null && (!Number.isFinite(score) || score < 0 || score > 100))) {
    showToast("Enter a test name and a score between 0 and 100.", true);
    return;
  }
  student.quarters[quarter].push({ id: id(), title, score });
  activeTab = quarter;
  currentView = "student";
  persist();
  form.reset();
  testDialog.close();
  render();
  showToast("Test added to the student record.");
}

function addClassFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = String(new FormData(form).get("name") || "").trim();
  if (!name) return;
  if (getClassNames().some((className) => className.toLowerCase() === name.toLowerCase())) {
    form.elements.name.setCustomValidity("A class with this name already exists.");
    form.elements.name.reportValidity();
    return;
  }
  form.elements.name.setCustomValidity("");
  data.classes.push(name);
  persist();
  form.reset();
  classDialog.close();
  render();
  showToast(`${name} class created. Drag students into it to get organized.`);
}

function updateStudentNotes() {
  const student = getSelectedStudent();
  if (!student) return;
  student.notes = document.querySelector("#student-notes").value;
  const hint = document.querySelector("#notes-save-hint");
  hint.textContent = "Saving…";
  setSaveStatus("Saving…");
  window.clearTimeout(noteSaveTimer);
  noteSaveTimer = window.setTimeout(() => {
    const saved = persist();
    if (saved) setSaveStatus("Saved on this device");
    hint.textContent = saved ? "Saved on this device" : "Could not save";
  }, 450);
}

function saveNotesImmediately() {
  const student = getSelectedStudent();
  if (!student) return;
  window.clearTimeout(noteSaveTimer);
  student.notes = document.querySelector("#student-notes").value;
  const saved = persist();
  setText("#notes-save-hint", saved ? "Saved on this device" : "Could not save");
  if (saved) showToast("Teacher notes saved.");
}

function editStudentProfile() {
  const student = getSelectedStudent();
  if (!student) return;
  const form = document.querySelector("#student-form");
  form.elements.name.value = student.name;
  form.elements.className.value = student.className || "";
  form.elements.notes.value = student.notes || "";
  form.dataset.editingStudent = student.id;
  document.querySelector("#delete-student").classList.remove("hidden");
  setText("#student-dialog-title", "Edit student");
  setText("#save-student-button", "Done");
  studentDialog.showModal();
}

function openAddStudentDialog() {
  const form = document.querySelector("#student-form");
  form.reset();
  delete form.dataset.editingStudent;
  document.querySelector("#delete-student").classList.add("hidden");
  form.elements.name.setCustomValidity("");
  setText("#student-dialog-title", "Add a student");
  setText("#save-student-button", "Add student");
  studentDialog.showModal();
}

function saveStudentForm(event) {
  const form = event.currentTarget;
  if (!form.dataset.editingStudent) {
    addStudentFromForm(event);
    return;
  }
  event.preventDefault();
  window.clearTimeout(studentSaveTimer);
  const student = data.students.find((entry) => entry.id === form.dataset.editingStudent);
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  if (!student || !name) return;
  if (data.students.some((entry) => entry.id !== student.id && entry.name.toLowerCase() === name.toLowerCase())) {
    form.elements.name.setCustomValidity("A student with this name is already on the roster.");
    form.elements.name.reportValidity();
    return;
  }
  form.elements.name.setCustomValidity("");
  student.name = name;
  student.className = String(formData.get("className") || "").trim();
  student.notes = String(formData.get("notes") || "").trim();
  if (student.className && !data.classes.includes(student.className)) data.classes.push(student.className);
  if (!persist()) return;
  form.reset();
  delete form.dataset.editingStudent;
  document.querySelector("#delete-student").classList.add("hidden");
  studentDialog.close();
  render();
  showToast(`${student.name}'s profile updated.`);
}

function scheduleStudentProfileSave() {
  const form = document.querySelector("#student-form");
  const studentId = form.dataset.editingStudent;
  if (!studentId) return;
  const student = data.students.find((entry) => entry.id === studentId);
  if (!student) return;
  const name = form.elements.name.value.trim();
  if (!name) {
    setSaveStatus("Enter a student name", true);
    return;
  }
  if (data.students.some((entry) => entry.id !== studentId && entry.name.toLowerCase() === name.toLowerCase())) {
    form.elements.name.setCustomValidity("A student with this name is already on the roster.");
    setSaveStatus("Student name already exists", true);
    return;
  }
  form.elements.name.setCustomValidity("");
  setSaveStatus("Saving…");
  window.clearTimeout(studentSaveTimer);
  studentSaveTimer = window.setTimeout(() => {
    const current = data.students.find((entry) => entry.id === studentId);
    if (!current || !form.dataset.editingStudent) return;
    current.name = form.elements.name.value.trim();
    current.className = form.elements.className.value.trim();
    current.notes = form.elements.notes.value.trim();
    if (current.className && !data.classes.includes(current.className)) data.classes.push(current.className);
    if (persist()) {
      setText("#notes-save-hint", "Profile saved automatically");
      render();
    }
  }, 500);
}

async function removeSelectedStudent() {
  const student = getSelectedStudent();
  if (!student) return;
  const assessmentCount = allAssessments(student).length;
  const confirmed = window.confirm(
    `Remove ${student.name} from this workspace? This permanently deletes ${assessmentCount} assessment${assessmentCount === 1 ? "" : "s"}, notes, report drafts, and saved files for this student.`,
  );
  if (!confirmed) return;

  closeFileViewer();
  const form = document.querySelector("#student-form");
  const deleteButton = document.querySelector("#delete-student");
  deleteButton.disabled = true;
  deleteButton.textContent = "Removing student…";
  window.clearTimeout(studentSaveTimer);
  window.clearTimeout(reportSaveTimer);
  const index = data.students.findIndex((entry) => entry.id === student.id);
  const previousDraft = data.reportDrafts?.[student.id];
  let files = [];
  try {
    files = (await getAllStoredFiles()).filter((file) => file.studentId === student.id);
    await deleteFilesForStudent(student.id);
    data.students.splice(index, 1);
    if (data.reportDrafts) delete data.reportDrafts[student.id];
    document.querySelector("#report-editor").dataset.studentId = "";
    selectedStudentId = null;
    currentView = "home";
    if (!persist()) {
      data.students.splice(index, 0, student);
      if (previousDraft !== undefined) data.reportDrafts[student.id] = previousDraft;
      selectedStudentId = student.id;
      currentView = "student";
      await restoreStudentFiles(files);
      return;
    }
    composerClosed = true;
    form.reset();
    delete form.dataset.editingStudent;
    document.querySelector("#delete-student").classList.add("hidden");
    studentDialog.close();
    render();
    showToast(`${student.name} and their saved student files were removed.`);
  } catch (error) {
    if (index >= 0 && !data.students.some((entry) => entry.id === student.id)) {
      data.students.splice(index, 0, student);
      if (previousDraft !== undefined) data.reportDrafts[student.id] = previousDraft;
      selectedStudentId = student.id;
      currentView = "student";
      try {
        await restoreStudentFiles(files);
      } catch (restoreError) {
        showToast(`Student removal failed: ${error.message}. Saved file restoration also failed: ${restoreError.message}`, true);
        render();
        return;
      }
    }
    showToast(`Could not remove student: ${error.message}`, true);
    render();
  } finally {
    deleteButton.disabled = false;
    deleteButton.textContent = "Remove student and saved files";
  }
}

function rowsFromHtml(html) {
  const documentHtml = new DOMParser().parseFromString(html, "text/html");
  return [...documentHtml.querySelectorAll("table")].flatMap((table) => {
    const tableRows = [...table.querySelectorAll("tr")];
    let headers = [];
    return tableRows.map((row) => {
      const cells = [...row.querySelectorAll("th, td")];
      const values = cells.map((cell) => cell.innerText || cell.textContent || "");
      if (values.some((value) => value.trim().toLowerCase() === "student name")) headers = values;
      const linkColumn = headers.findIndex((header) => header.trim().toLowerCase() === "links to files");
      if (linkColumn >= 0 && cells[linkColumn]) {
        const links = [...cells[linkColumn].querySelectorAll("a[href]")].map((anchor) => anchor.getAttribute("href"));
        if (links.length) values[linkColumn] = links.join("\n");
      }
      return values.map((value) => value.replace(/\s+/g, " ").trim());
    });
  });
}

function mergeImportedStudents(imported) {
  let added = 0;
  let updated = 0;
  for (const incoming of imported) {
    let existing = data.students.find((student) => student.name.toLowerCase() === incoming.name.toLowerCase());
    if (!existing) {
      existing = { ...incoming, id: id() };
      data.students.push(existing);
      added++;
      continue;
    }
    updated++;
    for (const quarter of QUARTERS) {
      if (incoming.quarters[quarter].length) existing.quarters[quarter] = incoming.quarters[quarter];
    }
    if (incoming.notes) existing.notes = incoming.notes;
    existing.links = [...new Set([...existing.links, ...incoming.links])];
  }
  return { added, updated };
}

async function importSpreadsheet(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error("Please choose a spreadsheet under 25 MB.");
  let documents;
  if (/\.xlsx$/i.test(file.name)) {
    documents = [{ name: file.name, rows: await parseXlsxRows(await file.arrayBuffer()) }];
  } else if (/\.zip$/i.test(file.name)) documents = await unzipHtml(await file.arrayBuffer());
  else documents = [{ name: file.name, html: await file.text() }];

  const imported = new Map();
  const errors = [];
  for (const documentData of documents) {
    try {
      const rows = documentData.rows || rowsFromHtml(documentData.html);
      const parsed = parseSpreadsheetRows(rows);
      for (const student of parsed) {
        const key = student.name.toLowerCase();
        if (!imported.has(key)) imported.set(key, student);
        else {
          const current = imported.get(key);
          for (const quarter of QUARTERS) current.quarters[quarter].push(...student.quarters[quarter]);
          current.notes = [current.notes, student.notes].filter(Boolean).join("\n");
          current.links.push(...student.links);
        }
      }
    } catch (error) {
      errors.push(`${documentData.name}: ${error.message}`);
    }
  }
  if (!imported.size) {
    throw new Error(errors.length ? errors.join(" ") : "No student records could be read from the spreadsheet.");
  }

  const incoming = [...imported.values()];
  const hasExistingStudents = data.students.length > 0;
  if (hasExistingStudents && !window.confirm(`Import ${incoming.length} students? Matching students will keep their classes and saved files; imported test scores will update the matching quarter.`)) return;
  const result = mergeImportedStudents(incoming);
  for (const className of getClassNames()) if (!data.classes.includes(className)) data.classes.push(className);
  persist();
  selectedStudentId = data.students.find((student) => student.name.toLowerCase() === incoming[0].name.toLowerCase())?.id || null;
  currentView = "home";
  render();
  showToast(`Import complete: ${result.added} added, ${result.updated} updated.${errors.length ? ` ${errors.join(" ")}` : ""}`, errors.length > 0);
}

function bindEvents() {
  makeFloatingPanelDraggable(
    document.querySelector("#report-composer"),
    document.querySelector("#composer-drag-handle"),
    "stridelog-report-panel-position",
  );
  makeFloatingPanelDraggable(
    document.querySelector("#file-viewer"),
    document.querySelector("#file-viewer-drag-handle"),
    "stridelog-file-panel-position",
  );
  document.querySelector("#nav-roster").addEventListener("click", () => showView("home"));
  document.querySelector("#nav-classes").addEventListener("click", () => showView("classes"));
  document.querySelector("#add-student").addEventListener("click", openAddStudentDialog);
  document.querySelector("#add-student-main").addEventListener("click", openAddStudentDialog);
  document.querySelector("#empty-add-student").addEventListener("click", openAddStudentDialog);
  document.querySelector("#edit-student").addEventListener("click", editStudentProfile);
  document.querySelector("#add-test").addEventListener("click", () => {
    const form = document.querySelector("#test-form");
    form.reset();
    form.elements.quarter.value = QUARTERS.includes(activeTab) ? activeTab : "Q1";
    testDialog.showModal();
  });
  document.querySelector("#add-class").addEventListener("click", () => classDialog.showModal());
  document.querySelector("#save-notes").addEventListener("click", saveNotesImmediately);
  document.querySelector("#student-notes").addEventListener("input", updateStudentNotes);
  document.querySelector("#student-form").addEventListener("submit", saveStudentForm);
  document.querySelector("#student-form").elements.name.addEventListener("input", (event) => {
    event.currentTarget.setCustomValidity("");
    scheduleStudentProfileSave();
  });
  ["className", "notes"].forEach((name) => {
    document.querySelector("#student-form").elements[name].addEventListener("input", scheduleStudentProfileSave);
  });
  document.querySelector("#delete-student").addEventListener("click", () => void removeSelectedStudent());
  document.querySelector("#test-form").addEventListener("submit", addTestFromForm);
  document.querySelector("#class-form").addEventListener("submit", addClassFromForm);
  document.querySelector("#class-form").elements.name.addEventListener("input", (event) => event.currentTarget.setCustomValidity(""));
  studentSearch.addEventListener("input", renderRoster);
  document.querySelector("#sidebar-class-filter").addEventListener("change", renderRoster);
  document.querySelector("#home-class-filter").addEventListener("change", renderHome);
  document.querySelector("#home-sort").addEventListener("change", renderHome);
  document.querySelector("#open-report-composer").addEventListener("click", openReportComposer);
  document.querySelector("#report-editor").addEventListener("input", scheduleReportSave);
  document.querySelector("#export-report").addEventListener("click", exportProgressReport);
  document.querySelector("#composer-minimize").addEventListener("click", () => {
    composerMinimized = !composerMinimized;
    renderReportComposer();
  });
  document.querySelector("#composer-close").addEventListener("click", () => {
    window.clearTimeout(reportSaveTimer);
    saveReportDraft();
    composerClosed = true;
    composerMinimized = false;
    renderReportComposer();
  });
  document.querySelector("#file-viewer-minimize").addEventListener("click", () => {
    viewerMinimized = !viewerMinimized;
    const viewer = document.querySelector("#file-viewer");
    viewer.classList.toggle("minimized", viewerMinimized);
    document.querySelector("#file-viewer-minimize").setAttribute(
      "aria-label",
      viewerMinimized ? "Restore file viewer" : "Minimize file viewer",
    );
    document.querySelector("#file-viewer-minimize").title = viewerMinimized ? "Restore" : "Minimize";
  });
  document.querySelector("#file-viewer-close").addEventListener("click", closeFileViewer);
  document.querySelector("#tutorial-trigger").addEventListener("click", startTutorial);
  document.querySelector("#tour-next").addEventListener("click", () => {
    if (tutorialIndex === TUTORIAL_STEPS.length - 1) closeTutorial(true);
    else {
      tutorialIndex++;
      renderTutorialStep();
    }
  });
  document.querySelector("#tour-back").addEventListener("click", () => {
    if (tutorialIndex > 0) {
      tutorialIndex--;
      renderTutorialStep();
    }
  });
  document.querySelector("#tour-skip").addEventListener("click", () => closeTutorial(true));
  document.querySelector("#tour-backdrop").addEventListener("click", () => closeTutorial(true));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && tutorialOpen) closeTutorial(true);
  });
  document.querySelector("#quarter-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-quarter]");
    if (!tab || !QUARTER_TABS.includes(tab.dataset.quarter)) return;
    activeTab = tab.dataset.quarter;
    renderStudent();
  });
  document.querySelector("#tab-panel").addEventListener("click", (event) => {
    if (!event.target.closest('[data-action="upload-files"]')) return;
    resourceFileInput.value = "";
    resourceFileInput.click();
  });
  resourceFileInput.addEventListener("change", async () => {
    const student = getSelectedStudent();
    if (student) await saveUploadedFiles(student, activeTab, [...resourceFileInput.files]);
  });
  document.querySelector("#import-trigger").addEventListener("click", () => {
    spreadsheetFile.value = "";
    spreadsheetFile.click();
  });
  document.querySelector("#empty-import").addEventListener("click", () => {
    spreadsheetFile.value = "";
    spreadsheetFile.click();
  });
  spreadsheetFile.addEventListener("change", async () => {
    const file = spreadsheetFile.files[0];
    if (!file) return;
    try {
      await importSpreadsheet(file);
    } catch (error) {
      showToast(`Spreadsheet import failed: ${error.message}`, true);
    }
  });
  studentList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-student-id]");
    if (button) selectStudent(button.dataset.studentId);
  });
  document.querySelector("#home-student-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-student-id]");
    if (button) selectStudent(button.dataset.studentId);
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
  document.addEventListener("keydown", (event) => {
    if (tutorialOpen && event.key === "Tab") {
      const focusable = [...document.querySelector("#tour-card").querySelectorAll("button:not(:disabled)")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      studentSearch.focus();
    }
  });
}

data = loadWorkspace();
bindEvents();
render();
try {
  if (localStorage.getItem(TUTORIAL_KEY) !== "true") window.setTimeout(startTutorial, 700);
} catch (error) {
  window.setTimeout(() => showToast(`Could not check tutorial preference: ${error.message}`, true), 0);
}

function flushAutosaves() {
  window.clearTimeout(studentSaveTimer);
  window.clearTimeout(noteSaveTimer);
  window.clearTimeout(reportSaveTimer);
  const form = document.querySelector("#student-form");
  if (form.dataset.editingStudent) {
    const student = data.students.find((entry) => entry.id === form.dataset.editingStudent);
    const name = form.elements.name.value.trim();
    if (student && name && !data.students.some((entry) => entry.id !== student.id && entry.name.toLowerCase() === name.toLowerCase())) {
      student.name = name;
      student.className = form.elements.className.value.trim();
      student.notes = form.elements.notes.value.trim();
    }
  }
  const activeStudent = getSelectedStudent();
  if (activeStudent) activeStudent.notes = document.querySelector("#student-notes").value;
  const reportEditor = document.querySelector("#report-editor");
  if (reportEditor.dataset.studentId) {
    const drafts = data.reportDrafts || (data.reportDrafts = {});
    drafts[reportEditor.dataset.studentId] = reportEditor.value;
  }
  persist();
}

window.addEventListener("pagehide", flushAutosaves);
window.addEventListener("beforeunload", flushAutosaves);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushAutosaves();
});
