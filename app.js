import { visitEligibility } from './geo.js';
import { pointMarkerStyle } from './point-style.js';

const config = window.SVATOMARTINSKE_CONFIG || {};
const API_URL = String(config.apiUrl || '').trim();
const SESSION_KEY = 'sm:sessionToken';
const EMAIL_KEY = 'sm:email';
const $ = id => document.getElementById(id);
const state = {
  sessionToken:localStorage.getItem(SESSION_KEY) || '', email:localStorage.getItem(EMAIL_KEY) || '',
  role:'', points:[], visits:new Set(), fix:null, map:null, markers:[], userMarker:null,
  accuracyCircle:null, watchId:null, boundsFitted:false, verificationRequestId:'', verificationRequestKey:'',
  locationHeartbeatId:null, locationPublishAttemptAt:0, locationPublishPending:false,
  adminLive:false, participantMarkers:[], participantRefreshId:null, participantBoundsFitted:false
};

function status(message, error=false) { $('status').textContent=message; $('status').classList.toggle('error',error); }
function explain(code) {
  return ({
    INVALID_EMAIL:'Zadejte platný e-mail.', TOO_MANY_REQUESTS:'Nový kód lze poslat nejdříve za jednu minutu.',
    INVALID_CODE:'Ověřovací kód není správný.', CODE_EXPIRED:'Platnost kódu vypršela. Pošlete si nový kód.',
    TOO_MANY_ATTEMPTS:'Kód byl zadán příliš mnohokrát. Pošlete si nový kód.',
    EMAIL_QUOTA_EXCEEDED:'Dnes již nelze odeslat další ověřovací e-mail. Zkuste to zítra.',
    UNAUTHORIZED:'Přihlášení vypršelo. Ověřte prosím e-mail znovu.', FORBIDDEN:'Nemáte administrátorské oprávnění.',
    INVALID_POINT:'Toto místo není platné.', INVALID_VISIT:'Údaje o poloze nejsou platné.',
    LOCATION_NOT_ELIGIBLE:'Návštěvu nelze potvrdit: potřebujete novou a přesnější polohu blíže k místu.',
    ALREADY_EXISTS:'Toto místo už máte potvrzené.', SERVER_ERROR:'Na serveru nastala chyba. Zkuste to později.'
  })[code] || 'Operaci se nepodařilo dokončit. Zkontrolujte připojení a zkuste to znovu.';
}

function showAuth(step='email') {
  $('auth').hidden=false; $('content').hidden=true; $('logout').hidden=true; $('identity').hidden=true;
  $('email-step').hidden=step !== 'email'; $('code-step').hidden=step !== 'code';
}

function showContent() {
  $('auth').hidden=true; $('content').hidden=false; $('logout').hidden=false; $('identity').hidden=false;
  $('identity').textContent=(state.role === 'admin' ? 'Administrátor · ' : '') + state.email;
  $('admin-actions').hidden=state.role !== 'admin';
  setTimeout(()=>state.map?.invalidateSize(),0);
}

async function loadData() {
  const data = await apiPostWithRetry({action:'data', sessionToken:state.sessionToken});
  if(data.status !== 'OK') throw new Error(data.error || 'SERVER_ERROR');
  state.email=data.email || state.email; state.role=data.role || 'user';
  state.points=(data.points || []).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
  state.visits=new Set(data.visits || []); state.boundsFitted=false;
  localStorage.setItem(EMAIL_KEY,state.email); showContent(); initMap(); render(); startLocation();
}

