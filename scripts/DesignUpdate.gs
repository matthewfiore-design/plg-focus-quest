/**
 * People chips cannot be created with setValue("@Alexa Stahl").
 * Sheets needs a chip run whose placeholder is "@" and whose email
 * matches a Workspace person.
 *
 * One extra step after paste:
 *   Apps Script editor → Services (+) → Google Sheets API → Add
 * Then Deploy → Manage deployments → Edit → New version.
 */
const SCRIPT_VERSION = 6;
var responseCallback_ = "";
const SPREADSHEET_ID = "1WO_g6zMRL_T9gw0lfP7jf25_sSoLlSacQH59sWP-eH8";
const TAB = "Sheet1";

/**
 * Quest tasks live in their own workbook, separate from the roadmap above.
 * Roadmap sheet = what the team is shipping. Progress sheet = who did what.
 */
const PROGRESS_SHEET_ID = "1uCM4CIrz2ekhaP6CNj76rwuLLTSLFVBAJZ4HLbzi8YU";
const TASKS_TAB = "Tasks";
const TASK_HEADERS = [
  "Task ID",
  "Designer",
  "Title",
  "Type",
  "Roadmap ID",
  "Roadmap name",
  "Milestone",
  "Scheduled date",
  "Original date",
  "Completed",
  "Completed at",
  "XP",
  "Rollover count",
  "Credited to",
  "Generated",
  "Note",
  "Updated at",
];
// Positional order the client uses when it sends compact array rows.
const TASK_FIELD_ORDER = [
  "id",
  "designer",
  "title",
  "type",
  "roadmapId",
  "roadmapName",
  "milestone",
  "scheduledDate",
  "originalDate",
  "completed",
  "completedAt",
  "xp",
  "rolloverCount",
  "creditedTo",
  "generated",
  "note",
];
const FIELDS = {
  designer: "Designer",
  figmaLinks: "Figma Links",
  prototypeLinks: "Prototype Links",
};
const DESIGNER_EMAILS = {
  "Alexa Stahl": "alexastahl@zendesk.com",
  "Ankit Bansod": "ankit.bansod@zendesk.com",
  "Dheeraj Kumar": "dheeraj.kumar@zendesk.com",
  "Lynette Liwanag": "lliwanag@zendesk.com",
  "Nicaela Rivera": "nicaela.rivera@zendesk.com",
  "Suhail Shaikh": "suhail.shaikh@zendesk.com",
  "Matthew Fiore": "matthew.fiore@zendesk.com",
};

function json_(obj) {
  var text = JSON.stringify(obj);
  if (responseCallback_ && /^[A-Za-z_][A-Za-z0-9_]*$/.test(responseCallback_)) {
    return ContentService.createTextOutput(responseCallback_ + "(" + text + ")").setMimeType(
      ContentService.MimeType.JAVASCRIPT
    );
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return handle_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  var payload = {};
  if (e && e.postData && e.postData.contents) {
    payload = JSON.parse(e.postData.contents);
  } else if (e && e.parameter) {
    payload = e.parameter;
  }
  return handle_(payload);
}

function targetSheet_(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === 0) return sheets[i];
  }
  return ss.getSheetByName(TAB) || sheets[0];
}

function handle_(p) {
  p = p || {};
  responseCallback_ = String(p.callback || "");
  try {
    var field = String(p.field || "");
    var action = String(p.action || "");
    if (field === "ping" || action === "ping" || field === "version") {
      return json_({ ok: true, version: SCRIPT_VERSION, canReadLinks: true });
    }
    if (field === "links" || action === "links") {
      return json_(collectLinks_(p));
    }
    if (field === "sheet" || action === "sheet") {
      return json_(collectSheet_(p));
    }
    if (field === "tasks" || action === "tasks") {
      return json_(upsertTasks_(p));
    }
    if (field === "tasksRead" || action === "tasksRead") {
      return json_(readTasks_(p));
    }
    var header = FIELDS[field];
    if (!header) return json_({ ok: false, message: "Unsupported field: " + field });

    var sheet = targetSheet_(SpreadsheetApp.openById(SPREADSHEET_ID));
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var col = -1;
    var projectCol = headerIndex_(headers, "Project Name");
    for (var i = 0; i < headers.length; i++) {
      var name = String(headers[i] || "").trim();
      if (name === header || (field === "prototypeLinks" && name === "Prototype Link")) {
        col = i + 1;
        break;
      }
    }
    if (col < 1) return json_({ ok: false, message: 'Could not find "' + header + '" column.' });

    var expectedName = String(p.name || "").trim();
    var row = Number(p.sheetRow || 0);
    if (row > 1 && projectCol > 0) {
      var nameAtRow = String(sheet.getRange(row, projectCol).getValue() || "").trim();
      if (nameAtRow !== expectedName) row = 0;
    }
    if (!(row > 1)) {
      row = findRow_(sheet, headers, p);
    }
    if (!(row > 1)) {
      return json_({ ok: false, message: 'Could not find "' + expectedName + '" in the roadmap sheet.' });
    }

    var value = p.value == null ? "" : String(p.value);
    var written = { value: value, chip: false, email: "" };
    if (field === "designer") {
      written = setDesignerValue_(sheet, row, col, value, p.email);
    } else {
      sheet.getRange(row, col).setValue(value);
    }
    SpreadsheetApp.flush();
    return json_({
      ok: true,
      range: sheet.getName() + "!" + columnToLetter_(col) + row,
      value: written.value,
      chip: Boolean(written.chip),
      email: written.email || "",
      name: String(sheet.getRange(row, projectCol || 1).getValue() || ""),
      via: "apps-script",
    });
  } catch (err) {
    return json_({ ok: false, message: String(err) });
  }
}

