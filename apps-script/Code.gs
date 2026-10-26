const CONFIG = Object.freeze({
  pointsSpreadsheetId: '1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I',
  usersSpreadsheetId: '1TEfbxeO5gwPBgJc2N9VTGpBcZAAzKwCmS1UcWcLJ-pI',
  firestoreProjectId: 'svatomartinske-putovani',
  visitsSheet: 'Navstevy',
  visitsSyncMinutes: 5,
  activeLocationLifetimeMs: 2 * 60 * 1000,
  activeLocationMaxAccuracyM: 100,
  usersSheet: 'Users',
  otpLifetimeMs: 10 * 60 * 1000,
  otpResendMs: 60 * 1000,
  otpMaxAttempts: 5,
  sessionLifetimeMs: 90 * 24 * 60 * 60 * 1000,
  sessionTouchMs: 60 * 60 * 1000
});

function doGet(e) {
  const action = String(e && e.parameter && e.parameter.action || 'ping');
  return json_(action === 'ping' ? {status:'OK', version:'otp-1.0'} : {status:'ERROR', error:'METHOD_NOT_ALLOWED'});
}

function doPost(e) {
  let data;
  try { data = parseRequest_(e); } catch (_) { return json_({status:'ERROR', error:'INVALID_REQUEST'}); }
  try {
    switch (data.action) {
      case 'requestCode': return requestVerificationCode_(data.email);
      case 'verifyCode': return verifyCode_(data.email, data.verificationCode, data.requestId);
      case 'session': return sessionInfo_(data.sessionToken);
      case 'data': return dataResponse_(data.sessionToken);
      case 'visit': return recordVisit_(data.sessionToken, data.pointId, data.measuredAt, data.lat, data.lng, data.accuracyM);
      case 'locationUpdate': return updateActiveLocation_(data.sessionToken, data.measuredAt, data.lat, data.lng, data.accuracyM);
      case 'adminActiveLocations': return adminActiveLocationsResponse_(data.sessionToken);
      case 'adminUsers': return adminUsersResponse_(data.sessionToken);
      case 'logout': return logout_(data.sessionToken);
      default: return json_({status:'ERROR', error:'UNKNOWN_ACTION'});
    }
  } catch (err) {
    console.error(err && err.stack || err);
    return json_({status:'ERROR', error:'SERVER_ERROR'});
  }
}

function requestVerificationCode_(rawEmail) {
  const email = normalizeEmail_(rawEmail);
  if (!isValidEmail_(email)) return json_({status:'ERROR', error:'INVALID_EMAIL'});
  setupAuth_();
  if (MailApp.getRemainingDailyQuota() < 1) return json_({status:'ERROR', error:'EMAIL_QUOTA_EXCEEDED'});
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let code;
  try {
    const path = 'authCodes/' + emailDocumentId_(email);
    const previous = firestoreGet_(path);
    const requestedAt = previous && asDate_(previous.requestedAt);
    if (requestedAt && Date.now() - requestedAt.getTime() < CONFIG.otpResendMs) {
      return json_({status:'ERROR', error:'TOO_MANY_REQUESTS', retryAfter:60});
    }
    code = generateOtp_();
    const now = new Date();
    firestoreSet_(path, {
      email:email, codeHash:hash_('otp:' + email + ':' + code),
      expiresAt:new Date(now.getTime() + CONFIG.otpLifetimeMs), attempts:0,
      requestedAt:now, usedAt:null, verificationRequestIdHash:''
    });
  } finally { lock.releaseLock(); }
  MailApp.sendEmail({
    to:email,
    subject:'Ověřovací kód – Svatomartinské putování',
    body:'Váš ověřovací kód je: ' + code + '\n\nKód platí 10 minut. Pokud jste o něj nežádali, tento e-mail ignorujte.',
    htmlBody:'<p>Váš ověřovací kód pro <strong>Svatomartinské putování</strong> je:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">' + code + '</p><p>Kód platí 10 minut. Pokud jste o něj nežádali, tento e-mail ignorujte.</p>',
    name:'Svatomartinské putování'
  });
  return json_({status:'OK'});
}

