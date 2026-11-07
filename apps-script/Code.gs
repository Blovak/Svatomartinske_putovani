const CONFIG = Object.freeze({
  pointsSpreadsheetId: '1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I',
  firestoreProjectId: 'svatomartinske-putovani'
});

function doGet(e) {
  const action = String(e && e.parameter && e.parameter.action || 'ping');
  try {
    if (action === 'ping') return json_({status:'OK', version:'map-1.0'});
    if (action === 'points') return pointsResponse_();
    return json_({status:'ERROR', error:'UNKNOWN_ACTION'});
  } catch (err) {
    console.error(err && err.stack || err);
    return json_({status:'ERROR', error:'SERVER_ERROR'});
  }
}

function pointsResponse_() {
  const points = firestoreList_('points').map(function(point) {
    return {
      id:String(point.__id || ''),
      name:String(point.name || ''),
      description:String(point.description || ''),
      lat:Number(point.lat),
      lng:Number(point.lng)
    };
  }).filter(function(point) {
    return point.id && point.name && isFinite(point.lat) && isFinite(point.lng);
  });
  return json_({status:'OK', points:points});
}

function syncPoints() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('POINTS_SPREADSHEET_ID') || CONFIG.pointsSpreadsheetId;
  const token = ScriptApp.getOAuthToken();
  const sheetUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId) + '/values/' + encodeURIComponent("'GPS body'!A1:B1000");
  const values = request_('get', sheetUrl, token).values || [];
  if (!values.length || values[0][0] !== 'Poloha' || values[0][1] !== 'Popis') throw new Error('Neplatné záhlaví listu GPS body.');

  const points = new Map();
  values.slice(1).forEach(function(row) {
    const point = parsePoint_(row);
    if (point) points.set(point.id, point);
  });
  if (!points.size) throw new Error('Zdroj neobsahuje žádný platný bod; mazání bylo zastaveno.');

  const base = firestoreBaseUrl_() + '/points';
  points.forEach(function(point) {
    request_('patch', base + '/' + encodeURIComponent(point.id), token, {
      fields:encodeFields_({name:point.name, description:'', lat:point.lat, lng:point.lng})
    });
  });

  let pageToken = '';
  let existing = [];
  do {
    const page = request_('get', base + '?pageSize=500' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), token);
    existing = existing.concat(page.documents || []);
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  existing.forEach(function(document) {
    const id = document.name.split('/').pop();
    if (!points.has(id)) request_('delete', base + '/' + encodeURIComponent(id), token);
  });
  console.log('Synchronizováno ' + points.size + ' míst.');
}

function parsePoint_(row) {
  const position = String(row[0] || '').trim();
  const name = String(row[1] || '').trim();
  const match = position.match(/^(\d{1,2}(?:\.\d+)?)\s*([NS])\s*,\s*(\d{1,3}(?:\.\d+)?)\s*([EW])$/i);
  if (!match || !name) return null;
  const lat = Number(match[1]) * (match[2].toUpperCase() === 'S' ? -1 : 1);
  const lng = Number(match[3]) * (match[4].toUpperCase() === 'W' ? -1 : 1);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {id:'gps-' + lat.toFixed(7) + '-' + lng.toFixed(7), name:name.slice(0, 200), lat:lat, lng:lng};
}

function installHourlyTrigger() {
  ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === 'syncPoints';
  }).forEach(function(trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncPoints').timeBased().everyHours(1).create();
  return 'Synchronizace bodů je naplánována každou hodinu.';
}

function authorizeApplication() {
  firestoreList_('points');
  return 'Aplikace je autorizována.';
}

function firestoreProjectId_() {
  return PropertiesService.getScriptProperties().getProperty('FIRESTORE_PROJECT_ID') || CONFIG.firestoreProjectId;
}

function firestoreBaseUrl_() {
  return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(firestoreProjectId_()) + '/databases/(default)/documents';
}

function firestorePathUrl_(path) {
  return firestoreBaseUrl_() + '/' + String(path).split('/').map(encodeURIComponent).join('/');
}

function firestoreList_(collectionPath) {
  let pageToken = '';
  const result = [];
  do {
    const response = firestoreRequest_('get', firestorePathUrl_(collectionPath) + '?pageSize=500' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
    (response.body.documents || []).forEach(function(document) {
      result.push(decodeDocument_(document));
    });
    pageToken = response.body.nextPageToken || '';
  } while (pageToken);
  return result;
}

function firestoreRequest_(method, url, payload) {
  const options = {method:method, headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions:true};
  if (payload !== null && payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) throw new Error(method + ' HTTP ' + status + ': ' + text.slice(0, 500));
  return {status:status, body:text ? JSON.parse(text) : {}};
}

function encodeFields_(data) {
  const fields = {};
  Object.keys(data).forEach(function(key) { fields[key] = encodeValue_(data[key]); });
  return fields;
}

function encodeValue_(value) {
  if (value === null || value === undefined) return {nullValue:null};
  if (typeof value === 'number') return Number.isInteger(value) ? {integerValue:String(value)} : {doubleValue:value};
  return {stringValue:String(value)};
}

function decodeDocument_(document) {
  const result = {__id:String(document.name || '').split('/').pop()};
  Object.keys(document.fields || {}).forEach(function(key) {
    result[key] = decodeValue_(document.fields[key]);
  });
  return result;
}

function decodeValue_(value) {
  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
  return null;
}

function request_(method, url, token, body) {
  const options = {method:method, headers:{Authorization:'Bearer ' + token}, muteHttpExceptions:true};
  if (body) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error(method + ' HTTP ' + status + ': ' + response.getContentText().slice(0, 500));
  const text = response.getContentText();
  return text ? JSON.parse(text) : {};
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
