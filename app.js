import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, collection, doc, getDocs, setDoc, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { visitEligibility } from './geo.js';

const config = window.SVATOMARTINSKE_CONFIG || {};
const $ = id => document.getElementById(id);
const app = config.firebase?.projectId ? initializeApp(config.firebase) : null;
const auth = app ? getAuth(app) : null, db = app ? getFirestore(app) : null;
const state = { user:null, points:[], visits:new Set(), fix:null, map:null, markers:[], userMarker:null, accuracyCircle:null, watchId:null, boundsFitted:false };
function status(message, error=false) { $('status').textContent=message; $('status').classList.toggle('error',error); }
function explain(e) { return ({'auth/invalid-email':'Zadejte platný e-mail.','auth/too-many-requests':'Příliš mnoho pokusů. Zkuste to později.','auth/invalid-action-code':'Přihlašovací odkaz vypršel nebo byl použit.','permission-denied':'Zápis nebyl povolen. Získejte novou přesnou polohu.','already-exists':'Toto místo už máte potvrzené.'})[e.code] || e.message || 'Nastala chyba.'; }
function showAuth() { $('auth').hidden=false; $('content').hidden=true; $('logout').hidden=true; }
function showContent() { $('auth').hidden=true; $('content').hidden=false; $('logout').hidden=false; setTimeout(()=>state.map?.invalidateSize(),0); }
async function loadData(user) {
  const [points,visits]=await Promise.all([getDocs(collection(db,'points')),getDocs(collection(db,'users',user.uid,'visits'))]);
  state.points=points.docs.map(s=>({id:s.id,...s.data()})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
  state.visits=new Set(visits.docs.map(s=>s.id));
  state.boundsFitted=false; showContent(); initMap(); render(); startLocation();
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
  const list=$('points');list.replaceChildren();
  for(const marker of state.markers)marker.remove();state.markers=[];
  const bounds=[];
  for(const point of state.points) {
    const visited=state.visits.has(point.id), eligibility=visitEligibility(point,state.fix);
    const item=document.createElement('article');item.className='point'+(visited?' visited':'');
    const title=document.createElement('h3');title.textContent=point.name;
    const desc=document.createElement('p');desc.textContent=point.description||'';
    const meta=document.createElement('p');meta.className='meta';meta.textContent=visited?'✓ Navštíveno':eligibility.distance==null?'Čekám na polohu':`${Math.round(eligibility.distance)} m od vás`;
    item.append(title,desc,meta);
    if(!visited) {
      if(eligibility.ok) {const button=document.createElement('button');button.textContent='Potvrdit návštěvu';button.onclick=()=>confirmVisit(point,button);item.append(button);}
      else {const reason=document.createElement('p');reason.className='reason';reason.textContent=eligibility.reason;item.append(reason);}
    }
    list.append(item);
    const marker=L.marker([point.lat,point.lng]).addTo(state.map).bindPopup(`<strong>${escapeHtml(point.name)}</strong><br>${visited?'Navštíveno':'Zatím nenavštíveno'}`);
    marker.on('click',()=>item.scrollIntoView({behavior:'smooth',block:'nearest'}));
    state.markers.push(marker);bounds.push([point.lat,point.lng]);
  }
  if(bounds.length&&!state.boundsFitted){state.map.fitBounds(bounds,{padding:[32,32],maxZoom:15});state.boundsFitted=true;}
  if(!bounds.length)status('Zatím nejsou synchronizována žádná místa.');
}
function startLocation() {
  if(!navigator.geolocation){$('location-info').textContent='Toto zařízení nepodporuje geolokaci.';return;}
  if(state.watchId!=null)return;
  state.watchId=navigator.geolocation.watchPosition(position=>{
    const {latitude:lat,longitude:lng,accuracy}=position.coords;
    state.fix={lat,lng,accuracy,timestamp:position.timestamp};
    $('location-info').textContent=`Přesnost polohy přibližně ±${Math.round(accuracy)} m`;
    if(!state.userMarker){
      state.userMarker=L.circleMarker([lat,lng],{radius:8,color:'#fff',weight:3,fillColor:'#267eb8',fillOpacity:1}).addTo(state.map);
      state.accuracyCircle=L.circle([lat,lng],{radius:accuracy,color:'#267eb8',weight:1,fillOpacity:.08}).addTo(state.map);
    } else {state.userMarker.setLatLng([lat,lng]);state.accuracyCircle.setLatLng([lat,lng]).setRadius(accuracy);}
    render();
  },error=>{$('location-info').textContent=error.code===1?'Povolte přístup k poloze v prohlížeči.':'Polohu se nepodařilo získat.';state.fix=null;render();},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
}
async function confirmVisit(point,button) {
  const fix=state.fix;
  if(!visitEligibility(point,fix).ok||!state.user){render();return;}
  button.disabled=true;
  try {
    await setDoc(doc(db,'users',state.user.uid,'visits',point.id),{pointId:point.id,visitedAt:serverTimestamp(),measuredAt:Timestamp.fromMillis(fix.timestamp),lat:fix.lat,lng:fix.lng,accuracyM:fix.accuracy});
    state.visits.add(point.id);status(`Návštěva místa „${point.name}“ byla potvrzena.`);render();
  }catch(error){status(explain(error),true);button.disabled=false;}
}
$('email-form').addEventListener('submit',async event=>{
  event.preventDefault();const email=$('email').value.trim().toLowerCase(),button=event.target.querySelector('button');button.disabled=true;
  try {await sendSignInLinkToEmail(auth,email,{url:location.origin+location.pathname,handleCodeInApp:true});localStorage.setItem('sm:emailForSignIn',email);status('Přihlašovací odkaz byl odeslán. Otevřete jej z e-mailu.');}
  catch(error){status(explain(error),true);}finally{button.disabled=false;}
});
$('link-form').addEventListener('submit',async event=>{event.preventDefault();await finishSignIn($('link-email').value.trim().toLowerCase());});
async function finishSignIn(email) {
  const button=$('link-form').querySelector('button');button.disabled=true;
  try {await signInWithEmailLink(auth,email,location.href);localStorage.removeItem('sm:emailForSignIn');history.replaceState({},'',location.pathname);$('link-step').hidden=true;status('Přihlášení proběhlo úspěšně.');}
  catch(error){status(explain(error),true);}finally{button.disabled=false;}
}
$('logout').onclick=async()=>{await signOut(auth);};
$('locate').onclick=()=>{if(state.fix)state.map.setView([state.fix.lat,state.fix.lng],17);else startLocation();};
if(!app){$('setup').hidden=false;showAuth();}
else {
  onAuthStateChanged(auth,async user=>{
    state.user=user;
    if(!user){if(state.watchId!=null)navigator.geolocation.clearWatch(state.watchId);state.watchId=null;state.fix=null;showAuth();return;}
    try{await loadData(user);}catch(error){status(explain(error),true);showAuth();}
  });
  if(isSignInWithEmailLink(auth,location.href)){
    $('link-step').hidden=false;$('email-step').hidden=true;
    const email=localStorage.getItem('sm:emailForSignIn');
    if(email){$('link-email').value=email;finishSignIn(email);}
    else status('Pro dokončení zadejte e-mail, na který přišel odkaz.');
  }
}
setInterval(()=>{if(state.map&&state.fix)render();},3000);