function verifyCode_(rawEmail, rawCode, rawRequestId) {
  const email = normalizeEmail_(rawEmail), code = String(rawCode || '').replace(/\s/g, '');
  const requestId = normalizeVerificationRequestId_(rawRequestId);
  if (!isValidEmail_(email) || !/^\d{6}$/.test(code)) return json_({status:'ERROR', error:'INVALID_CODE'});
  if (rawRequestId && !requestId) return json_({status:'ERROR', error:'INVALID_REQUEST'});
  setupAuth_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const path = 'authCodes/' + emailDocumentId_(email), authCode = firestoreGet_(path);
    if (!authCode) return json_({status:'ERROR', error:'INVALID_CODE'});
    const submittedHash = hash_('otp:' + email + ':' + code);
    if (authCode.usedAt) {
      const resumed = requestId ? resumeVerifiedSession_(email, submittedHash, requestId, authCode) : null;
      return json_(resumed || {status:'ERROR', error:'INVALID_CODE'});
    }
    const expiresAt = asDate_(authCode.expiresAt), attempts = Number(authCode.attempts) || 0;
    if (!expiresAt || expiresAt.getTime() < Date.now()) return json_({status:'ERROR', error:'CODE_EXPIRED'});
    if (attempts >= CONFIG.otpMaxAttempts) return json_({status:'ERROR', error:'TOO_MANY_ATTEMPTS'});
    if (!constantTimeEqual_(String(authCode.codeHash || ''), submittedHash)) {
      authCode.attempts = attempts + 1; firestoreSet_(path, authCode);
      return json_({status:'ERROR', error:'INVALID_CODE'});
    }
    const user = registerOrReadUser_(email), now = new Date();
    const token = requestId ? verificationSessionToken_(email, requestId) : generateToken_();
    const expires = new Date(now.getTime() + CONFIG.sessionLifetimeMs);
    authCode.usedAt = now;
    authCode.verificationRequestIdHash = requestId ? verificationRequestIdHash_(email, requestId) : '';
    firestoreSet_(path, authCode);
    firestoreSet_('sessions/' + hash_('session:' + token), {
      tokenHash:hash_('session:' + token), userId:emailDocumentId_(email), email:email,
      createdAt:now, expiresAt:expires, revokedAt:null, lastSeenAt:now
    });
    return json_(verificationResponse_(token, email, expires, user.role));
  } finally { lock.releaseLock(); }
}

function resumeVerifiedSession_(email, submittedHash, requestId, authCode) {
  if (!constantTimeEqual_(String(authCode.codeHash || ''), submittedHash) ||
      !constantTimeEqual_(String(authCode.verificationRequestIdHash || ''), verificationRequestIdHash_(email, requestId))) return null;
  const token = verificationSessionToken_(email, requestId);
  const session = firestoreGet_('sessions/' + hash_('session:' + token));
  const expiresAt = session && asDate_(session.expiresAt), user = findUser_(email);
  if (!session || session.revokedAt || !expiresAt || expiresAt.getTime() < Date.now() || !user) return null;
  return verificationResponse_(token, email, expiresAt, user.role);
}

function verificationResponse_(token, email, expiresAt, role) {
  return {status:'OK', sessionToken:token, email:email, expiresAt:expiresAt.toISOString(), role:role, isAdmin:role === 'admin'};
}

function sessionInfo_(token) {
  const access = requireAccess_(token);
  return json_(access ? {status:'OK', email:access.session.email, expiresAt:access.session.expiresAt.toISOString(), role:access.user.role, isAdmin:access.user.role === 'admin'} : {status:'ERROR', error:'UNAUTHORIZED'});
}

