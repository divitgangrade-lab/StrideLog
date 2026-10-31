export const WORKSPACE_BACKUP_FORMAT = "stridelog-workspace";
export const WORKSPACE_BACKUP_VERSION = 1;
const MAX_BACKUP_SIZE = 100 * 1024 * 1024;
const QUARTERS = ["Q1", "Q2", "Q3", "Q4", "Misc files"];

function encodeBytes(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeBytes(encoded) {
  if (typeof encoded !== "string" || encoded.length % 4 !== 0
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error("A saved file in this backup has invalid encoded data.");
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function validateWorkspace(workspace) {
  if (!workspace || typeof workspace !== "object"
      || !Array.isArray(workspace.students) || !Array.isArray(workspace.classes)
      || (workspace.reportDrafts !== undefined
        && (!workspace.reportDrafts || typeof workspace.reportDrafts !== "object" || Array.isArray(workspace.reportDrafts)))) {
    throw new Error("This file is not a valid StrideLog workspace backup.");
  }
  const studentIds = new Set();
  for (const student of workspace.students) {
    if (!student || typeof student.id !== "string" || !student.id
        || typeof student.name !== "string" || !student.name.trim()
        || !student.quarters || typeof student.quarters !== "object"
        || (student.className !== undefined && typeof student.className !== "string")
        || (student.notes !== undefined && typeof student.notes !== "string")
        || (student.links !== undefined && (!Array.isArray(student.links) || student.links.some((link) => typeof link !== "string")))) {
      throw new Error("A student record in this backup is incomplete.");
    }
    if (studentIds.has(student.id)) throw new Error("This backup contains duplicate student IDs.");
    studentIds.add(student.id);
    for (const quarter of QUARTERS) {
      if (student.quarters[quarter] !== undefined && !Array.isArray(student.quarters[quarter])) {
        throw new Error(`The ${quarter} records for ${student.name} are invalid.`);
      }
      for (const assessment of student.quarters[quarter] || []) {
        if (!assessment || typeof assessment !== "object"
            || typeof assessment.title !== "string"
            || (assessment.score !== null && assessment.score !== undefined
              && (!Number.isFinite(assessment.score) || assessment.score < 0 || assessment.score > 100))) {
          throw new Error(`An assessment for ${student.name} is invalid.`);
        }
      }
    }
  }
  if (workspace.classes.some((className) => typeof className !== "string")) {
    throw new Error("This backup contains an invalid class list.");
  }
  return studentIds;
}

export async function createBackupDocument(workspace, files, exportedAt = new Date().toISOString()) {
  validateWorkspace(workspace);
  let totalSize = 0;
  const savedFiles = [];
  for (const file of files) {
    if (!(file.data instanceof Blob)) throw new Error(`Could not export ${file.name}: file data is unavailable.`);
    totalSize += file.data.size;
    if (totalSize > MAX_BACKUP_SIZE) {
      throw new Error("Workspace files exceed the 100 MB JSON backup limit. Remove or download some files first.");
    }
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    savedFiles.push({
      id: file.id,
      studentId: file.studentId,
      quarter: file.quarter,
      name: file.name,
      type: file.type || "",
      addedAt: file.addedAt || "",
      data: encodeBytes(bytes),
    });
  }
  return {
    format: WORKSPACE_BACKUP_FORMAT,
    version: WORKSPACE_BACKUP_VERSION,
    exportedAt,
    workspace,
    files: savedFiles,
  };
}

export async function parseBackupDocument(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (backup?.format !== WORKSPACE_BACKUP_FORMAT || backup?.version !== WORKSPACE_BACKUP_VERSION) {
    throw new Error("This file is not a supported StrideLog workspace backup.");
  }
  const studentIds = validateWorkspace(backup.workspace);
  if (!Array.isArray(backup.files)) throw new Error("This backup does not contain a valid saved-file list.");

  let totalSize = 0;
  const fileIds = new Set();
  const files = backup.files.map((file) => {
    if (!file || typeof file.id !== "string" || !file.id || typeof file.studentId !== "string"
        || !studentIds.has(file.studentId) || typeof file.name !== "string"
        || !QUARTERS.includes(file.quarter)) {
      throw new Error("This backup contains a saved file with invalid student or quarter details.");
    }
    if (fileIds.has(file.id)) throw new Error("This backup contains duplicate saved-file IDs.");
    fileIds.add(file.id);
    const bytes = decodeBytes(file.data);
    totalSize += bytes.byteLength;
    if (totalSize > MAX_BACKUP_SIZE) throw new Error("This workspace backup exceeds the 100 MB restore limit.");
    return {
      id: file.id,
      studentId: file.studentId,
      quarter: file.quarter,
      name: file.name,
      type: typeof file.type === "string" ? file.type : "",
      size: bytes.byteLength,
      addedAt: typeof file.addedAt === "string" ? file.addedAt : "",
      data: new Blob([bytes], { type: typeof file.type === "string" ? file.type : "" }),
    };
  });
  return { workspace: backup.workspace, files };
}
