from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "templates" / "StrideLog-Progress-Report-Template.xlsx"
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
ET.register_namespace("", MAIN_NS)
ET.register_namespace("r", REL_NS)


def tag(namespace, name):
    return f"{{{namespace}}}{name}"


def column_name(index):
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def worksheet_xml(rows, widths, freeze=None, autofilter=None, merged=None):
    root = ET.Element(tag(MAIN_NS, "worksheet"))
    views = ET.SubElement(root, tag(MAIN_NS, "sheetViews"))
    view = ET.SubElement(views, tag(MAIN_NS, "sheetView"), {"workbookViewId": "0"})
    if freeze:
        ET.SubElement(view, tag(MAIN_NS, "pane"), {
            "ySplit": str(freeze),
            "topLeftCell": f"A{freeze + 1}",
            "activePane": "bottomLeft",
            "state": "frozen",
        })
        ET.SubElement(view, tag(MAIN_NS, "selection"), {"pane": "bottomLeft", "activeCell": f"A{freeze + 1}", "sqref": f"A{freeze + 1}"})
    cols = ET.SubElement(root, tag(MAIN_NS, "cols"))
    for index, width in enumerate(widths, 1):
        ET.SubElement(cols, tag(MAIN_NS, "col"), {"min": str(index), "max": str(index), "width": str(width), "customWidth": "1"})
    sheet_data = ET.SubElement(root, tag(MAIN_NS, "sheetData"))
    for row_number, values in enumerate(rows, 1):
        row = ET.SubElement(sheet_data, tag(MAIN_NS, "row"), {"r": str(row_number)})
        for column, value in enumerate(values, 1):
            if value is None:
                continue
            cell = ET.SubElement(row, tag(MAIN_NS, "c"), {
                "r": f"{column_name(column)}{row_number}",
                "s": str(value[1]),
                "t": "inlineStr",
            })
            inline = ET.SubElement(cell, tag(MAIN_NS, "is"))
            text = ET.SubElement(inline, tag(MAIN_NS, "t"))
            text.text = value[0]
    if autofilter:
        ET.SubElement(root, tag(MAIN_NS, "autoFilter"), {"ref": autofilter})
    if merged:
        merge_cells = ET.SubElement(root, tag(MAIN_NS, "mergeCells"), {"count": str(len(merged))})
        for reference in merged:
            ET.SubElement(merge_cells, tag(MAIN_NS, "mergeCell"), {"ref": reference})
    ET.SubElement(root, tag(MAIN_NS, "pageMargins"), {
        "left": "0.3", "right": "0.3", "top": "0.5", "bottom": "0.5", "header": "0.2", "footer": "0.2",
    })
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def workbook_styles():
    root = ET.Element(tag(MAIN_NS, "styleSheet"))
    fonts = ET.SubElement(root, tag(MAIN_NS, "fonts"), {"count": "3"})
    ET.SubElement(fonts, tag(MAIN_NS, "font"))
    title = ET.SubElement(fonts, tag(MAIN_NS, "font"))
    ET.SubElement(title, tag(MAIN_NS, "b"))
    ET.SubElement(title, tag(MAIN_NS, "sz"), {"val": "16"})
    ET.SubElement(title, tag(MAIN_NS, "color"), {"rgb": "FF285C4D"})
    ET.SubElement(title, tag(MAIN_NS, "name"), {"val": "Aptos Display"})
    header = ET.SubElement(fonts, tag(MAIN_NS, "font"))
    ET.SubElement(header, tag(MAIN_NS, "b"))
    ET.SubElement(header, tag(MAIN_NS, "color"), {"rgb": "FFFFFFFF"})
    ET.SubElement(header, tag(MAIN_NS, "name"), {"val": "Aptos"})
    fills = ET.SubElement(root, tag(MAIN_NS, "fills"), {"count": "3"})
    ET.SubElement(fills, tag(MAIN_NS, "fill")).append(ET.Element(tag(MAIN_NS, "patternFill"), {"patternType": "none"}))
    ET.SubElement(fills, tag(MAIN_NS, "fill")).append(ET.Element(tag(MAIN_NS, "patternFill"), {"patternType": "gray125"}))
    header_fill = ET.SubElement(fills, tag(MAIN_NS, "fill"))
    ET.SubElement(header_fill, tag(MAIN_NS, "patternFill"), {"patternType": "solid"})
    ET.SubElement(header_fill[0], tag(MAIN_NS, "fgColor"), {"rgb": "FF31735F"})
    ET.SubElement(header_fill[0], tag(MAIN_NS, "bgColor"), {"indexed": "64"})
    borders = ET.SubElement(root, tag(MAIN_NS, "borders"), {"count": "2"})
    ET.SubElement(borders, tag(MAIN_NS, "border"))
    border = ET.SubElement(borders, tag(MAIN_NS, "border"))
    for edge in ("left", "right", "top", "bottom"):
        side = ET.SubElement(border, tag(MAIN_NS, edge), {"style": "thin"})
        ET.SubElement(side, tag(MAIN_NS, "color"), {"rgb": "FFE4EAE5"})
    cell_styles = ET.SubElement(root, tag(MAIN_NS, "cellStyleXfs"), {"count": "1"})
    ET.SubElement(cell_styles, tag(MAIN_NS, "xf"), {"numFmtId": "0", "fontId": "0", "fillId": "0", "borderId": "0"})
    formats = ET.SubElement(root, tag(MAIN_NS, "cellXfs"), {"count": "4"})
    ET.SubElement(formats, tag(MAIN_NS, "xf"), {"numFmtId": "0", "fontId": "0", "fillId": "0", "borderId": "0", "xfId": "0"})
    ET.SubElement(formats, tag(MAIN_NS, "xf"), {"numFmtId": "0", "fontId": "1", "fillId": "0", "borderId": "0", "xfId": "0", "applyFont": "1"})
    ET.SubElement(formats, tag(MAIN_NS, "xf"), {"numFmtId": "0", "fontId": "0", "fillId": "0", "borderId": "1", "xfId": "0", "applyBorder": "1"})
    ET.SubElement(formats, tag(MAIN_NS, "xf"), {"numFmtId": "0", "fontId": "2", "fillId": "2", "borderId": "1", "xfId": "0", "applyFont": "1", "applyFill": "1", "applyBorder": "1"})
    cell_formats = ET.SubElement(root, tag(MAIN_NS, "cellStyles"), {"count": "1"})
    ET.SubElement(cell_formats, tag(MAIN_NS, "cellStyle"), {"name": "Normal", "xfId": "0", "builtinId": "0"})
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    headers = ["Student Name"] + [
        "Test Number 1 in percent" if number == 1 else f"Test Number {number}"
        for number in range(1, 10)
    ] + ["Notes", "Links to files"]
    main_rows = [
        [("StrideLog · Student Progress Template", 1)] + [None] * 11,
        [("Add one row per student and quarter. Use a name like Jordan Lee Q1; leave unused test cells blank.", 0)] + [None] * 11,
        [("Scores may be a number (85) or include a test title (85 - Fractions quiz).", 0)] + [None] * 11,
        [(header, 3) for header in headers],
    ]
    main_rows.extend([[("", 2) for _ in headers] for _ in range(30)])
    instructions = [
        [("How to use this template", 1)],
        [("1. Add one row for each student's quarter.", 0)],
        [("2. Put the student's name and quarter in the first column, such as Jordan Lee Q1 or Jordan Lee Q2.", 0)],
        [("3. Enter assessment scores in order from oldest to newest. Leave unused test cells blank.", 0)],
        [("4. A test cell may contain just a score (85) or a score and title (85 - Fractions quiz).", 0)],
        [("5. Add teacher notes and file links in the last two columns if needed.", 0)],
        [("6. Save as .xlsx, then use Import spreadsheet in StrideLog. Blank student rows are ignored.", 0)],
        [("Template columns", 1)],
        [("Student Name: Student name plus optional quarter suffix Q1/Q2/Q3/Q4.", 0)],
        [("Test Number 1–9: Scores or score-and-title text, oldest first.", 0)],
        [("Notes: Teacher observations; repeated notes for the same student are combined.", 0)],
        [("Links to files: Optional HTTP/HTTPS links separated by commas.", 0)],
        [("Privacy reminder: Keep student information on school-approved devices and follow district policy.", 0)],
    ]
    workbook = ET.Element(tag(MAIN_NS, "workbook"))
    book_views = ET.SubElement(workbook, tag(MAIN_NS, "bookViews"))
    ET.SubElement(book_views, tag(MAIN_NS, "workbookView"), {"activeTab": "0"})
    sheets = ET.SubElement(workbook, tag(MAIN_NS, "sheets"))
    ET.SubElement(sheets, tag(MAIN_NS, "sheet"), {"name": "Progress Report", "sheetId": "1", tag(REL_NS, "id"): "rId1"})
    ET.SubElement(sheets, tag(MAIN_NS, "sheet"), {"name": "Instructions", "sheetId": "2", tag(REL_NS, "id"): "rId2"})
    rels = ET.Element(tag(PKG_REL_NS, "Relationships"))
    for index, target in enumerate(("worksheets/sheet1.xml", "worksheets/sheet2.xml"), 1):
        ET.SubElement(rels, tag(PKG_REL_NS, "Relationship"), {
            "Id": f"rId{index}",
            "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
            "Target": target,
        })
    ET.SubElement(rels, tag(PKG_REL_NS, "Relationship"), {
        "Id": "rId3",
        "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
        "Target": "styles.xml",
    })
    content_types = ET.Element(tag(CONTENT_NS, "Types"))
    ET.SubElement(content_types, tag(CONTENT_NS, "Default"), {"Extension": "rels", "ContentType": "application/vnd.openxmlformats-package.relationships+xml"})
    ET.SubElement(content_types, tag(CONTENT_NS, "Default"), {"Extension": "xml", "ContentType": "application/xml"})
    ET.SubElement(content_types, tag(CONTENT_NS, "Override"), {"PartName": "/xl/workbook.xml", "ContentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"})
    ET.SubElement(content_types, tag(CONTENT_NS, "Override"), {"PartName": "/xl/worksheets/sheet1.xml", "ContentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"})
    ET.SubElement(content_types, tag(CONTENT_NS, "Override"), {"PartName": "/xl/worksheets/sheet2.xml", "ContentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"})
    ET.SubElement(content_types, tag(CONTENT_NS, "Override"), {"PartName": "/xl/styles.xml", "ContentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"})
    root_rels = ET.Element(tag(PKG_REL_NS, "Relationships"))
    ET.SubElement(root_rels, tag(PKG_REL_NS, "Relationship"), {
        "Id": "rId1",
        "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
        "Target": "xl/workbook.xml",
    })

    parts = {
        "[Content_Types].xml": ET.tostring(content_types, encoding="utf-8", xml_declaration=True),
        "_rels/.rels": ET.tostring(root_rels, encoding="utf-8", xml_declaration=True),
        "xl/workbook.xml": ET.tostring(workbook, encoding="utf-8", xml_declaration=True),
        "xl/_rels/workbook.xml.rels": ET.tostring(rels, encoding="utf-8", xml_declaration=True),
        "xl/styles.xml": workbook_styles(),
        "xl/worksheets/sheet1.xml": worksheet_xml(
            main_rows, [25] + [21] * 9 + [38, 34], freeze=4, autofilter="A4:L34", merged=["A1:L1", "A2:L2", "A3:L3"],
        ),
        "xl/worksheets/sheet2.xml": worksheet_xml(instructions, [115], merged=[f"A{row}:A{row}" for row in range(1, len(instructions) + 1)]),
    }
    with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as archive:
        for name, content in parts.items():
            archive.writestr(name, content)
    print(f"Created {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