function designerName_(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, " ");
}

function tasksSheet_() {
  var ss = SpreadsheetApp.openById(PROGRESS_SHEET_ID);
  var sheet = ss.getSheetByName(TASKS_TAB);
  if (!sheet) sheet = ss.insertSheet(TASKS_TAB);
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (headerIndex_(headers, "Title") < 1 || headerIndex_(headers, "Task ID") < 1) {
    sheet.getRange(1, 1, 1, TASK_HEADERS.length).setValues([TASK_HEADERS]);
    sheet.setFrozenRows(1);
    headers = TASK_HEADERS.slice();
  }
  return { sheet: sheet, headers: headers };
}

function taskTruthy_(value) {
  var text = String(value == null ? "" : value).trim().toUpperCase();
  return text === "TRUE" || text === "YES" || text === "1" || text === "CHECKED";
}

function taskMatchKey_(designer, title, type, original) {
  return [
    designerName_(designer).toLowerCase(),
    String(title || "").trim().toLowerCase(),
    String(type || "daily").trim().toLowerCase(),
    String(original || "").trim().slice(0, 10),
  ].join("|");
}

/** Accepts either a positional array or a named object. */
function normalizeTask_(raw, fallbackDesigner) {
  var task = {};
  if (Object.prototype.toString.call(raw) === "[object Array]") {
    for (var i = 0; i < TASK_FIELD_ORDER.length; i++) task[TASK_FIELD_ORDER[i]] = raw[i];
  } else if (raw && typeof raw === "object") {
    task = raw;
  } else {
    return null;
  }
  var title = String(task.title || "").trim();
  var id = String(task.id || "").trim();
  if (!title && !id) return null;
  task.id = id;
  task.title = title;
  task.designer = designerName_(task.designer) || designerName_(fallbackDesigner);
  task.type = String(task.type || "daily").trim();
  task.originalDate = String(task.originalDate || task.scheduledDate || "").slice(0, 10);
  return task;
}

function taskRowValues_(task, headers, now) {
  var byHeader = {
    "Task ID": task.id || "",
    Designer: task.designer || "",
    Title: task.title || "",
    Type: task.type || "daily",
    "Roadmap ID": task.roadmapId || "",
    "Roadmap name": task.roadmapName || "",
    Milestone: task.milestone || "",
    "Scheduled date": String(task.scheduledDate || "").slice(0, 10),
    "Original date": task.originalDate || "",
    Completed: taskTruthy_(task.completed) ? "TRUE" : "FALSE",
    "Completed at": task.completedAt || "",
    XP: Number(task.xp) || 0,
    "Rollover count": Number(task.rolloverCount) || 0,
    "Credited to": task.creditedTo || "",
    Generated: taskTruthy_(task.generated) ? "TRUE" : "FALSE",
    Note: task.note || "",
    "Updated at": now,
  };
  var values = [];
  for (var i = 0; i < headers.length; i++) {
    var key = String(headers[i] || "").trim();
    values.push(Object.prototype.hasOwnProperty.call(byHeader, key) ? byHeader[key] : "");
  }
  return values;
}

