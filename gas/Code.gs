/* global ContentService, LockService, PropertiesService, SpreadsheetApp, Utilities */
"use strict";

var APP = Object.freeze({
  schemaVersion: "gas-schema.v1",
  maxBodyBytes: 65536,
  maximumSkewMs: 60000,
  sessionLifetimeMs: 21600000,
  lockTimeoutMs: 10000,
  maximumFailures: 5,
  lockoutMs: 900000,
});

var SHEETS = Object.freeze({
  Settings: ["Key", "Value", "UpdatedAt"],
  Users: ["Email", "Role", "Status", "LocationID", "CredentialMode", "PasswordAlgorithm", "PasswordSalt", "PasswordVerifier", "PasswordIterations", "PasswordUpdatedAt", "MustChangePassword", "FailedAttemptCount", "LockedUntil", "StateVersion"],
  Sessions: ["SessionHash", "Email", "IssuedAt", "ExpiresAt", "RevokedAt"],
  Nonces: ["Nonce", "ExpiresAt"],
  Locations: ["LocationID", "Name", "Status", "UpdatedAt"],
  Reports: ["RecordID", "PersonID", "LocationID", "ExamEventID", "PdfHash", "ParserVersion", "PayloadFormatVersion", "Status", "ImportedBy", "ImportedAt", "SupersedesRecordID", "SummaryJSON"],
  PayloadChunks: ["RecordID", "PayloadType", "ChunkIndex", "ChunkCount", "ChunkHash", "PayloadHash", "PayloadJSON"],
  AuditLog: ["AuditID", "OccurredAt", "Actor", "Role", "Action", "Result", "RequestID", "TargetType", "TargetID", "DetailsCode", "PreviousHash", "EntryHash"],
  BackupLog: ["BackupID", "StartedAt", "CompletedAt", "Result", "SourceSpreadsheetID", "BackupFileID", "RecordCount", "Hash"],
});

function jsonOutput(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function failure(code) { return { ok: false, code: code }; }
function success(code, data) { return { ok: true, code: code, data: data === undefined ? null : data }; }
function nowIso() { return new Date().toISOString(); }
function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
function hex(bytes) { return bytes.map(function (value) { return (value < 0 ? value + 256 : value).toString(16).padStart(2, "0"); }).join(""); }
function sha256(value) { return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)); }
function base64Url(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/u, ""); }
function constantEqual(left, right) {
  var a = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(left), Utilities.Charset.UTF_8);
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(right), Utilities.Charset.UTF_8);
  var difference = 0;
  for (var index = 0; index < a.length; index += 1) difference |= (a[index] & 255) ^ (b[index] & 255);
  return difference === 0;
}

function property(name) {
  var value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error("missing required Script Property: " + name);
  return value;
}

function workbook() { return SpreadsheetApp.openById(property("MANAGEMENT_SPREADSHEET_ID")); }
function sheet(name) {
  var result = workbook().getSheetByName(name);
  if (!result) throw new Error("required sheet is missing: " + name);
  return result;
}

function ensureSchema() {
  var book = workbook();
  Object.keys(SHEETS).forEach(function (name) {
    var target = book.getSheetByName(name) || book.insertSheet(name);
    var expected = SHEETS[name];
    var actual = target.getLastColumn() ? target.getRange(1, 1, 1, target.getLastColumn()).getValues()[0] : [];
    if (target.getLastRow() === 0) target.getRange(1, 1, 1, expected.length).setValues([expected]);
    else if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("sheet header mismatch: " + name);
    target.setFrozenRows(1);
  });
  upsertSetting_("SchemaVersion", APP.schemaVersion);
}

function upsertSetting_(key, value) {
  var target = sheet("Settings");
  var values = target.getDataRange().getValues();
  for (var row = 1; row < values.length; row += 1) {
    if (values[row][0] === key) {
      target.getRange(row + 1, 2, 1, 2).setValues([[String(value), nowIso()]]);
      return;
    }
  }
  target.appendRow([key, String(value), nowIso()]);
}

