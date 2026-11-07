import { pointMarkerStyle } from './point-style.js';

const config = window.SVATOMARTINSKE_CONFIG || {};
const API_URL = String(config.apiUrl || '').trim();
const $ = id => document.getElementById(id);
const state = {
  points: [], fix: null, map: null, markers: [], userMarker: null,
  accuracyCircle: null, watchId: null, boundsFitted: false
};

function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

function initMap() {
  state.map = L.map('map', { scrollWheelZoom: false, zoomControl: false }).setView([49.9, 15.3], 7);
  L.control.zoom({ position: 'bottomright' }).addTo(state.map);
  L.tileLayer(config.tileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }).addTo(state.map);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function renderPoints() {
  for (const marker of state.markers) marker.remove();
  state.markers = [];
  const bounds = [];

  for (const point of state.points) {
    const marker = L.circleMarker([point.lat, point.lng], pointMarkerStyle()).addTo(state.map)
      .bindPopup(`<strong>${escapeHtml(point.name)}</strong>${point.description ? `<br>${escapeHtml(point.description)}` : ''}`);
    state.markers.push(marker);
    bounds.push([point.lat, point.lng]);
  }

  if (bounds.length && !state.boundsFitted) {
    state.map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
    state.boundsFitted = true;
  }
}

function pointsUrl() {
  const url = new URL(API_URL);
  url.searchParams.set('action', 'points');
  return url;
}

async function loadPoints() {
  let lastError;
  for (const delay of [0, 700, 1600]) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    try {
      const response = await fetch(pointsUrl(), { cache: 'no-store' });
      if (!response.ok) throw new Error('SERVER_ERROR');
      const data = await response.json();
      if (data.status !== 'OK') throw new Error(data.error || 'SERVER_ERROR');
      state.points = (data.points || []).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
      renderPoints();
      if (!state.points.length) status('Zatím nejsou synchronizována žádná místa.');
      return;
    } catch (error) {
      lastError = error;
    }
  }
  console.error(lastError);
  status('Místa se nepodařilo načíst. Zkontrolujte připojení a zkuste stránku obnovit.', true);
}

function startLocation() {
  if (!navigator.geolocation) {
    $('location-info').textContent = 'Toto zařízení nepodporuje geolokaci.';
    return;
  }
  if (state.watchId != null) return;
  state.watchId = navigator.geolocation.watchPosition(position => {
    const { latitude: lat, longitude: lng, accuracy } = position.coords;
    state.fix = { lat, lng, accuracy, timestamp: position.timestamp };
    $('location-info').textContent = `Přesnost polohy přibližně ±${Math.round(accuracy)} m`;
    if (!state.userMarker) {
      state.userMarker = L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#267eb8', fillOpacity: 1 }).addTo(state.map);
      state.accuracyCircle = L.circle([lat, lng], { radius: accuracy, color: '#267eb8', weight: 1, fillOpacity: .08 }).addTo(state.map);
    } else {
      state.userMarker.setLatLng([lat, lng]);
      state.accuracyCircle.setLatLng([lat, lng]).setRadius(accuracy);
    }
  }, error => {
    $('location-info').textContent = error.code === 1 ? 'Povolte přístup k poloze v prohlížeči.' : 'Polohu se nepodařilo získat.';
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}

$('locate').addEventListener('click', () => {
  if (state.fix) state.map.setView([state.fix.lat, state.fix.lng], 17);
  else startLocation();
});

initMap();
startLocation();
if (!API_URL) {
  $('setup').hidden = false;
  status('Chybí připojení ke zdroji bodů.', true);
} else {
  loadPoints();
}
