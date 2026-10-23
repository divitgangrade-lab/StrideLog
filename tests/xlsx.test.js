import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
