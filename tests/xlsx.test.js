import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import { parseSpreadsheetRows } from "../importer.js";
import { parseXlsxRows } from "../xlsx.js";

function decodeXml(text) {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

class XmlElement {
  constructor(name, attributes = {}) {
    this.localName = name.split(":").at(-1);
    this.attributes = attributes;
    this.children = [];
    this.text = "";
  }

  getAttribute(name) {
    return this.attributes[name] || "";
  }

  getAttributeNS(namespace, name) {
    return this.getAttribute(`r:${name}`);
  }

  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join("");
  }

  getElementsByTagName(name) {
    const normalized = name.split(":").at(-1);
    return this.children.flatMap((child) => [
      ...(child.localName === normalized ? [child] : []),
      ...child.getElementsByTagName(normalized),
    ]);
  }
}

class TestDOMParser {
  parseFromString(xml) {
    const document = new XmlElement("#document");
    const stack = [document];
    const tokens = xml.match(/<[^>]+>|[^<]+/g) || [];
    for (const token of tokens) {
      if (token.startsWith("<?") || token.startsWith("<!")) continue;
      if (token.startsWith("</")) {
        stack.pop();
        continue;
      }
      if (token.startsWith("<")) {
        const name = token.match(/^<([\w:.-]+)/)?.[1];
        if (!name) continue;
        const attributes = {};
        const attributeText = token.slice(name.length + 1).replace(/\/?>$/, "");
        for (const match of attributeText.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
          attributes[match[1]] = decodeXml(match[2]);
        }
        const element = new XmlElement(name, attributes);
        stack.at(-1).children.push(element);
        if (!token.endsWith("/>")) stack.push(element);
      } else {
        stack.at(-1).text += decodeXml(token);
      }
    }
    document.querySelector = () => null;
    document.getElementsByTagName = XmlElement.prototype.getElementsByTagName;
    return document;
  }
}

function makeZip(files) {
  const local = [];
  const central = [];
  let localOffset = 0;
  for (const [name, text] of files) {
    const filename = Buffer.from(name);
    const content = Buffer.from(text);
    const compressed = deflateRawSync(content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, compressed);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(content.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(localOffset, 42);
    central.push(directory, filename);
    localOffset += header.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...local, directory, end]);
}

test("imports only the data sheet and never treats instructions as students", async () => {
  globalThis.DOMParser = TestDOMParser;
  const workbook = await readFile(new URL("../templates/StrideLog-Progress-Report-Template.xlsx", import.meta.url));
  const rows = await parseXlsxRows(workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength));

  assert.equal(rows.length, 34);
  assert.equal(rows[3][0], "Student Name");
  assert.equal(rows[3][1], "Test Number 1 in percent");
  assert.equal(rows.some((row) => row.some((cell) => cell.includes("How to use this template"))), false);
  assert.equal(rows.some((row) => row[0]?.startsWith("1. Add one row")), false);
});

test("reads shared-string Excel files and selects the student sheet when it is not first", async () => {
  globalThis.DOMParser = TestDOMParser;
  const workbook = makeZip([
    ["xl/workbook.xml", '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Instructions" r:id="rId1"/><sheet name="Progress Report" r:id="rId2"/></sheets></workbook>'],
    ["xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'],
    ["xl/sharedStrings.xml", '<sst><si><t>How to use this template</t></si><si><t>1. Add one row for each student</t></si><si><t>Student Name</t></si><si><t>Test Number 1</t></si><si><t>Notes</t></si><si><t>Links to files</t></si><si><t>Divit G Q3</t></si><si><t>95 - Fractions</t></si><si><t>Good progress</t></si></sst>'],
    ["xl/worksheets/sheet1.xml", '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>'],
    ["xl/worksheets/sheet2.xml", '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>2</v></c><c r="B1" t="s"><v>3</v></c><c r="C1" t="s"><v>4</v></c><c r="D1" t="s"><v>5</v></c></row><row r="2"><c r="A2" t="s"><v>6</v></c><c r="B2" t="s"><v>7</v></c><c r="C2" t="s"><v>8</v></c></row></sheetData></worksheet>'],
  ]);
  const rows = await parseXlsxRows(workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength));
  const [student] = parseSpreadsheetRows(rows);

  assert.equal(student.name, "Divit G");
  assert.equal(student.quarters.Q3[0].title, "Fractions");
  assert.equal(student.quarters.Q3[0].score, 95);
  assert.equal(student.notes, "Good progress");
});
