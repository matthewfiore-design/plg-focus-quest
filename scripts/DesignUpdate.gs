/**
 * People chips cannot be created with setValue("@Alexa Stahl").
 * Sheets needs a chip run whose placeholder is "@" and whose email
 * matches a Workspace person.
 *
 * One extra step after paste:
 *   Apps Script editor → Services (+) → Google Sheets API → Add
 * Then Deploy → Manage deployments → Edit → New version.
 */
const SCRIPT_VERSION = 4;
var responseCallback_ = "";
const SPREADSHEET_ID = "1WO_g6zMRL_T9gw0lfP7jf25_sSoLlSacQH59sWP-eH8";
const TAB = "Sheet1";
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