function upsertTasks_(p) {
  var fallback = designerName_(p.designer);
  var payload = p.rows || p.tasks || "[]";
  var incoming;
  try {
    incoming = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch (err) {
    return { ok: false, message: "rows must be valid JSON: " + err };
  }
  if (Object.prototype.toString.call(incoming) !== "[object Array]") {
    return { ok: false, message: "rows must be an array." };
  }

  var ctx = tasksSheet_();
  var sheet = ctx.sheet;
  var headers = ctx.headers;
  var lastRow = sheet.getLastRow();
  var existing = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];

  var idCol = headerIndex_(headers, "Task ID");
  var designerCol = headerIndex_(headers, "Designer");
  var titleCol = headerIndex_(headers, "Title");
  var typeCol = headerIndex_(headers, "Type");
  var origCol = headerIndex_(headers, "Original date");
  var schedCol = headerIndex_(headers, "Scheduled date");

  var byId = {};
  var byKey = {};
  for (var r = 0; r < existing.length; r++) {
    var row = existing[r];
    var rowNum = r + 2;
    var rid = idCol > 0 ? String(row[idCol - 1] || "").trim() : "";
    if (rid) byId[rid] = rowNum;
    var rDesigner = designerCol > 0 ? row[designerCol - 1] : "";
    var rTitle = titleCol > 0 ? row[titleCol - 1] : "";
    if (rDesigner && rTitle) {
      var rOrig = origCol > 0 ? row[origCol - 1] : schedCol > 0 ? row[schedCol - 1] : "";
      byKey[taskMatchKey_(rDesigner, rTitle, typeCol > 0 ? row[typeCol - 1] : "", rOrig)] = rowNum;
    }
  }

  var now = new Date().toISOString();
  var appended = 0;
  var updated = 0;
  var appendBuffer = [];
  var nextAppendRow = Math.max(lastRow + 1, 2);

  for (var i = 0; i < incoming.length; i++) {
    var task = normalizeTask_(incoming[i], fallback);
    if (!task) continue;
    var values = taskRowValues_(task, headers, now);
    var target = task.id && byId[task.id] ? byId[task.id] : 0;
    if (!target) {
      var key = taskMatchKey_(task.designer, task.title, task.type, task.originalDate);
      if (byKey[key]) target = byKey[key];
    }
    if (target) {
      sheet.getRange(target, 1, 1, headers.length).setValues([values]);
      updated++;
    } else {
      appendBuffer.push(values);
      if (task.id) byId[task.id] = nextAppendRow;
      byKey[taskMatchKey_(task.designer, task.title, task.type, task.originalDate)] = nextAppendRow;
      nextAppendRow++;
      appended++;
    }
  }

  if (appendBuffer.length) {
    sheet.getRange(lastRow + 1, 1, appendBuffer.length, headers.length).setValues(appendBuffer);
  }
  SpreadsheetApp.flush();
  return {
    ok: true,
    updated: updated,
    appended: appended,
    tab: TASKS_TAB,
    sheetUrl: SpreadsheetApp.openById(PROGRESS_SHEET_ID).getUrl(),
    via: "apps-script",
  };
}

function readTasks_(p) {
  var want = designerName_(p.designer);
  var ctx = tasksSheet_();
  var sheet = ctx.sheet;
  var headers = ctx.headers;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, tasks: [], via: "apps-script" };

  var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var cols = {};
  for (var h = 0; h < headers.length; h++) cols[String(headers[h] || "").trim()] = h;

  function cell(row, key) {
    var idx = cols[key];
    return idx == null ? "" : String(row[idx] == null ? "" : row[idx]).trim();
  }

  var tasks = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var title = cell(row, "Title");
    var id = cell(row, "Task ID");
    if (!title && !id) continue;
    var designer = designerName_(cell(row, "Designer"));
    if (want && designer !== want) continue;
    tasks.push({
      id: id,
      designer: designer,
      title: title,
      type: cell(row, "Type") || "daily",
      roadmapId: cell(row, "Roadmap ID"),
      roadmapName: cell(row, "Roadmap name"),
      milestone: cell(row, "Milestone"),
      scheduledDate: cell(row, "Scheduled date").slice(0, 10),
      originalDate: cell(row, "Original date").slice(0, 10),
      completed: taskTruthy_(cell(row, "Completed")),
      completedAt: cell(row, "Completed at"),
      xp: Number(cell(row, "XP")) || 0,
      rolloverCount: Number(cell(row, "Rollover count")) || 0,
      creditedTo: cell(row, "Credited to"),
      note: cell(row, "Note"),
    });
  }
  return { ok: true, tasks: tasks, via: "apps-script" };
}

