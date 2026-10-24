// Samostatný backend. Povinné Script Properties:
// POINTS_SPREADSHEET_ID, FIRESTORE_PROJECT_ID, AUTH_PEPPER.
// Firestore projekt musí být samostatný pro tuto aplikaci.
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
  const pointsId = props.getProperty('POINTS_SPREADSHEET_ID');
  const projectId = props.getProperty('FIRESTORE_PROJECT_ID');
  const pepper = props.getProperty('AUTH_PEPPER');
  if (!pointsId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId || '') || !pepper || pepper.length < 32) {
    throw new Error('Chybí POINTS_SPREADSHEET_ID, FIRESTORE_PROJECT_ID nebo silný AUTH_PEPPER.');
  }
  return { pointsId:pointsId, projectId:projectId, pepper:pepper };
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
    const id = hmac_('email:' + email);
    const previous = fsGet_('authCodes/' + id);
    if (previous && Date.now() - new Date(previous.requestedAt).getTime() < 60000) return fail_('TOO_MANY_REQUESTS');
    code = randomCode_();
    fsSet_('authCodes/' + id, {
      codeHash:hmac_('otp:' + email + ':' + code),
      expiresAt:new Date(Date.now() + OTP_TTL), attempts:0, requestedAt:new Date(), usedAt:null
    });
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
    const emailId = hmac_('email:' + email);
    const auth = fsGet_('authCodes/' + emailId);
    if (!auth || auth.usedAt) return fail_('INVALID_CODE');
    if (new Date(auth.expiresAt).getTime() < Date.now()) return fail_('CODE_EXPIRED');
    if (Number(auth.attempts) >= 5) return fail_('TOO_MANY_ATTEMPTS');
    if (!safeEqual_(auth.codeHash, hmac_('otp:' + email + ':' + code))) {
      auth.attempts = Number(auth.attempts) + 1;
      fsSet_('authCodes/' + emailId, clean_(auth));
      return fail_('INVALID_CODE');
    }
    const userId = hmac_('user:' + email);
    const user = fsGet_('users/' + userId);
    const token = randomToken_();
    const now = new Date();
    fsCommit_([
      fsWriteSet_('authCodes/' + emailId, Object.assign(clean_(auth), { usedAt:now }), { updateTime:auth.__updateTime }),
      fsWriteSet_('users/' + userId, { email:email, createdAt:user ? user.createdAt : now, lastLoginAt:now }, user ? null : { exists:false }),
      fsWriteSet_('sessions/' + hmac_('session:' + token), {
        userId:userId, email:email, expiresAt:new Date(Date.now() + SESSION_TTL), revokedAt:null
      }, { exists:false })
    ]);
    return ok_({ sessionToken:token, email:email });
  } finally { lock.releaseLock(); }
}
function session_(token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 200) return null;
  const tokenHash = hmac_('session:' + token);
  const session = fsGet_('sessions/' + tokenHash);
  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() < Date.now()) return null;
  if (!validEmail_(email_(session.email)) || !/^[a-f0-9]{64}$/.test(session.userId || '')) return null;
  return { userId:session.userId, email:email_(session.email), session:session, tokenHash:tokenHash };
}
function points_() {
  const values = sheetValues_();
  if (!values.length) return [];
  const header = values[0];
  if (header[0] !== 'Poloha' || header[1] !== 'Popis') throw new Error('Neplatné záhlaví GPS body.');
  const ids = {};
  return values.slice(1).map(v => parsePoint_(v)).filter(p => {
    if (!p || ids[p.id]) return false;
    ids[p.id] = true; return true;
  });
}
function sheetValues_() {
  const range = encodeURIComponent("'GPS body'!A1:B1000");
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' +
    encodeURIComponent(settings_().pointsId) + '/values/' + range;
  const response = UrlFetchApp.fetch(url, {
    method:'get',
    headers:{ Authorization:'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions:true
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('Sheets HTTP ' + status);
  return JSON.parse(response.getContentText()).values || [];
}
function parsePoint_(row) {
  const position = String(row[0] || '').trim();
  const name = String(row[1] || '').trim();
  const match = position.match(/^(\d{1,2}(?:\.\d+)?)\s*([NS])\s*,\s*(\d{1,3}(?:\.\d+)?)\s*([EW])$/i);
  if (!match || !name) return null;
  const lat = Number(match[1]) * (match[2].toUpperCase() === 'S' ? -1 : 1);
  const lng = Number(match[3]) * (match[4].toUpperCase() === 'W' ? -1 : 1);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const id = 'gps-' + lat.toFixed(7) + '-' + lng.toFixed(7);
  return { id:id, name:name, description:'', lat:lat, lng:lng };
}
function bootstrap_(p) {
  const user = session_(p.sessionToken); if (!user) return fail_('UNAUTHORIZED');
  const visits = fsList_('users/' + user.userId + '/visits').map(v => v.pointId);
  return ok_({ email:user.email, points:points_(), visits:visits });
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
  const path = 'users/' + user.userId + '/visits/' + hmac_('visit:' + point.id);
  if (fsGet_(path)) return fail_('ALREADY_VISITED');
  try {
    fsCommit_([fsWriteSet_(path, {
      pointId:point.id, visitedAt:new Date(), distanceM:Math.round(distance*10)/10,
      accuracyM:accuracy, requestId:requestId
    }, { exists:false })]);
    return ok_();
  } catch (error) {
    if (error.status === 409 || error.status === 412) return fail_('ALREADY_VISITED');
    throw error;
  }
}
function logout_(p) {
  const user = session_(p.sessionToken); if (!user) return ok_();
  fsSet_('sessions/' + user.tokenHash, Object.assign(clean_(user.session), { revokedAt:new Date() }));
  return ok_();
}

function fsBase_() {
  return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(settings_().projectId) +
    '/databases/(default)/documents';
}
function fsRequest_(method, url, payload, allowMissing) {
  const options = {
    method:method,
    headers:{ Authorization:'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions:true
  };
  if (payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();
  if (allowMissing && status === 404) return null;
  if (status < 200 || status >= 300) {
    const error = new Error('Firestore HTTP ' + status + ': ' + response.getContentText().slice(0, 500));
    error.status = status; throw error;
  }
  const text = response.getContentText();
  return text ? JSON.parse(text) : {};
}
function fsGet_(path) {
  const doc = fsRequest_('get', fsBase_() + '/' + path, undefined, true);
  return doc ? fsDecodeDoc_(doc) : null;
}
function fsSet_(path, data) { fsRequest_('patch', fsBase_() + '/' + path, { fields:fsFields_(data) }); }
function fsList_(path) {
  const all = []; let pageToken = '';
  do {
    let url = fsBase_() + '/' + path + '?pageSize=500';
    if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
    const result = fsRequest_('get', url);
    (result.documents || []).forEach(doc => all.push(fsDecodeDoc_(doc)));
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return all;
}
function fsCommit_(writes) { fsRequest_('post', fsBase_() + ':commit', { writes:writes }); }
function fsWriteSet_(path, data, precondition) {
  const write = {
    update:{
      name:fsBase_().replace('https://firestore.googleapis.com/v1/', '') + '/' + path,
      fields:fsFields_(data)
    }
  };
  if (precondition) write.currentDocument = precondition;
  return write;
}
function fsFields_(data) {
  const fields = {};
  Object.keys(data).forEach(key => { fields[key] = fsValue_(data[key]); });
  return fields;
}
function fsValue_(value) {
  if (value === null || value === undefined) return { nullValue:null };
  if (value instanceof Date) return { timestampValue:value.toISOString() };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue:String(value) } : { doubleValue:value };
  if (typeof value === 'boolean') return { booleanValue:value };
  return { stringValue:String(value) };
}
function fsDecodeDoc_(doc) {
  const data = {};
  Object.keys(doc.fields || {}).forEach(key => {
    const value = doc.fields[key];
    if ('stringValue' in value) data[key] = value.stringValue;
    else if ('timestampValue' in value) data[key] = value.timestampValue;
    else if ('integerValue' in value) data[key] = Number(value.integerValue);
    else if ('doubleValue' in value) data[key] = Number(value.doubleValue);
    else if ('booleanValue' in value) data[key] = value.booleanValue;
    else data[key] = null;
  });
  data.__updateTime = doc.updateTime;
  return data;
}
function clean_(data) {
  const copy = Object.assign({}, data);
  delete copy.__updateTime;
  return copy;
}
