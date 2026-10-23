import { unzipFiles } from "./zip.js";

function parseXml(xml, name) {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  if (parsed.querySelector("parsererror")) throw new Error(`Could not read ${name}.`);
  return parsed;
}

export async function officeDocumentPreview(file) {
  const entries = await unzipFiles(await file.arrayBuffer(), (name) =>
    name === "word/document.xml" || /^ppt\/slides\/slide\d+\.xml$/i.test(name),
  );
  if (/\.docx$/i.test(file.name)) {
    const documentXml = entries.find((entry) => entry.name === "word/document.xml")?.text;
    if (!documentXml) throw new Error("This DOCX file does not contain a readable document.");
    const parsed = parseXml(documentXml, "the Word document");
    return [...parsed.getElementsByTagName("p")]
      .map((paragraph) => [...paragraph.getElementsByTagName("t")].map((text) => text.textContent).join(""))
      .filter(Boolean)
      .join("\n\n");
  }

  if (/\.pptx$/i.test(file.name)) {
    const slides = entries
      .sort((a, b) => Number(a.name.match(/slide(\d+)\.xml$/i)?.[1]) - Number(b.name.match(/slide(\d+)\.xml$/i)?.[1]));
    if (!slides.length) throw new Error("This PowerPoint file does not contain readable slides.");
    return slides.map((slide, index) => {
      const parsed = parseXml(slide.text, slide.name);
      const text = [...parsed.getElementsByTagName("t")].map((node) => node.textContent).filter(Boolean).join("\n");
      return `SLIDE ${index + 1}\n${text || "[No slide text]"}`;
    }).join("\n\n");
  }
  throw new Error("Preview is not available for this Office document.");
}