function parseEnvelope_(event) {
  if (!event || !event.postData || event.postData.type.indexOf("application/json") !== 0) throw new Error("INVALID_CONTENT_TYPE");
  if (event.postData.length < 2 || event.postData.length > APP.maxBodyBytes) throw new Error("INVALID_BODY_SIZE");
  var envelope = JSON.parse(event.postData.contents);
  var keys = ["bodyHash", "bodyText", "method", "nonce", "path", "signature", "timestamp"];
  if (!envelope || Array.isArray(envelope) || JSON.stringify(Object.keys(envelope).sort()) !== JSON.stringify(keys)) throw new Error("INVALID_ENVELOPE");
  if (envelope.method !== "POST" || !/^\/internal\/[a-z0-9.-]{1,80}$/u.test(envelope.path)) throw new Error("INVALID_ROUTE");
  if (!/^\d{13}$/u.test(envelope.timestamp) || Math.abs(Date.now() - Number(envelope.timestamp)) > APP.maximumSkewMs) throw new Error("EXPIRED");
  if (!/^[A-Za-z0-9_-]{22,128}$/u.test(envelope.nonce)) throw new Error("INVALID_NONCE");
  if (!constantEqual(sha256(envelope.bodyText), envelope.bodyHash)) throw new Error("BODY_HASH_MISMATCH");
  var canonical = [envelope.method, envelope.path, envelope.timestamp, envelope.nonce, envelope.bodyHash].join("\n");
  var expected = base64Url(Utilities.computeHmacSha256Signature(canonical, property("HMAC_SECRET_CURRENT"), Utilities.Charset.UTF_8));
  var next = PropertiesService.getScriptProperties().getProperty("HMAC_SECRET_NEXT");
  var valid = constantEqual(expected, envelope.signature);
  if (!valid && next) valid = constantEqual(base64Url(Utilities.computeHmacSha256Signature(canonical, next, Utilities.Charset.UTF_8)), envelope.signature);
  if (!valid) throw new Error("SIGNATURE_MISMATCH");
  consumeNonce_(envelope.nonce);
  var parsed = JSON.parse(envelope.bodyText);
  if (parsed.operation !== envelope.path.slice(10) || typeof parsed.body !== "object" || parsed.body === null || Array.isArray(parsed.body)) throw new Error("BODY_INVALID");
  return parsed;
}

function consumeNonce_(nonce) {
  var target = sheet("Nonces");
  var now = Date.now();
  var values = target.getDataRange().getValues();
  var retained = [SHEETS.Nonces];
  var duplicate = false;
  for (var row = 1; row < values.length; row += 1) {
    if (values[row][0] === nonce && Date.parse(values[row][1]) > now) duplicate = true;
    if (Date.parse(values[row][1]) > now) retained.push(values[row]);
  }
  if (duplicate) throw new Error("REPLAYED");
  retained.push([nonce, new Date(now + APP.maximumSkewMs * 2).toISOString()]);
  target.clearContents();
  target.getRange(1, 1, retained.length, 2).setValues(retained);
}

function rowObject_(name, row) {
  var headers = SHEETS[name];
  var object = {};
  headers.forEach(function (header, index) { object[header] = row[index]; });
  return object;
}

function findUser_(email) {
  var values = sheet("Users").getDataRange().getValues();
  for (var row = 1; row < values.length; row += 1) if (normalizeEmail(values[row][0]) === email) return { rowNumber: row + 1, value: rowObject_("Users", values[row]) };
  return null;
}

function userState_(user) {
  return sha256([user.Email, user.Role, user.Status, user.PasswordSalt, user.PasswordVerifier, user.PasswordIterations, user.MustChangePassword, user.FailedAttemptCount, user.LockedUntil].join("\n"));
}

function authChallenge_(body) {
  var email = normalizeEmail(body.email);
  var found = findUser_(email);
  var active = found && found.value.Status === "ACTIVE" && found.value.CredentialMode !== "OTP_ONLY";
  var user = active ? found.value : null;
  return success("CHALLENGE", {
    salt: user ? user.PasswordSalt : property("DUMMY_PASSWORD_SALT"),
    verifier: user ? user.PasswordVerifier : property("DUMMY_PASSWORD_VERIFIER"),
    iterations: Number(user ? user.PasswordIterations : property("DUMMY_PASSWORD_ITERATIONS")),
    stateVersion: user ? userState_(user) : "dummy",
  });
}