function dataResponse_(token) {
  const access = requireAccess_(token);
  if (!access) return json_({status:'ERROR', error:'UNAUTHORIZED'});
  const points = firestoreList_('points').map(function(p) {
    return {id:String(p.__id || ''), name:String(p.name || ''), description:String(p.description || ''), lat:Number(p.lat), lng:Number(p.lng)};
  }).filter(function(p) { return p.id && isFinite(p.lat) && isFinite(p.lng); });
  const visits = firestoreList_('users/' + access.session.userId + '/visits').map(function(v) { return String(v.pointId || v.__id || ''); }).filter(Boolean);
  return json_({status:'OK', points:points, visits:visits, email:access.session.email, role:access.user.role, isAdmin:access.user.role === 'admin'});
}

function recordVisit_(token, rawPointId, rawMeasuredAt, rawLat, rawLng, rawAccuracy) {
  const access = requireAccess_(token);
  if (!access) return json_({status:'ERROR', error:'UNAUTHORIZED'});
  const pointId = String(rawPointId || '').trim(), measuredAtMs = Number(rawMeasuredAt);
  const lat = Number(rawLat), lng = Number(rawLng), accuracy = Number(rawAccuracy), now = new Date();
  if (!pointId || !isFinite(measuredAtMs) || !isFinite(lat) || !isFinite(lng) || !isFinite(accuracy)) return json_({status:'ERROR', error:'INVALID_VISIT'});
  const point = firestoreGet_('points/' + pointId);
  if (!point || !isFinite(Number(point.lat)) || !isFinite(Number(point.lng))) return json_({status:'ERROR', error:'INVALID_POINT'});
  if (!visitIsEligible_(point, {measuredAtMs:measuredAtMs, lat:lat, lng:lng, accuracy:accuracy}, now.getTime())) return json_({status:'ERROR', error:'LOCATION_NOT_ELIGIBLE'});
  const result = firestoreCreate_('users/' + access.session.userId + '/visits', pointId, {
    pointId:pointId, visitedAt:now, measuredAt:new Date(measuredAtMs), lat:lat, lng:lng, accuracyM:accuracy, email:access.session.email
  });
  return json_(result === 'ALREADY_EXISTS' ? {status:'ERROR', error:'ALREADY_EXISTS'} : {status:'OK', pointId:pointId});
}

function visitIsEligible_(point, fix, nowMs) {
  const age = Number(nowMs) - Number(fix.measuredAtMs);
  const lat = Number(fix.lat), lng = Number(fix.lng), accuracy = Number(fix.accuracy);
  if (!isFinite(age) || age < -2000 || age > 30000 || lat < -90 || lat > 90 || lng < -180 || lng > 180 || accuracy < 0 || accuracy > 20) return false;
  const pointLat = Number(point.lat), pointLng = Number(point.lng);
  if (!isFinite(pointLat) || !isFinite(pointLng)) return false;
  const latM = (lat - pointLat) * 111195;
  const lonMPerDeg = Number(point.lonMPerDeg) || 111195 * Math.cos(pointLat * Math.PI / 180);
  const lngM = (lng - pointLng) * lonMPerDeg, remaining = 20 - accuracy;
  return latM * latM + lngM * lngM <= remaining * remaining;
}

function adminUsersResponse_(token) {
  const access = requireAccess_(token);
  if (!access) return json_({status:'ERROR', error:'UNAUTHORIZED'});
  return json_(access.user.role === 'admin' ? {status:'OK', users:listUsers_()} : {status:'ERROR', error:'FORBIDDEN'});
}

function updateActiveLocation_(token, rawMeasuredAt, rawLat, rawLng, rawAccuracy) {
  const access = requireAccess_(token);
  if (!access) return json_({status:'ERROR', error:'UNAUTHORIZED'});
  const measuredAtMs = Number(rawMeasuredAt), lat = Number(rawLat), lng = Number(rawLng);
  const accuracyM = Number(rawAccuracy), now = new Date();
  if (!activeLocationIsValid_({measuredAtMs:measuredAtMs, lat:lat, lng:lng, accuracyM:accuracyM}, now.getTime())) {
    return json_({status:'ERROR', error:'INVALID_LOCATION'});
  }
  firestoreSet_('activeLocations/' + access.session.userId, {
    userId:access.session.userId, email:access.session.email, role:access.user.role,
    lat:lat, lng:lng, accuracyM:accuracyM, measuredAt:new Date(measuredAtMs), updatedAt:now
  });
  return json_({status:'OK'});
}

