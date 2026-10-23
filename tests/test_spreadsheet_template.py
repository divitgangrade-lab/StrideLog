from pathlib import Path
from unittest import TestCase
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates" / "StrideLog-Progress-Report-Template.xlsx"
NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


class SpreadsheetTemplateTests(TestCase):
    def test_workbook_is_valid_and_has_both_expected_sheets(self):
        with ZipFile(TEMPLATE) as workbook:
            bad_file = workbook.testzip()
            self.assertIsNone(bad_file, f"Corrupt workbook entry: {bad_file}")
            content_types = ET.fromstring(workbook.read("[Content_Types].xml"))
            workbook_xml = ET.fromstring(workbook.read("xl/workbook.xml"))
            sheet_names = [sheet.attrib["name"] for sheet in workbook_xml.findall(".//x:sheet", NS)]
            self.assertIn(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
                [entry.attrib["ContentType"] for entry in content_types],
            )
            self.assertEqual(sheet_names, ["Progress Report", "Instructions"])

    def test_progress_sheet_matches_stride_log_import_headers_and_is_blank(self):
        with ZipFile(TEMPLATE) as workbook:
            sheet = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
            rows = sheet.findall(".//x:sheetData/x:row", NS)
            header_cells = rows[3].findall("x:c", NS)
            headers = [
                "".join(cell.findall(".//x:t", NS)[index].text or "" for index in range(len(cell.findall(".//x:t", NS))))
                for cell in header_cells
            ]
            self.assertEqual(headers[0], "Student Name")
            self.assertEqual(headers[1], "Test Number 1 in percent")
            self.assertEqual(headers[9], "Test Number 9")
            self.assertEqual(headers[10:], ["Notes", "Links to files"])
            self.assertEqual(len(rows), 34)
            self.assertTrue(all(
                not any(text.text for text in row.findall(".//x:t", NS))
                for row in rows[4:]
            ))
            self.assertEqual(sheet.find("x:autoFilter", NS).attrib["ref"], "A4:L34")
            self.assertEqual(sheet.find("x:sheetViews/x:sheetView/x:pane", NS).attrib["state"], "frozen")