function authComplete_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(APP.lockTimeoutMs);
  try {
    var email = normalizeEmail(body.email);
    var found = findUser_(email);
    if (!found || found.value.Status !== "ACTIVE" || userState_(found.value) !== body.stateVersion) return failure("AUTHENTICATION_FAILED");
    var locked = found.value.LockedUntil && Date.parse(found.value.LockedUntil) > Date.now();
    var authenticated = body.matched === true && !locked;
    var failures = authenticated ? 0 : Number(found.value.FailedAttemptCount || 0) + 1;
    var lockedUntil = authenticated ? "" : failures >= APP.maximumFailures ? new Date(Date.now() + APP.lockoutMs).toISOString() : found.value.LockedUntil;
    sheet("Users").getRange(found.rowNumber, 12, 1, 3).setValues([[failures, lockedUntil, Utilities.getUuid()]]);
    if (!authenticated || !/^[0-9a-f]{64}$/u.test(body.sessionHash)) return failure("AUTHENTICATION_FAILED");
    sheet("Sessions").appendRow([body.sessionHash, email, nowIso(), new Date(Date.now() + APP.sessionLifetimeMs).toISOString(), ""]);
    audit_(email, found.value.Role, "LOGIN", "SUCCESS", "User", sha256(email), "AUTHENTICATED");
    return success(found.value.MustChangePassword === true ? "PASSWORD_CHANGE_REQUIRED" : "AUTHENTICATED", { role: found.value.Role, mustChangePassword: found.value.MustChangePassword === true });
  } finally { lock.releaseLock(); }
}

function authenticate_(sessionHash) {
  if (!/^[0-9a-f]{64}$/u.test(String(sessionHash || ""))) return null;
  var sessions = sheet("Sessions").getDataRange().getValues();
  for (var row = sessions.length - 1; row >= 1; row -= 1) {
    if (constantEqual(sessions[row][0], sessionHash) && !sessions[row][4] && Date.parse(sessions[row][3]) > Date.now()) {
      var found = findUser_(normalizeEmail(sessions[row][1]));
      if (found && found.value.Status === "ACTIVE") return found;
    }
  }
  return null;
}

function allowed_(role, operation) {
  if (operation === "api.auth.logout" || operation === "api.auth.change-password") return ["INPUT", "ADMIN", "AUTH_MANAGER"].indexOf(role) >= 0;
  if (operation === "api.auth.reset") return role === "AUTH_MANAGER";
  if (operation === "api.register") return role === "INPUT" || role === "ADMIN";
  return role === "ADMIN";
}

function api_(operation, body) {
  var found = authenticate_(body.sessionHash);
  if (!found) return failure("UNAUTHENTICATED");
  if (!allowed_(found.value.Role, operation)) return failure("FORBIDDEN");
  if (found.value.MustChangePassword === true && operation !== "api.auth.change-password" && operation !== "api.auth.logout") return failure("PASSWORD_CHANGE_REQUIRED");
  if (operation === "api.auth.logout") {
    revokeSession_(body.sessionHash);
    return success("LOGGED_OUT");
  }
  return failure("NOT_IMPLEMENTED");
}

function revokeSession_(sessionHash) {
  var target = sheet("Sessions");
  var values = target.getDataRange().getValues();
  for (var row = 1; row < values.length; row += 1) if (constantEqual(values[row][0], sessionHash) && !values[row][4]) target.getRange(row + 1, 5).setValue(nowIso());
}

function audit_(actor, role, action, result, targetType, targetId, detailsCode) {
  var target = sheet("AuditLog");
  var lastRow = target.getLastRow();
  var previousHash = lastRow > 1 ? String(target.getRange(lastRow, 12).getValue()) : "GENESIS";
  var fields = [Utilities.getUuid(), nowIso(), sha256(actor), role, action, result, Utilities.getUuid(), targetType, targetId, detailsCode, previousHash];
  fields.push(sha256(fields.join("\n")));
  target.appendRow(fields);
}

function dispatch_(request) {
  if (request.operation === "auth.challenge") return authChallenge_(request.body);
  if (request.operation === "auth.complete") return authComplete_(request.body);
  if (request.operation.indexOf("api.") === 0) return api_(request.operation, request.body);
  return failure("NOT_FOUND");
}

function doPost(e) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(APP.lockTimeoutMs);
    var request;
    try { request = parseEnvelope_(e); } finally { lock.releaseLock(); }
    return jsonOutput(dispatch_(request));
  } catch (error) {
    // Do not log request bodies, credentials, signatures, cookies, or Sheet data.
    return jsonOutput(failure(error && error.message === "REPLAYED" ? "REPLAYED" : "REQUEST_REJECTED"));
  }
}
