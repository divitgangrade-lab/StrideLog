import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { unzipHtml } from "../zip.js";

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const { name, text, method = 8 } of files) {
    const filename = Buffer.from(name);
    const contents = Buffer.from(text);
    const compressed = method === 8 ? deflateRawSync(contents) : contents;
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(contents.length, 22);
    localHeader.writeUInt16LE(filename.length, 26);
    localParts.push(localHeader, filename, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(contents.length, 24);
    centralHeader.writeUInt16LE(filename.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, filename);
    localOffset += localHeader.length + filename.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

test("reads DEFLATE and stored HTML spreadsheet files from a ZIP", async () => {
  const compressedHtml = "<table><tr><th>Student Name</th></tr><tr><td>Alex Q1</td></tr></table>";
  const storedHtml = "<html><body>another export</body></html>";
  const zip = createZip([
    { name: "readme.txt", text: "ignored" },
    { name: "export.html", text: compressedHtml },
    { name: "backup.htm", text: storedHtml, method: 0 },
  ]);

  assert.deepEqual(await unzipHtml(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)), [
    { name: "export.html", html: compressedHtml },
    { name: "backup.htm", html: storedHtml },
  ]);
});

test("reports invalid archives and archives without HTML", async () => {
  await assert.rejects(unzipHtml(new ArrayBuffer(8)), /valid ZIP/);
  const zip = createZip([{ name: "readme.txt", text: "not a spreadsheet" }]);
  await assert.rejects(unzipHtml(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)), /No HTML spreadsheet/);
});

test("rejects unsupported compression methods", async () => {
  const zip = createZip([{ name: "export.html", text: "<html></html>", method: 99 }]);
  await assert.rejects(unzipHtml(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)), /compression.*not supported/i);
});
