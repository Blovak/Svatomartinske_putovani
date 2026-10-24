import { visitEligibility } from './geo.js';

const config = window.SVATOMARTINSKE_CONFIG || {};
const $ = id => document.getElementById(id);
const state = { token: sessionStorage.getItem('sm:session') || '', email: '', points: [], visits: new Set(), fix: null, map: null, markers: [], userMarker: null, accuracyCircle: null, watchId: null, boundsFitted: false };

function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
async function api(payload) {
  if (!config.apiUrl || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(config.apiUrl)) throw new Error('Konfigurace API chybí.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(config.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: new URLSearchParams(payload), signal: controller.signal });
    const data = await response.json();
    if (data.status !== 'OK') throw new Error(data.error || 'Požadavek se nezdařil.');
    return data;
  } finally { clearTimeout(timer); }
}
const messages = { INVALID_EMAIL:'Zadejte platný e-mail.', TOO_MANY_REQUESTS:'Zkuste to prosím později.', INVALID_CODE:'Kód není správný.', CODE_EXPIRED:'Kód vypršel.', TOO_MANY_ATTEMPTS:'Příliš mnoho pokusů.', UNAUTHORIZED:'Přihlášení vypršelo.', INACCURATE_POSITION:'GPS je zatím příliš nepřesná.', OUT_OF_RANGE:'Přibližte se k bodu.', STALE_POSITION:'Poloha je zastaralá.', ALREADY_VISITED:'Tento bod už máte potvrzený.' };
const explain = e => messages[e.message] || e.message || 'Nastala chyba.';
function showAuth() { $('auth').hidden = false; $('content').hidden = true; $('logout').hidden = true; }
function showContent() { $('auth').hidden = true; $('content').hidden = false; $('logout').hidden = false; setTimeout(() => state.map?.invalidateSize(), 0); }
async function loadData() {
  const data = await api({ action: 'bootstrap', sessionToken: state.token });
  state.email = data.email; state.points = data.points; state.visits = new Set(data.visits);
  showContent(); initMap(); render(); startLocation();
}
function initMap() {
  if (state.map) return;
  state.map = L.map('map', { scrollWheelZoom: false }).setView([49.9, 15.3], 7);
  L.tileLayer(config.tileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).addTo(state.map);
}
function render() {
  $('progress-count').textContent = `${state.visits.size} / ${state.points.length}`;
  $('point-count').textContent = `${state.points.length} míst`;
  const list = $('points'); list.replaceChildren();
  for (const marker of state.markers) marker.remove(); state.markers = [];
  const bounds = [];
  for (const point of state.points) {
    const visited = state.visits.has(point.id);
    const eligibility = visitEligibility(point, state.fix);
    const item = document.createElement('article'); item.className = 'point' + (visited ? ' visited' : '');
    const title = document.createElement('h3'); title.textContent = point.name;
    const desc = document.createElement('p'); desc.textContent = point.description || '';
    const meta = document.createElement('p'); meta.className = 'meta'; meta.textContent = visited ? '✓ Navštíveno' : eligibility.distance == null ? 'Čekám na polohu' : `${Math.round(eligibility.distance)} m od vás`;
    item.append(title, desc, meta);
    if (!visited) {
      if (eligibility.ok) {
        const button = document.createElement('button'); button.textContent = 'Potvrdit návštěvu'; button.onclick = () => confirmVisit(point, button); item.append(button);
      } else { const reason = document.createElement('p'); reason.className = 'reason'; reason.textContent = eligibility.reason; item.append(reason); }
    }
    list.append(item);
    const marker = L.marker([point.lat, point.lng]).addTo(state.map).bindPopup(`<strong>${escapeHtml(point.name)}</strong><br>${visited ? 'Navštíveno' : 'Zatím nenavštíveno'}`);
    marker.on('click', () => item.scrollIntoView({ behavior:'smooth', block:'nearest' }));
    state.markers.push(marker); bounds.push([point.lat, point.lng]);
  }
  if (bounds.length && !state.boundsFitted) { state.map.fitBounds(bounds, { padding:[32,32], maxZoom:15 }); state.boundsFitted = true; }
  if (!bounds.length) status('V tabulce zatím nejsou žádná platná aktivní místa.');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function startLocation() {
  if (!navigator.geolocation) { $('location-info').textContent = 'Toto zařízení nepodporuje geolokaci.'; return; }
  if (state.watchId != null) return;
  state.watchId = navigator.geolocation.watchPosition(position => {
    const { latitude:lat, longitude:lng, accuracy } = position.coords;
    state.fix = { lat, lng, accuracy, timestamp: position.timestamp };
    $('location-info').textContent = `Přesnost polohy přibližně ±${Math.round(accuracy)} m`;
    if (!state.userMarker) {
      state.userMarker = L.circleMarker([lat,lng], { radius:8, color:'#fff', weight:3, fillColor:'#267eb8', fillOpacity:1 }).addTo(state.map);
      state.accuracyCircle = L.circle([lat,lng], { radius:accuracy, color:'#267eb8', weight:1, fillOpacity:.08 }).addTo(state.map);
    } else { state.userMarker.setLatLng([lat,lng]); state.accuracyCircle.setLatLng([lat,lng]).setRadius(accuracy); }
    render();
  }, error => { $('location-info').textContent = error.code === 1 ? 'Povolte přístup k poloze v prohlížeči.' : 'Polohu se nepodařilo získat.'; state.fix = null; render(); }, { enableHighAccuracy:true, maximumAge:0, timeout:20000 });
}
async function confirmVisit(point, button) {
  const check = visitEligibility(point, state.fix);
  if (!check.ok) { render(); return; }
  button.disabled = true;
  try {
    await api({ action:'visit', sessionToken:state.token, pointId:point.id, lat:String(state.fix.lat), lng:String(state.fix.lng), accuracy:String(state.fix.accuracy), timestamp:String(state.fix.timestamp), requestId:crypto.randomUUID() });
    state.visits.add(point.id); status(`Návštěva místa „${point.name}“ byla potvrzena.`); render();
  } catch (error) { status(explain(error), true); button.disabled = false; }
}
$('email-form').addEventListener('submit', async event => {
  event.preventDefault(); const email = $('email').value.trim().toLowerCase(); const button = event.target.querySelector('button'); button.disabled = true;
  try { await api({ action:'requestCode', email }); state.email = email; $('email-step').hidden = true; $('code-step').hidden = false; status('Ověřovací kód byl odeslán.'); }
  catch (e) { status(explain(e), true); } finally { button.disabled = false; }
});
$('code-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
  try { const data = await api({ action:'verifyCode', email:state.email, code:$('code').value.trim() }); state.token = data.sessionToken; sessionStorage.setItem('sm:session', state.token); await loadData(); status('Přihlášení proběhlo úspěšně.'); }
  catch (e) { status(explain(e), true); } finally { button.disabled = false; }
});
$('change-email').onclick = () => { $('code-step').hidden = true; $('email-step').hidden = false; status(''); };
$('logout').onclick = async () => { const token = state.token; state.token = ''; sessionStorage.removeItem('sm:session'); if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId); state.watchId = null; showAuth(); try { await api({ action:'logout', sessionToken:token }); } catch (_) {} };
$('locate').onclick = () => { if (state.fix) state.map.setView([state.fix.lat,state.fix.lng],17); else startLocation(); };
if (!config.apiUrl) { $('setup').hidden = false; } else if (state.token) {
  loadData().catch(() => { state.token = ''; sessionStorage.removeItem('sm:session'); showAuth(); status('Relaci se nepodařilo obnovit. Přihlaste se znovu.', true); });
} else showAuth();
setInterval(() => { if (state.map && state.fix) render(); }, 3000);