function setDesignerValue_(sheet, row, col, rawValue, emailHint) {
  var name = designerName_(rawValue);
  var range = sheet.getRange(row, col);
  if (!name || name === "Unassigned") {
    range.setValue("");
    return { value: "", chip: false, email: "" };
  }
  if (name === "N/A") {
    range.setValue("N/A");
    return { value: "N/A", chip: false, email: "" };
  }
  var email = String(emailHint || DESIGNER_EMAILS[name] || "").trim();
  if (!email) {
    throw new Error('No Zendesk email mapped for "' + name + '". Cannot create a people chip.');
  }
  writePersonChip_(sheet, row, col, email);
  return { value: "@" + name, chip: true, email: email };
}

function writePersonChip_(sheet, row, col, email) {
  if (typeof Sheets === "undefined" || !Sheets.Spreadsheets) {
    throw new Error(
      "Add Google Sheets API in Apps Script: Services (+) → Google Sheets API → Add, then deploy a new version. Typing @Name cannot create a people chip."
    );
  }
  Sheets.Spreadsheets.batchUpdate(
    {
      requests: [
        {
          updateCells: {
            rows: [
              {
                values: [
                  {
                    userEnteredValue: { stringValue: "@" },
                    chipRuns: [
                      {
                        startIndex: 0,
                        chip: {
                          personProperties: {
                            email: email,
                            displayFormat: "DEFAULT",
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
            fields: "userEnteredValue,chipRuns",
            range: {
              sheetId: sheet.getSheetId(),
              startRowIndex: row - 1,
              endRowIndex: row,
              startColumnIndex: col - 1,
              endColumnIndex: col,
            },
          },
        },
      ],
    },
    sheet.getParent().getId()
  );
}

function findRow_(sheet, headers, p) {
  var name = String(p.name || "").trim().replace(/\s+/g, " ");
  if (!name) return 0;
  var projectCol = headerIndex_(headers, "Project Name");
  var quarterCol = headerIndex_(headers, "Expected Launch Quarter");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || projectCol < 1) return 0;
  var width = quarterCol > 0 ? Math.max(projectCol, quarterCol) : projectCol;
  var values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  var targetQuarter = String(p.expectedLaunchQuarter || "").trim().toUpperCase();
  for (var i = 0; i < values.length; i++) {
    var rowName = String(values[i][projectCol - 1] || "").trim().replace(/\s+/g, " ");
    if (rowName !== name) continue;
    if (targetQuarter && quarterCol > 0) {
      var rowQuarter = String(values[i][quarterCol - 1] || "").trim().toUpperCase();
      if (rowQuarter && rowQuarter !== targetQuarter) continue;
    }
    return i + 2;
  }
  return 0;
}

function headerIndex_(headers, label) {
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i] || "").trim() === label) return i + 1;
  }
  return 0;
}

function columnToLetter_(column) {
  var letter = "";
  var temp = column;
  while (temp > 0) {
    var rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

/**
 * Whole-sheet read for the nightly roadmap sync. Uses a single
 * getDisplayValues() call; collectLinks_ asks the Sheets API per row, which
 * exceeds the execution budget once every row is requested.
 * Rows come back in sheet order starting at row 2, blanks included, so a
 * consumer can map array index to sheet row.
 */
function collectSheet_(p) {
  var sheet = targetSheet_(SpreadsheetApp.openById(SPREADSHEET_ID));
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { ok: true, headers: [], rows: [] };

  var values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  var headers = [];
  for (var c = 0; c < values[0].length; c++) {
    headers.push(String(values[0][c] == null ? "" : values[0][c]).trim());
  }

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = [];
    for (var i = 0; i < lastCol; i++) {
      row.push(String(values[r][i] == null ? "" : values[r][i]));
    }
    rows.push(row);
  }

  return {
    ok: true,
    version: SCRIPT_VERSION,
    tab: sheet.getName(),
    firstRow: 2,
    headers: headers,
    rows: rows,
  };
}

function collectLinks_(p) {
  p = p || {};
  var sheet = targetSheet_(SpreadsheetApp.openById(SPREADSHEET_ID));
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { ok: true, links: {} };

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var projectCol = headerIndex_(headers, "Project Name");
  var quarterCol = headerIndex_(headers, "Expected Launch Quarter");
  var cols = {
    designer: headerIndex_(headers, "Designer"),
    prd: headerIndex_(headers, "PRD Link"),
    figma: headerIndex_(headers, "Figma Links"),
    prototype: headerIndex_(headers, "Prototype Links") || headerIndex_(headers, "Prototype Link"),
    jira: headerIndex_(headers, "JIRA PLAN Link"),
  };

  var rows = [];
  var targetName = String(p.name || "").trim().replace(/\s+/g, " ");
  if (targetName) {
    var row = findRow_(sheet, headers, p);
    if (!(row > 1)) return { ok: true, links: {} };
    rows.push(row);
  } else {
    for (var r = 2; r <= lastRow; r++) rows.push(r);
  }

  var links = {};
  for (var i = 0; i < rows.length; i++) {
    var rowNum = rows[i];
    var range = sheet.getRange(rowNum, 1, 1, lastCol);
    var display = range.getDisplayValues()[0];
    var formulas = range.getFormulas()[0];
    var rich = range.getRichTextValues()[0];
    var name = String((projectCol > 0 ? display[projectCol - 1] : "") || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!name) continue;
    if (targetName && name !== targetName) continue;
    var quarter = String((quarterCol > 0 ? display[quarterCol - 1] : "") || "")
      .trim()
      .toUpperCase();
    var apiRow = apiLinkRow_(sheet, rowNum, lastCol);
    links[name + "|" + quarter] = {
      designer: designerDisplay_(display, cols.designer),
      prd: cellLinks_(rich, formulas, display, apiRow, cols.prd),
      figma: cellLinks_(rich, formulas, display, apiRow, cols.figma),
      prototype: cellLinks_(rich, formulas, display, apiRow, cols.prototype),
      jira: cellLinks_(rich, formulas, display, apiRow, cols.jira),
    };
    if (targetName) break;
  }
  return { ok: true, links: links };
}

function apiLinkRow_(sheet, row, lastCol) {
  if (typeof Sheets === "undefined" || !Sheets.Spreadsheets) return [];
  try {
    var rangeA1 = sheet.getName() + "!A" + row + ":" + columnToLetter_(lastCol) + row;
    var resp = Sheets.Spreadsheets.get(sheet.getParent().getId(), {
      ranges: [rangeA1],
      fields: "sheets.data.rowData.values(formattedValue,hyperlink,chipRuns)",
    });
    var values = (((((resp.sheets || [])[0] || {}).data || [])[0] || {}).rowData || [])[0];
    return values && values.values ? values.values : [];
  } catch (err) {
    return [];
  }
}

function cellLinks_(richRow, formulaRow, displayRow, apiRow, col) {
  if (!(col > 0)) return [];
  var idx = col - 1;
  return extractCellLinks_(
    richRow ? richRow[idx] : null,
    formulaRow ? formulaRow[idx] : "",
    displayRow ? displayRow[idx] : "",
    apiRow ? apiRow[idx] : null
  );
}

function designerDisplay_(displayRow, col) {
  if (!(col > 0) || !displayRow) return "";
  return String(displayRow[col - 1] || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, " ");
}

function extractCellLinks_(rich, formula, display, apiCell) {
  var items = [];
  var seen = {};
  function add(href, label) {
    href = String(href || "").trim();
    if (!href || seen[href]) return;
    if (!/^https?:\/\//i.test(href) && !/^www\./i.test(href)) return;
    if (/^www\./i.test(href)) href = "https://" + href;
    seen[href] = true;
    var text = String(label || "").trim();
    if (!text || /^https?:\/\//i.test(text)) text = href;
    items.push({ href: href, label: text });
  }

  if (apiCell && apiCell.hyperlink) add(apiCell.hyperlink, display);
  var chipRuns = apiCell && apiCell.chipRuns ? apiCell.chipRuns : [];
  for (var c = 0; c < chipRuns.length; c++) {
    var chip = chipRuns[c] && chipRuns[c].chip;
    var uri = chip && chip.richLinkProperties && chip.richLinkProperties.uri;
    if (uri) add(uri, display);
  }

  if (rich) {
    if (rich.getLinkUrl()) add(rich.getLinkUrl(), rich.getText());
    var runs = rich.getRuns() || [];
    for (var r = 0; r < runs.length; r++) {
      if (runs[r].getLinkUrl()) add(runs[r].getLinkUrl(), runs[r].getText());
    }
  }

  String(formula || "").replace(/HYPERLINK\s*\(\s*"([^"]+)"/gi, function (_, url) {
    add(url, display);
    return _;
  });
  String(display || "").replace(/https?:\/\/[^\s<>"']+/gi, function (url) {
    add(url, url);
    return url;
  });
  return items;
}
