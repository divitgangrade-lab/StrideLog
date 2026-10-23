import { unzipFiles } from "./zip.js";

function parseXml(xml, fileName) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  if (documentXml.querySelector("parsererror")) {
    throw new Error(`The Excel workbook contains invalid XML in ${fileName}.`);
  }
  return documentXml;
}

function normalizePath(path) {
  const parts = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function cellColumnIndex(reference) {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase();
  if (!letters) return -1;
  let column = 0;
  for (const letter of letters) column = column * 26 + letter.charCodeAt(0) - 64;
  return column - 1;
}

function sharedStringsFrom(xml) {
  const documentXml = parseXml(xml, "sharedStrings.xml");
  return [...documentXml.getElementsByTagName("si")].map((item) =>
    [...item.getElementsByTagName("t")].map((text) => text.textContent).join(""),
  );
}

function rowsFromWorksheet(xml, sharedStrings, fileName) {
  const documentXml = parseXml(xml, fileName);
  return [...documentXml.getElementsByTagName("sheetData")]
    .flatMap((sheetData) => [...sheetData.getElementsByTagName("row")])
    .map((row) => {
      const cells = [...row.children].filter((element) => element.localName === "c");
      const values = [];
      for (const cell of cells) {
        const index = cellColumnIndex(cell.getAttribute("r") || "");
        if (index < 0) continue;
        const type = cell.getAttribute("t");
        let value = "";
        if (type === "inlineStr") {
          value = [...cell.getElementsByTagName("t")].map((text) => text.textContent).join("");
        } else {
          const raw = cell.getElementsByTagName("v")[0]?.textContent || "";
          if (type === "s") value = sharedStrings[Number(raw)] ?? "";
          else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
          else value = raw;
        }
        values[index] = value;
      }
      return values.map((value) => value || "");
    });
}

export async function parseXlsxRows(buffer) {
  const files = await unzipFiles(buffer, (name) =>
    name === "xl/workbook.xml"
    || name === "xl/_rels/workbook.xml.rels"
    || name === "xl/sharedStrings.xml"
    || /^xl\/worksheets\/[^/]+\.xml$/i.test(name),
  );
  const fileMap = new Map(files.map((file) => [normalizePath(file.name), file.text]));
  const workbookXml = fileMap.get("xl/workbook.xml");
  const relationshipXml = fileMap.get("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relationshipXml) {
    throw new Error("This ZIP does not contain a valid Excel workbook. Choose an .xlsx spreadsheet.");
  }

  const workbook = parseXml(workbookXml, "workbook.xml");
  const relationships = parseXml(relationshipXml, "workbook relationships");
  const targets = new Map([...relationships.getElementsByTagName("Relationship")].map((relationship) => [
    relationship.getAttribute("Id"),
    normalizePath(relationship.getAttribute("Target").startsWith("/")
      ? relationship.getAttribute("Target")
      : `xl/${relationship.getAttribute("Target")}`),
  ]));
  const sharedStringsXml = fileMap.get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml ? sharedStringsFrom(sharedStringsXml) : [];
  const rows = [];
  for (const sheet of workbook.getElementsByTagName("sheet")) {
    const relationshipId = sheet.getAttribute("r:id")
      || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = targets.get(relationshipId);
    const worksheetXml = target && fileMap.get(target);
    if (worksheetXml) rows.push(...rowsFromWorksheet(worksheetXml, sharedStrings, target));
  }
  if (!rows.length) throw new Error("The Excel workbook contains no readable worksheet data.");
  return rows;
}
