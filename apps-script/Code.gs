// Soukromá synchronizace; nenasazovat jako webovou aplikaci.
// Script Properties: POINTS_SPREADSHEET_ID, FIRESTORE_PROJECT_ID.
function syncPoints() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('POINTS_SPREADSHEET_ID');
  const project = props.getProperty('FIRESTORE_PROJECT_ID');
  if (!sheetId || !project) throw new Error('Chybí nastavení tabulky nebo projektu.');
  const token = ScriptApp.getOAuthToken();
  const sheetUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId) +
    '/values/' + encodeURIComponent("'GPS body'!A1:B1000");
  const values = request_('get', sheetUrl, token).values || [];
  if (!values.length || values[0][0] !== 'Poloha' || values[0][1] !== 'Popis') throw new Error('Neplatné záhlaví listu GPS body.');
  const points = new Map();
  values.slice(1).forEach(row => {
    const point = parsePoint_(row);
    if (point) points.set(point.id, point);
  });
  if (!points.size) throw new Error('Zdroj neobsahuje žádný platný bod; mazání bylo zastaveno.');
  const base = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(project) + '/databases/(default)/documents/points';
  for (const point of points.values()) {
    const fields = {
      name:{stringValue:point.name}, description:{stringValue:''},
      lat:{doubleValue:point.lat}, lng:{doubleValue:point.lng},
      lonMPerDeg:{doubleValue:111195 * Math.cos(point.lat * Math.PI / 180)}
    };
    request_('patch', base + '/' + encodeURIComponent(point.id), token, {fields:fields});
  }
  let pageToken = '', existing = [];
  do {
    const url = base + '?pageSize=500' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const page = request_('get', url, token);
    existing = existing.concat(page.documents || []);
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  for (const doc of existing) {
    const id = doc.name.split('/').pop();
    if (!points.has(id)) request_('delete', base + '/' + encodeURIComponent(id), token);
  }
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
function request_(method, url, token, body) {
  const options = {method:method, headers:{Authorization:'Bearer ' + token}, muteHttpExceptions:true};
  if (body) {options.contentType='application/json'; options.payload=JSON.stringify(body);}
  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error(method + ' HTTP ' + status + ': ' + response.getContentText().slice(0, 500));
  const text = response.getContentText();
  return text ? JSON.parse(text) : {};
}
function installHourlyTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncPoints').forEach(ScriptApp.deleteTrigger);
  ScriptApp.newTrigger('syncPoints').timeBased().everyHours(1).create();
}