function activeLocationIsValid_(location, nowMs) {
  const age = Number(nowMs) - Number(location.measuredAtMs);
  return isFinite(age) && age >= -2000 && age <= 30000 &&
    isFinite(location.lat) && location.lat >= -90 && location.lat <= 90 &&
    isFinite(location.lng) && location.lng >= -180 && location.lng <= 180 &&
    isFinite(location.accuracyM) && location.accuracyM >= 0 &&
    location.accuracyM <= CONFIG.activeLocationMaxAccuracyM;
}

function adminActiveLocationsResponse_(token) {
  const access = requireAccess_(token);
  if (!access) return json_({status:'ERROR', error:'UNAUTHORIZED'});
  if (access.user.role !== 'admin') return json_({status:'ERROR', error:'FORBIDDEN'});
  const nowMs = Date.now();
  const locations = firestoreList_('activeLocations').filter(function(location) {
    const updatedAt = asDate_(location.updatedAt);
    return updatedAt && nowMs - updatedAt.getTime() <= CONFIG.activeLocationLifetimeMs;
  }).map(function(location) {
    return {
      email:String(location.email || ''), lat:Number(location.lat), lng:Number(location.lng),
      accuracyM:Number(location.accuracyM) || 0,
      updatedAt:(asDate_(location.updatedAt) || new Date(0)).toISOString()
    };
  }).filter(function(location) {
    return isFinite(location.lat) && isFinite(location.lng);
  }).sort(function(a, b) {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  return json_({status:'OK', locations:locations, activeWithinSeconds:CONFIG.activeLocationLifetimeMs / 1000});
}

function logout_(rawToken) {
  const token = String(rawToken || '');
  if (token.length >= 40 && token.length <= 200) {
    const path = 'sessions/' + hash_('session:' + token), session = firestoreGet_(path);
    if (session) {
      session.revokedAt = new Date(); firestoreSet_(path, session);
      if (session.userId) firestoreDelete_('activeLocations/' + String(session.userId));
    }
  }
  return json_({status:'OK'});
}

function requireAccess_(token) {
  const session = requireSession_(token); if (!session) return null;
  const user = findUser_(session.email); return user ? {session:session, user:user} : null;
}

function requireSession_(rawToken) {
  const token = String(rawToken || ''); if (token.length < 40 || token.length > 200) return null;
  setupAuth_();
  const path = 'sessions/' + hash_('session:' + token), session = firestoreGet_(path);
  if (!session || session.revokedAt) return null;
  const expiresAt = asDate_(session.expiresAt), email = normalizeEmail_(session.email);
  if (!expiresAt || expiresAt.getTime() < Date.now() || !isValidEmail_(email)) return null;
  const lastSeenAt = asDate_(session.lastSeenAt);
  if (!lastSeenAt || Date.now() - lastSeenAt.getTime() > CONFIG.sessionTouchMs) { session.lastSeenAt = new Date(); firestoreSet_(path, session); }
  return {userId:String(session.userId), email:email, expiresAt:expiresAt};
}

function registerOrReadUser_(email) {
  const sheet = usersSheet_(); validateUsersHeader_(sheet);
  const values = sheet.getDataRange().getDisplayValues();
  for (let i = 1; i < values.length; i++) if (normalizeEmail_(values[i][0]) === email) return {email:email, registeredAt:values[i][1], role:normalizeRole_(values[i][2])};
  const now = new Date(); sheet.appendRow([email, now, 'user']);
  return {email:email, registeredAt:now, role:'user'};
}

function findUser_(email) {
  const users = listUsers_();
  for (let i = 0; i < users.length; i++) if (users[i].email === email) return users[i];
  return null;
}

function listUsers_() {
  const sheet = usersSheet_(); validateUsersHeader_(sheet);
  const values = sheet.getDataRange().getDisplayValues(), users = [];
  for (let i = 1; i < values.length; i++) {
    const email = normalizeEmail_(values[i][0]);
    if (email) users.push({email:email, registeredAt:String(values[i][1] || ''), role:normalizeRole_(values[i][2])});
  }
  return users;
}

function usersSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('USERS_SPREADSHEET_ID') || CONFIG.usersSpreadsheetId;
  const sheet = SpreadsheetApp.openById(id).getSheetByName(CONFIG.usersSheet);
  if (!sheet) throw new Error('Chybí list Users.');
  return sheet;
}

function validateUsersHeader_(sheet) {
  const h = sheet.getRange(1, 1, 1, 3).getDisplayValues()[0].map(normalizeHeader_);
  if (h[0] !== 'email' || h[1] !== 'datum registrace' || h[2] !== 'typ uctu') throw new Error('Neplatné záhlaví listu Users.');
}

function normalizeHeader_(value) { return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '); }
function normalizeRole_(value) { return String(value || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user'; }

function syncPoints() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('POINTS_SPREADSHEET_ID') || CONFIG.pointsSpreadsheetId;
  const token = ScriptApp.getOAuthToken();
  const sheetUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId) + '/values/' + encodeURIComponent("'GPS body'!A1:B1000");
  const values = request_('get', sheetUrl, token).values || [];
  if (!values.length || values[0][0] !== 'Poloha' || values[0][1] !== 'Popis') throw new Error('Neplatné záhlaví listu GPS body.');
  const points = new Map();
  values.slice(1).forEach(function(row) { const p = parsePoint_(row); if (p) points.set(p.id, p); });
  if (!points.size) throw new Error('Zdroj neobsahuje žádný platný bod; mazání bylo zastaveno.');
  const base = firestoreBaseUrl_() + '/points';
  points.forEach(function(p) { request_('patch', base + '/' + encodeURIComponent(p.id), token, {fields:encodeFields_({name:p.name, description:'', lat:p.lat, lng:p.lng, lonMPerDeg:111195 * Math.cos(p.lat * Math.PI / 180)})}); });
  let pageToken = '', existing = [];
  do { const page = request_('get', base + '?pageSize=500' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), token); existing = existing.concat(page.documents || []); pageToken = page.nextPageToken || ''; } while (pageToken);
  existing.forEach(function(doc) { const id = doc.name.split('/').pop(); if (!points.has(id)) request_('delete', base + '/' + encodeURIComponent(id), token); });
  console.log('Synchronizováno ' + points.size + ' míst.');
}

function syncVisitsBackup() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return 'Záloha návštěv přeskočena: právě běží jiná úloha.';
  try {
    const props = PropertiesService.getScriptProperties();
    const sheetId = props.getProperty('POINTS_SPREADSHEET_ID') || CONFIG.pointsSpreadsheetId;
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(CONFIG.visitsSheet);
    if (!sheet) throw new Error('Chybí list ' + CONFIG.visitsSheet + '.');
    validateVisitsHeader_(sheet);

    const pointsById = {};
    firestoreList_('points').forEach(function(point) {
      pointsById[String(point.__id || '')] = point;
    });
    const rows = visitsBackupRows_(firestoreCollectionGroup_('visits'), pointsById);
    const oldRows = Math.max(0, sheet.getLastRow() - 1);
    if (oldRows) sheet.getRange(2, 1, oldRows, 3).clearContent();
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, 3).setValues(rows);
      sheet.getRange(2, 3, rows.length, 1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
    }
    sheet.setFrozenRows(1);
    props.setProperty('VISITS_BACKUP_SYNCED_AT', String(Date.now()));
    return 'Záloha návštěv dokončena: ' + rows.length + ' záznamů.';
  } finally {
    lock.releaseLock();
  }
}

