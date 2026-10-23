# StrideLog

StrideLog is a calm, private workspace for teachers to organize student progress. Keep a roster, group students into classes, follow assessment scores over time, and collect quarter-by-quarter files and notes in one place.

## Run locally

Requirements: Python 3 and Node.js 20 or newer.

```sh
npm start
```

Open [http://localhost:5173](http://localhost:5173). To use a different port:

```sh
python3 -m http.server 8080
```

No framework installation, database server, or build step is required.

## What is included

- **Student roster:** search and open student profiles; add or edit names, class groups, and teacher notes.
- **Progress chart:** view scored tests from Q1 through Q4 in chronological quarter/test order, with the oldest score on the left and the latest on the right. Test scores can be between 0 and 100; tests without a score are listed but do not distort the graph.
- **Quarter tabs:** keep each student's assessments and files organized in Q1, Q2, Q3, Q4, and Misc files. Empty test slots from a spreadsheet are skipped, so actual tests stay together without gaps.
- **Class groups:** create groups and drag students between classes or back to the unassigned list.
- **Student files:** attach and download IEPs and other resources under the student and selected quarter. Files are stored in this browser's IndexedDB.
- **Spreadsheet import:** select a ZIP containing an HTML spreadsheet, or select the HTML file itself. StrideLog looks for a `Student Name` header and columns named `Test Number 1`, `Test Number 2`, and so on, with optional `Notes` and `Links to files` columns. A suffix such as `Josh Q2` places assessments in Q2; a name without a quarter suffix is assigned to Q1. Matching students are updated by name while their class groups and saved files are kept.
- **Local persistence:** roster data, test scores, groups, notes, and spreadsheet links are saved in this browser's local storage.

The first launch includes a small example roster modeled on the supplied spreadsheet so the dashboard is ready to explore. Import your own spreadsheet to add or update those records. Use the browser's site-data controls to remove locally saved information.

## Privacy and data handling

StrideLog has no application server or cloud sync. Student records stay in browser local storage and uploaded files stay in browser IndexedDB on the device where they were added. The app does not send student information to a StrideLog service. This local-only design means records do not automatically appear on another device or browser profile. Back up files and records according to your school's policies, and use a device and browser account approved for student information.

## Spreadsheet format

The importer reads HTML tables inside a ZIP archive (or a standalone `.html`, `.htm`, or HTML `.xls` file). A header row must include `Student Name` and at least one `Test Number N` column. Test cells can contain a score alone (`80`) or a score followed by a test name (`80 - Unit exam`). Blank test cells are ignored. Student names can end in `Q1`, `Q2`, `Q3`, or `Q4` to assign that row to a quarter. The `Notes` and `Links to files` headers are optional.

Imports are limited to 25 MB. The ZIP must contain an unencrypted HTML document using the standard stored or DEFLATE compression supported by the browser. Imported links are shown only when they use HTTP or HTTPS.

## Checks

```sh
npm test
node --check app.js
node --check importer.js
```

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) for the full terms.