function initMap() {
  if(state.map)return;
  state.map=L.map('map',{scrollWheelZoom:false}).setView([49.9,15.3],7);
  L.tileLayer(config.tileUrl||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(state.map);
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function render() {
  $('progress-count').textContent=`${state.visits.size} / ${state.points.length}`;
  $('point-count').textContent=`${state.points.length} míst`;
  const list=$('points'); list.replaceChildren();
  for(const marker of state.markers)marker.remove(); state.markers=[];
  const bounds=[];
  for(const point of state.points) {
    const visited=state.visits.has(point.id), eligibility=visitEligibility(point,state.fix);
    const item=document.createElement('article'); item.className='point'+(visited?' visited':'');
    const title=document.createElement('h3'); title.textContent=point.name;
    const desc=document.createElement('p'); desc.textContent=point.description||'';
    const meta=document.createElement('p'); meta.className='meta'; meta.textContent=visited?'✓ Navštíveno':eligibility.distance==null?'Čekám na polohu':`${Math.round(eligibility.distance)} m od vás`;
    item.append(title,desc,meta);
    if(!visited) {
      if(eligibility.ok) { const button=document.createElement('button'); button.textContent='Potvrdit návštěvu'; button.onclick=()=>confirmVisit(point,button); item.append(button); }
      else { const reason=document.createElement('p'); reason.className='reason'; reason.textContent=eligibility.reason; item.append(reason); }
    }
    list.append(item);
    const marker=L.circleMarker([point.lat,point.lng],pointMarkerStyle(visited)).addTo(state.map).bindPopup(`<strong>${escapeHtml(point.name)}</strong><br>${visited?'✓ Navštíveno':'Zatím nenavštíveno'}`);
    marker.on('click',()=>item.scrollIntoView({behavior:'smooth',block:'nearest'}));
    state.markers.push(marker); bounds.push([point.lat,point.lng]);
  }
  if(bounds.length&&!state.boundsFitted){state.map.fitBounds(bounds,{padding:[32,32],maxZoom:15});state.boundsFitted=true;}
  if(!bounds.length)status('Zatím nejsou synchronizována žádná místa.');
}

function startLocation() {
  if(!navigator.geolocation){$('location-info').textContent='Toto zařízení nepodporuje geolokaci.';return;}
  startLocationHeartbeat();
  if(state.watchId!=null)return;
  state.watchId=navigator.geolocation.watchPosition(position=>{
    const {latitude:lat,longitude:lng,accuracy}=position.coords;
    state.fix={lat,lng,accuracy,timestamp:position.timestamp};
    $('location-info').textContent=`Přesnost polohy přibližně ±${Math.round(accuracy)} m`;
    if(!state.userMarker){
      state.userMarker=L.circleMarker([lat,lng],{radius:8,color:'#fff',weight:3,fillColor:'#267eb8',fillOpacity:1}).addTo(state.map);
      state.accuracyCircle=L.circle([lat,lng],{radius:accuracy,color:'#267eb8',weight:1,fillOpacity:.08}).addTo(state.map);
    } else { state.userMarker.setLatLng([lat,lng]); state.accuracyCircle.setLatLng([lat,lng]).setRadius(accuracy); }
    publishCurrentLocation();
    render();
  },error=>{$('location-info').textContent=error.code===1?'Povolte přístup k poloze v prohlížeči.':'Polohu se nepodařilo získat.';state.fix=null;render();},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
}

async function publishCurrentLocation() {
  const fix=state.fix, now=Date.now();
  if(!state.sessionToken||!fix||document.hidden||state.locationPublishPending)return;
  if(now-fix.timestamp>30000||now-state.locationPublishAttemptAt<12000)return;
  state.locationPublishAttemptAt=now; state.locationPublishPending=true;
  try {
    const data=await apiPost({action:'locationUpdate',sessionToken:state.sessionToken,measuredAt:String(fix.timestamp),lat:String(fix.lat),lng:String(fix.lng),accuracyM:String(fix.accuracy)});
    if(data.status==='ERROR'&&data.error==='UNAUTHORIZED')clearSession();
  } catch(_) {
    // Sdílení aktuální polohy nesmí blokovat hlavní funkce aplikace.
  } finally { state.locationPublishPending=false; }
}

function startLocationHeartbeat() {
  if(state.locationHeartbeatId!=null)return;
  state.locationHeartbeatId=setInterval(publishCurrentLocation,15000);
}

async function confirmVisit(point,button) {
  const fix=state.fix;
  if(!visitEligibility(point,fix).ok||!state.sessionToken){render();return;}
  button.disabled=true;
  try {
    const data=await apiPostWithRetry({action:'visit',sessionToken:state.sessionToken,pointId:point.id,measuredAt:String(fix.timestamp),lat:String(fix.lat),lng:String(fix.lng),accuracyM:String(fix.accuracy)});
    if(data.status!=='OK')throw new Error(data.error||'SERVER_ERROR');
    state.visits.add(point.id);status(`Návštěva místa „${point.name}“ byla potvrzena.`);render();
  } catch(error) {
    if(error.message==='UNAUTHORIZED') clearSession();
    status(explain(error.message),true); button.disabled=false;
  }
}

$('email-form').addEventListener('submit',async event=>{
  event.preventDefault(); state.email=$('email').value.trim().toLowerCase();
  const button=event.target.querySelector('button'); button.disabled=true; status('');
  try {
    const data=await apiPost({action:'requestCode',email:state.email});
    if(data.status!=='OK')throw new Error(data.error||'SERVER_ERROR');
    localStorage.setItem(EMAIL_KEY,state.email); $('pending-email').textContent=state.email; showAuth('code'); $('verification-code').focus();
    status('Ověřovací kód byl odeslán.');
  }catch(error){status(explain(error.message),true);}finally{button.disabled=false;}
});

$('code-form').addEventListener('submit',async event=>{
  event.preventDefault(); const code=$('verification-code').value.replace(/\s/g,'');
  const button=event.target.querySelector('button'); button.disabled=true; status('');
  const key=state.email+':'+code;
  if(!state.verificationRequestId||state.verificationRequestKey!==key){state.verificationRequestId=createRequestId('verify');state.verificationRequestKey=key;}
  try {
    const data=await apiPostWithRetry({action:'verifyCode',email:state.email,verificationCode:code,requestId:state.verificationRequestId});
    if(data.status!=='OK')throw new Error(data.error||'SERVER_ERROR');
    state.sessionToken=data.sessionToken; state.email=data.email; state.role=data.role||'user';
    localStorage.setItem(SESSION_KEY,state.sessionToken); localStorage.setItem(EMAIL_KEY,state.email);
    state.verificationRequestId=''; state.verificationRequestKey=''; status('E-mail byl ověřen.'); await loadData();
  }catch(error){status(explain(error.message),true);}finally{button.disabled=false;}
});

$('resend').onclick=()=>{$('email-form').requestSubmit();};
$('change-email').onclick=()=>{showAuth('email');status('');};
$('logout').onclick=async()=>{try{await apiPost({action:'logout',sessionToken:state.sessionToken});}catch(_){}clearSession();status('Byli jste odhlášeni.');};
$('locate').onclick=()=>{if(state.fix)state.map.setView([state.fix.lat,state.fix.lng],17);else startLocation();};
$('admin-live').onclick=()=>{if(state.adminLive)exitAdminLive();else enterAdminLive();};

async function enterAdminLive() {
  if(state.role!=='admin')return;
  state.adminLive=true; state.participantBoundsFitted=false;
  $('admin-live').textContent='Zpět na zastavení';
  $('map-title').textContent='Aktivní účastníci';
  $('points-panel').hidden=true; $('participants-panel').hidden=false; $('participant-legend').hidden=false;
  await loadActiveParticipants();
  if(state.adminLive&&state.participantRefreshId==null)state.participantRefreshId=setInterval(loadActiveParticipants,15000);
}

function exitAdminLive() {
  state.adminLive=false;
  if(state.participantRefreshId!=null)clearInterval(state.participantRefreshId);
  state.participantRefreshId=null; clearParticipantMarkers();
  $('admin-live').textContent='Zobrazit aktivní účastníky';
  $('map-title').textContent='Mapa zastavení';
  $('points-panel').hidden=false; $('participants-panel').hidden=true; $('participant-legend').hidden=true;
}

async function loadActiveParticipants() {
  if(!state.adminLive||state.role!=='admin')return;
  try {
    const data=await apiPostWithRetry({action:'adminActiveLocations',sessionToken:state.sessionToken});
    if(data.status!=='OK')throw new Error(data.error||'SERVER_ERROR');
    renderActiveParticipants(data.locations||[]);
  } catch(error) {
    if(error.message==='UNAUTHORIZED')clearSession();
    else if(error.message==='FORBIDDEN'){state.role='user';exitAdminLive();$('admin-actions').hidden=true;}
    status(explain(error.message),true);
  }
}

function clearParticipantMarkers() {
  for(const layer of state.participantMarkers)layer.remove();
  state.participantMarkers=[];
}

function renderActiveParticipants(locations) {
  clearParticipantMarkers();
  const list=$('participants'); list.replaceChildren();
  $('participant-count').textContent=String(locations.length);
  const bounds=[];
  for(const participant of locations) {
    const updated=new Date(participant.updatedAt), ageSeconds=Math.max(0,Math.round((Date.now()-updated.getTime())/1000));
    const row=document.createElement('article'); row.className='participant-row';
    const title=document.createElement('h3'); title.textContent=participant.email||'Účastník';
    const meta=document.createElement('p'); meta.textContent=`Aktualizováno před ${ageSeconds} s · přesnost ±${Math.round(participant.accuracyM||0)} m`;
    const button=document.createElement('button'); button.className='secondary'; button.type='button'; button.textContent='Ukázat na mapě';
    button.onclick=()=>state.map.setView([participant.lat,participant.lng],17);
    row.append(title,meta,button); list.append(row);
    const accuracy=L.circle([participant.lat,participant.lng],{radius:Math.max(1,Number(participant.accuracyM)||0),color:'#6a3da8',weight:1,fillColor:'#8b5fc7',fillOpacity:.08}).addTo(state.map);
    const marker=L.circleMarker([participant.lat,participant.lng],{radius:9,color:'#fff',weight:3,fillColor:'#6a3da8',fillOpacity:1}).addTo(state.map)
      .bindPopup(`<strong>${escapeHtml(participant.email||'Účastník')}</strong><br>Aktualizováno před ${ageSeconds} s`);
    state.participantMarkers.push(accuracy,marker); bounds.push([participant.lat,participant.lng]);
  }
  if(!locations.length){const empty=document.createElement('p');empty.className='participant-note';empty.textContent='Momentálně není aktivní žádný účastník.';list.append(empty);}
  if(bounds.length&&!state.participantBoundsFitted){state.map.fitBounds(bounds,{padding:[40,40],maxZoom:16});state.participantBoundsFitted=true;}
}

function clearSession() {
  state.sessionToken='';state.role='';localStorage.removeItem(SESSION_KEY);
  if(state.watchId!=null)navigator.geolocation.clearWatch(state.watchId);
  if(state.locationHeartbeatId!=null)clearInterval(state.locationHeartbeatId);
  state.locationHeartbeatId=null;state.watchId=null;state.fix=null;exitAdminLive();$('admin-actions').hidden=true;showAuth('email');
}

async function restoreSession() {
  try {
    const data=await apiPostWithRetry({action:'session',sessionToken:state.sessionToken});
    if(data.status!=='OK')throw new Error(data.error||'SERVER_ERROR');
    state.email=data.email;state.role=data.role||'user';await loadData();
  } catch(error) {
    if(error.message==='UNAUTHORIZED'){clearSession();status(explain('UNAUTHORIZED'),true);}
    else {showAuth('email');status(explain(error.message),true);}
  }
}

async function apiPost(data) {
  const response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams(data)});
  if(!response.ok)throw new Error('SERVER_ERROR');
  try{return await response.json();}catch(_){throw new Error('SERVER_ERROR');}
}

async function apiPostWithRetry(data) {
  let lastError;
  for(const wait of [0,700,1600]) {
    if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
    try{return await apiPost(data);}catch(error){lastError=error;}
  }
  throw lastError;
}

function createRequestId(prefix) {
  if(window.crypto&&typeof window.crypto.randomUUID==='function')return prefix+'_'+window.crypto.randomUUID();
  const random=Math.random().toString(36).slice(2);return prefix+'_'+Date.now().toString(36)+'_'+random+random;
}

if(state.email)$('email').value=state.email;
if(!API_URL){$('setup').hidden=false;showAuth('email');}
else if(state.sessionToken)restoreSession();
else showAuth('email');
document.addEventListener('visibilitychange',()=>{if(!document.hidden)publishCurrentLocation();});
setInterval(()=>{if(state.map&&state.fix)render();},3000);