function visitsBackupRows_(visits, pointsById) {
  return (visits || []).filter(function(visit) {
    return Boolean(asDate_(visit.visitedAt));
  }).sort(function(a, b) {
    return asDate_(a.visitedAt).getTime() - asDate_(b.visitedAt).getTime() ||
      String(a.email || '').localeCompare(String(b.email || '')) ||
      String(a.pointId || '').localeCompare(String(b.pointId || ''));
  }).map(function(visit) {
    const pointId = String(visit.pointId || visit.__id || '');
    const point = pointsById[pointId] || {};
    return [String(visit.email || ''), String(point.name || pointId), asDate_(visit.visitedAt)];
  });
}

function validateVisitsHeader_(sheet) {
  const header = sheet.getRange(1, 1, 1, 3).getDisplayValues()[0].map(normalizeHeader_);
  if (header[0] !== 'user' || header[1] !== 'popis bodu' || header[2] !== 'datum a cas navstevy') {
    throw new Error('Neplatné záhlaví listu ' + CONFIG.visitsSheet + '.');
  }
}

function parsePoint_(row) {
  const position = String(row[0] || '').trim(), name = String(row[1] || '').trim();
  const match = position.match(/^(\d{1,2}(?:\.\d+)?)\s*([NS])\s*,\s*(\d{1,3}(?:\.\d+)?)\s*([EW])$/i);
  if (!match || !name) return null;
  const lat = Number(match[1]) * (match[2].toUpperCase() === 'S' ? -1 : 1), lng = Number(match[3]) * (match[4].toUpperCase() === 'W' ? -1 : 1);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {id:'gps-' + lat.toFixed(7) + '-' + lng.toFixed(7), name:name.slice(0, 200), lat:lat, lng:lng};
}

