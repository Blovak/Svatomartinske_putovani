// Samostatný backend. Povinné Script Properties: SPREADSHEET_ID, AUTH_PEPPER.
const HEADERS = {
  Points: ['Id', 'Name', 'Description', 'Latitude', 'Longitude', 'Active'],
  Users: ['UserId', 'Email', 'CreatedAt', 'LastLoginAt'],
  AuthCodes: ['EmailHash', 'CodeHash', 'ExpiresAt', 'Attempts', 'RequestedAt', 'UsedAt'],
  Sessions: ['TokenHash', 'UserId', 'Email', 'ExpiresAt', 'RevokedAt'],
  Visits: ['UserId', 'PointId', 'VisitedAt', 'DistanceM', 'AccuracyM', 'RequestId']
};
const OTP_TTL = 10 * 60 * 1000;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const RADIUS_M = 20;

function doGet() { return reply_({ status: 'OK', name: 'Svatomartinske putovani' }); }
function doPost(e) {
  try {
    const p = e && e.parameter || {};
    switch (p.action) {
      case 'requestCode': return reply_(requestCode_(p));
      case 'verifyCode': return reply_(verifyCode_(p));
      case 'bootstrap': return reply_(bootstrap_(p));
      case 'visit': return reply_(visit_(p));
      case 'logout': return reply_(logout_(p));
      default: return reply_({ status:'ERROR', error:'UNKNOWN_ACTION' });
    }
  } catch (error) {
    console.error(String(error && error.stack || error));
    return reply_({ status:'ERROR', error:'SERVER_ERROR' });
  }
}
function reply_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function ok_(more) { return Object.assign({ status:'OK' }, more || {}); }
function fail_(error) { return { status:'ERROR', error:error }; }
function settings_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  const pepper = props.getProperty('AUTH_PEPPER');
  if (!id || !pepper || pepper.length < 32) throw new Error('Chybí SPREADSHEET_ID nebo silný AUTH_PEPPER.');
  return { id:id, pepper:pepper };
}
function book_() { return SpreadsheetApp.openById(settings_().id); }
function sheet_(name) {
  const book = book_();
  const sheet = book.getSheetByName(name) || book.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS[name]);
  return sheet;
}
function rows_(name) {
  const sheet = sheet_(name);
  const values = sheet.getDataRange().getValues();
  return { sheet:sheet, rows:values.slice(1).map((values, index) => ({ number:index + 2, values:values })) };
}
function hmac_(value) {
  const bytes = Utilities.computeHmacSha256Signature(String(value), settings_().pepper);
  return bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function safeEqual_(a,b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function email_(value) { return String(value || '').trim().toLowerCase(); }
function validEmail_(value) { return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function randomToken_() { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + Date.now())).replace(/=+$/, ''); }
function randomCode_() {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + Date.now());
  const value = (((bytes[0] & 255) * 16777216) + ((bytes[1] & 255) << 16) + ((bytes[2] & 255) << 8) + (bytes[3] & 255)) >>> 0;
  return String(value % 1000000).padStart(6, '0');
}
function findBy_(rows, index, value) { return rows.find(row => String(row.values[index]) === String(value)); }
function requestCode_(p) {
  const email = email_(p.email);
  if (!validEmail_(email)) return fail_('INVALID_EMAIL');
  if (MailApp.getRemainingDailyQuota() < 1) return fail_('EMAIL_QUOTA_EXCEEDED');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  let code;
  try {
    const cache = CacheService.getScriptCache();
    const bucket = 'otp-global:' + Math.floor(Date.now() / 60000);
    const count = Number(cache.get(bucket) || 0);
    if (count >= 20) return fail_('TOO_MANY_REQUESTS');
    const data = rows_('AuthCodes');
    const id = hmac_('email:' + email);
    const row = findBy_(data.rows, 0, id);
    if (row && Date.now() - new Date(row.values[4]).getTime() < 60000) return fail_('TOO_MANY_REQUESTS');
    code = randomCode_();
    const values = [id, hmac_('otp:' + email + ':' + code), new Date(Date.now() + OTP_TTL), 0, new Date(), ''];
    if (row) data.sheet.getRange(row.number, 1, 1, values.length).setValues([values]);
    else data.sheet.appendRow(values);
    cache.put(bucket, String(count + 1), 120);
  } finally { lock.releaseLock(); }
  MailApp.sendEmail({ to:email, subject:'Ověřovací kód – Svatomartinské putování', body:'Váš kód je: ' + code + '\nPlatí 10 minut. Pokud jste o něj nežádali, zprávu ignorujte.' });
  return ok_();
}
function verifyCode_(p) {
  const email = email_(p.email), code = String(p.code || '').trim();
  if (!validEmail_(email) || !/^\d{6}$/.test(code)) return fail_('INVALID_CODE');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const auth = rows_('AuthCodes');
    const row = findBy_(auth.rows, 0, hmac_('email:' + email));
    if (!row || row.values[5]) return fail_('INVALID_CODE');
    if (new Date(row.values[2]).getTime() < Date.now()) return fail_('CODE_EXPIRED');
    if (Number(row.values[3]) >= 5) return fail_('TOO_MANY_ATTEMPTS');
    if (!safeEqual_(row.values[1], hmac_('otp:' + email + ':' + code))) {
      auth.sheet.getRange(row.number, 4).setValue(Number(row.values[3]) + 1);
      return fail_('INVALID_CODE');
    }
    auth.sheet.getRange(row.number, 6).setValue(new Date());
    const users = rows_('Users');
    let user = findBy_(users.rows, 1, email);
    let userId;
    if (user) { userId = String(user.values[0]); users.sheet.getRange(user.number, 4).setValue(new Date()); }
    else { userId = Utilities.getUuid(); users.sheet.appendRow([userId, email, new Date(), new Date()]); }
    const token = randomToken_();
    sheet_('Sessions').appendRow([hmac_('session:' + token), userId, email, new Date(Date.now() + SESSION_TTL), '']);
    return ok_({ sessionToken:token, email:email });
  } finally { lock.releaseLock(); }
}
function session_(token) {
  if (!token || String(token).length > 300) return null;
  const data = rows_('Sessions');
  const row = findBy_(data.rows, 0, hmac_('session:' + token));
  if (!row || row.values[4] || new Date(row.values[3]).getTime() < Date.now()) return null;
  return { userId:String(row.values[1]), email:String(row.values[2]), row:row, sheet:data.sheet };
}
function points_() {
  const values = rows_('Points').rows;
  const ids = {};
  return values.map(row => {
    const v = row.values, lat = Number(String(v[3]).replace(',', '.')), lng = Number(String(v[4]).replace(',', '.'));
    return { id:String(v[0]).trim(), name:String(v[1]).trim(), description:String(v[2] || '').trim(), lat:lat, lng:lng, active:String(v[5]).toLowerCase() };
  }).filter(p => {
    if (!p.id || ids[p.id] || !p.name || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return false;
    ids[p.id] = true; return p.active === 'true' || p.active === 'ano' || p.active === '1';
  }).map(p => ({ id:p.id, name:p.name, description:p.description, lat:p.lat, lng:p.lng }));
}
function bootstrap_(p) {
  const user = session_(p.sessionToken); if (!user) return fail_('UNAUTHORIZED');
  const visits = rows_('Visits').rows.filter(r => String(r.values[0]) === user.userId).map(r => String(r.values[1]));
  return ok_({ email:user.email, points:points_(), visits:Array.from(new Set(visits)) });
}
function distance_(a,b) {
  const rad = Math.PI / 180, lat1 = a.lat * rad, lat2 = b.lat * rad;
  const dlat = (b.lat - a.lat) * rad, dlng = (b.lng - a.lng) * rad;
  const h = Math.sin(dlat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlng/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
function visit_(p) {
  const user = session_(p.sessionToken); if (!user) return fail_('UNAUTHORIZED');
  const point = points_().find(v => v.id === String(p.pointId || ''));
  if (!point) return fail_('INVALID_POINT');
  const fix = { lat:Number(p.lat), lng:Number(p.lng) }, accuracy = Number(p.accuracy), timestamp = Number(p.timestamp);
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || Math.abs(fix.lat)>90 || Math.abs(fix.lng)>180 ||
      !Number.isFinite(accuracy) || accuracy < 0 || accuracy > RADIUS_M) return fail_('INACCURATE_POSITION');
  if (!Number.isFinite(timestamp) || timestamp > Date.now()+2000 || Date.now()-timestamp > 30000) return fail_('STALE_POSITION');
  const distance = distance_(point, fix);
  if (distance + accuracy > RADIUS_M) return fail_('OUT_OF_RANGE');
  const requestId = String(p.requestId || '');
  if (!/^[a-f0-9-]{36}$/.test(requestId)) return fail_('INVALID_REQUEST');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const visits = rows_('Visits');
    if (visits.rows.some(r => String(r.values[0]) === user.userId && String(r.values[1]) === point.id)) return fail_('ALREADY_VISITED');
    visits.sheet.appendRow([user.userId, point.id, new Date(), Math.round(distance*10)/10, accuracy, requestId]);
    return ok_();
  } finally { lock.releaseLock(); }
}
function logout_(p) {
  const user = session_(p.sessionToken); if (!user) return ok_();
  user.sheet.getRange(user.row.number, 5).setValue(new Date());
  return ok_();
}
