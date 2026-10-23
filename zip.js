function readEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 22) throw new Error("This file is not a valid ZIP archive.");
  const view = new DataView(buffer);
  let endOffset = -1;
  const lowerBound = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= lowerBound; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("This file is not a valid ZIP archive.");

  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const entries = [];
  let totalSize = 0;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("The ZIP archive has an invalid file directory.");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nameEnd = offset + 46 + nameLength;
    if (nameEnd + extraLength + commentLength > bytes.length) {
      throw new Error("The ZIP archive has an invalid file directory.");
    }
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, nameEnd));
    offset = nameEnd + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (flags & 1) throw new Error(`The spreadsheet file "${name}" is encrypted and cannot be read.`);
    if (compressedSize > 25 * 1024 * 1024) throw new Error(`The spreadsheet file "${name}" is larger than the 25 MB import limit.`);
    totalSize += uncompressedSize;
    if (uncompressedSize > 25 * 1024 * 1024 || totalSize > 50 * 1024 * 1024) {
      throw new Error("The uncompressed HTML in this ZIP exceeds the 50 MB import limit.");
    }
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error(`The spreadsheet file "${name}" has an invalid header.`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    if (start + compressedSize > bytes.length) {
      throw new Error(`The spreadsheet file "${name}" is incomplete.`);
    }
    entries.push({ name, method, compressed: bytes.slice(start, start + compressedSize), uncompressedSize });
  }
  return entries;
}

export async function unzipFiles(buffer, include = () => true) {
  const entries = readEntries(buffer).filter((entry) => include(entry.name));
  if (!entries.length) return [];
  const documents = [];
  for (const entry of entries) {
    let contents;
    if (entry.method === 0) contents = entry.compressed;
    else if (entry.method === 8 && typeof DecompressionStream !== "undefined") {
      const stream = new Blob([entry.compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      contents = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      throw new Error(`The ZIP compression used for "${entry.name}" is not supported by this browser.`);
    }
    if (entry.uncompressedSize !== contents.length) {
      throw new Error(`The spreadsheet file "${entry.name}" is incomplete.`);
    }
    documents.push({ name: entry.name, text: new TextDecoder("utf-8").decode(contents) });
  }
  return documents;
}

export async function unzipHtml(buffer) {
  const documents = await unzipFiles(buffer, (name) => /\.(html?|xhtml)$/i.test(name));
  if (!documents.length) {
    throw new Error("No HTML spreadsheet was found inside this ZIP. Choose the HTML spreadsheet ZIP export.");
  }
  return documents.map(({ name, text }) => ({ name, html: text }));
}