function installHourlyTrigger() {
  ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'syncPoints'; }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncPoints').timeBased().everyHours(1).create();
}

function installVisitsBackupTrigger() {
  ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'syncVisitsBackup';
  }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncVisitsBackup').timeBased().everyMinutes(CONFIG.visitsSyncMinutes).create();
  return 'Záloha návštěv je naplánována každých ' + CONFIG.visitsSyncMinutes + ' minut.';
}

function authorizeApplication() {
  setupAuth_(); usersSheet_(); firestoreGet_('points/nonexistent-authorization-check');
  return 'Aplikace je autorizována. Zbývající denní kvóta e-mailů: ' + MailApp.getRemainingDailyQuota();
}

function setupAuth_() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('AUTH_PEPPER')) props.setProperty('AUTH_PEPPER', generateToken_());
}

function firestoreProjectId_() { return PropertiesService.getScriptProperties().getProperty('FIRESTORE_PROJECT_ID') || CONFIG.firestoreProjectId; }
function firestoreBaseUrl_() { return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(firestoreProjectId_()) + '/databases/(default)/documents'; }
function firestorePathUrl_(path) { return firestoreBaseUrl_() + '/' + String(path).split('/').map(encodeURIComponent).join('/'); }

function firestoreGet_(path) {
  const r = firestoreRequest_('get', firestorePathUrl_(path), null, [404]);
  return r.status === 404 ? null : decodeDocument_(r.body);
}

function firestoreSet_(path, data) { firestoreRequest_('patch', firestorePathUrl_(path), {fields:encodeFields_(data)}); }

function firestoreDelete_(path) { firestoreRequest_('delete', firestorePathUrl_(path), null, [404]); }

function firestoreCreate_(collectionPath, documentId, data) {
  const r = firestoreRequest_('post', firestorePathUrl_(collectionPath) + '?documentId=' + encodeURIComponent(documentId), {fields:encodeFields_(data)}, [409]);
  return r.status === 409 ? 'ALREADY_EXISTS' : 'OK';
}

function firestoreList_(collectionPath) {
  let pageToken = '', result = [];
  do {
    const r = firestoreRequest_('get', firestorePathUrl_(collectionPath) + '?pageSize=500' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
    (r.body.documents || []).forEach(function(doc) { result.push(decodeDocument_(doc)); });
    pageToken = r.body.nextPageToken || '';
  } while (pageToken);
  return result;
}

function firestoreCollectionGroup_(collectionId) {
  const r = firestoreRequest_('post', firestoreBaseUrl_() + ':runQuery', {
    structuredQuery:{from:[{collectionId:String(collectionId), allDescendants:true}]}
  });
  return (r.body || []).filter(function(item) { return item.document; }).map(function(item) {
    return decodeDocument_(item.document);
  });
}

function firestoreRequest_(method, url, payload, allowed) {
  const options = {method:method, headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions:true};
  if (payload !== null && payload !== undefined) { options.contentType = 'application/json'; options.payload = JSON.stringify(payload); }
  const response = UrlFetchApp.fetch(url, options), status = response.getResponseCode(), text = response.getContentText();
  if ((status < 200 || status >= 300) && (allowed || []).indexOf(status) < 0) throw new Error(method + ' HTTP ' + status + ': ' + text.slice(0, 500));
  return {status:status, body:text ? JSON.parse(text) : {}};
}

function encodeFields_(data) { const fields = {}; Object.keys(data).forEach(function(k) { fields[k] = encodeValue_(data[k]); }); return fields; }
function encodeValue_(v) {
  if (v === null || v === undefined) return {nullValue:null};
  if (v instanceof Date) return {timestampValue:v.toISOString()};
  if (typeof v === 'boolean') return {booleanValue:v};
  if (typeof v === 'number') return Number.isInteger(v) ? {integerValue:String(v)} : {doubleValue:v};
  return {stringValue:String(v)};
}
function decodeDocument_(doc) { const r = {__id:String(doc.name || '').split('/').pop()}; Object.keys(doc.fields || {}).forEach(function(k) { r[k] = decodeValue_(doc.fields[k]); }); return r; }
function decodeValue_(v) {
  if (Object.prototype.hasOwnProperty.call(v, 'nullValue')) return null;
  if (Object.prototype.hasOwnProperty.call(v, 'stringValue')) return v.stringValue;
  if (Object.prototype.hasOwnProperty.call(v, 'integerValue')) return Number(v.integerValue);
  if (Object.prototype.hasOwnProperty.call(v, 'doubleValue')) return Number(v.doubleValue);
  if (Object.prototype.hasOwnProperty.call(v, 'booleanValue')) return v.booleanValue;
  if (Object.prototype.hasOwnProperty.call(v, 'timestampValue')) return new Date(v.timestampValue);
  return null;
}

function request_(method, url, token, body) {
  const options = {method:method, headers:{Authorization:'Bearer ' + token}, muteHttpExceptions:true};
  if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
  const response = UrlFetchApp.fetch(url, options), status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error(method + ' HTTP ' + status + ': ' + response.getContentText().slice(0, 500));
  const text = response.getContentText(); return text ? JSON.parse(text) : {};
}

function parseRequest_(e) { if (!e) return {}; if (e.parameter && Object.keys(e.parameter).length) return e.parameter; return JSON.parse(e.postData && e.postData.contents || '{}'); }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function normalizeEmail_(v) { return String(v || '').trim().toLowerCase(); }
function isValidEmail_(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254; }
function asDate_(v) { if (!v) return null; const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? null : d; }
function normalizeVerificationRequestId_(v) { const id = String(v || '').trim(); return /^verify_[A-Za-z0-9_-]{16,100}$/.test(id) ? id : ''; }
function verificationRequestIdHash_(email, id) { return hash_('verification-request:' + email + ':' + id); }
function verificationSessionToken_(email, id) { return hash_('verification-session:' + email + ':' + id); }
function emailDocumentId_(email) { return digestHex_(normalizeEmail_(email)); }
function hash_(v) { return digestHex_(String(v) + ':' + PropertiesService.getScriptProperties().getProperty('AUTH_PEPPER')); }
function digestHex_(v) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v, Utilities.Charset.UTF_8).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function generateToken_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }
function generateOtp_() { return String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000).padStart(6, '0'); }
function constantTimeEqual_(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length, n = Math.max(a.length, b.length); for (let i = 0; i < n; i++) d |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ (b.charCodeAt(i % (b.length || 1)) || 0); return d === 0; }
