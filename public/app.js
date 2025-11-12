// ========= Config =========
if (typeof window.SPOTIFY_TOKEN_ENDPOINT === "undefined") {
  window.SPOTIFY_TOKEN_ENDPOINT = "/api/spotify-token";
}
// Viewer por defecto (Dianita view).
const params = new URLSearchParams(location.search);
const VIEW_MODE = params.get("view") !== "0";

const FEELING_BUTTONS = [
  { id: 'miss', label: 'Te extraño' },
  { id: 'sorry', label: 'Hablemos' },
  { id: 'angry', label: 'Me caes mal pero te amo' },
  { id: 'sad', label: 'Estoy triste' }
];
const FEELINGS_TABLE = window.SUPABASE_FEELINGS_TABLE || 'feeling_signals';
const feelingsState = {
  client: null,
  channel: null,
  buttons: [],
  statusNode: null,
  toastNode: null,
  toastTimer: null,
  ip: null,
  delivered: new Set(),
  lastCreatedAt: null,
  sessionStartedAt: null,
  pollTimer: null
};
const IS_SECURE_CONTEXT = window.isSecureContext || ['localhost','127.0.0.1','::1'].includes(location.hostname);
const notificationState = {
  supported: typeof Notification !== 'undefined',
  button: null,
  statusNode: null,
  requesting: false,
  audioCtx: null
};

// ========= Helpers =========
const $ = (sel) => document.querySelector(sel);
const getParam = (k) => new URLSearchParams(location.search).get(k);

function lockBackground(){
  document.body.style.background = '';
  document.body.classList.add('bg-locked');
}
document.addEventListener('DOMContentLoaded', lockBackground);

function parseSpotify(url){
  const m = String(url).match(/open\.spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/);
  if(!m) return null;
  return { type:m[1], id:m[2] };
}
function msToMin(ms){
  if(!ms && ms!==0) return "";
  const m = Math.floor(ms/60000), s = Math.floor((ms%60000)/1000);
  return `${m}:${String(s).padStart(2,'0')}`;
}

// ========= oEmbed =========
async function fetchOEmbed(url){
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {cache:'no-store'});
  if(!res.ok) throw new Error('oEmbed fail '+res.status);
  return res.json();
}

// ========= Token opcional =========
async function getToken(){
  const endpoint = window.SPOTIFY_TOKEN_ENDPOINT || "";
  if(!endpoint) return null;
  try{
    const r = await fetch(endpoint, {cache:'no-store'});
    if(!r.ok) return null;
    const j = await r.json();
    return j.access_token || j.token || null;
  }catch{ return null; }
}
async function fetchSpotifyAPI(path, token){
  const r = await fetch(`https://api.spotify.com/v1/${path}`, { headers:{ Authorization:`Bearer ${token}` }});
  if(!r.ok) throw new Error('Spotify API '+r.status);
  return r.json();
}

// ========= Paleta desde portada =========
async function extractPalette(imgUrl, n=5){
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imgUrl;
  await img.decode();

  const cnv = document.createElement('canvas');
  const ctx = cnv.getContext('2d', { willReadFrequently:true });
  const w = cnv.width = 120, h = cnv.height = 120;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0,0,w,h);

  const map = new Map();
  for(let i=0;i<data.length;i+=4){
    const r=data[i], g=data[i+1], b=data[i+2], a=data[i+3];
    if(a<200) continue;
    const key = `${r>>4}-${g>>4}-${b>>4}`;
    map.set(key, (map.get(key)||0)+1);
  }
  const sorted = [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0, n);
  return sorted.map(([key])=>{
    const [R,G,B] = key.split('-').map(x=> (parseInt(x,10)<<4)+8 );
    return `rgb(${R}, ${G}, ${B})`;
  });
}
function applyPalette(cols){
  if(!cols || !cols.length) return;
  document.documentElement.style.setProperty('--accent', cols[0]);
  document.documentElement.style.setProperty('--accent-2', cols[1] || cols[0]);
}

// ========= Util para usar iframe del JSON de forma segura =========
function extractSpotifySrc(html){
  const tpl = document.createElement('template');
  tpl.innerHTML = (html||"").trim();
  const iframe = tpl.content.querySelector('iframe');
  if(!iframe) return null;
  const src = iframe.getAttribute('src') || '';
  try{
    const u = new URL(src);
    if (u.origin === 'https://open.spotify.com' && u.pathname.startsWith('/embed/')) {
      return src;
    }
    return null;
  }catch{ return null; }
}

function deriveSpotifyUrl(entry){
  if(!entry) return null;
  if(entry.spotify_url) return entry.spotify_url;
  let src = entry.spotify_embed || null;
  if(!src && entry.spotify_embed_html) src = extractSpotifySrc(entry.spotify_embed_html);
  if(!src) return null;
  try{
    const url = new URL(src);
    if (url.pathname.startsWith('/embed/')) {
      url.pathname = url.pathname.replace('/embed/', '/');
    }
    url.search = '';
    return url.toString();
  }catch{
    return src.includes('/embed/') ? src.replace('/embed/','/') : src;
  }
}

// ========= Botones rápidos (Supabase) =========
function setupFeelingUI(){
  const grid = document.querySelector('#feelingsGrid');
  const status = document.querySelector('#feelingStatus');
  const toast = document.querySelector('#feelingToast');
  if(!grid || !status || !toast) return false;

  grid.innerHTML = '';
  feelingsState.buttons = FEELING_BUTTONS.map(cfg=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'feeling-btn';
    btn.dataset.code = cfg.id;
    btn.textContent = cfg.label;
    btn.disabled = true;
    btn.addEventListener('click', ()=> emitFeeling(cfg.id, btn));
    grid.appendChild(btn);
    return btn;
  });

  feelingsState.statusNode = status;
  feelingsState.toastNode = toast;
  status.textContent = 'Configura Supabase para activarlos.';
  return true;
}

function setFeelingStatus(text){
  if (feelingsState.statusNode) feelingsState.statusNode.textContent = text;
}
function setFeelingButtonsEnabled(enabled){
  feelingsState.buttons.forEach(btn => { btn.disabled = !enabled; });
}

function updateNotificationStatus(text){
  if (notificationState.statusNode) notificationState.statusNode.textContent = text;
}

function syncNotificationPermission(forcedPermission){
  const btn = notificationState.button;
  if (!notificationState.statusNode) return;

  if (!notificationState.supported){
    updateNotificationStatus('Tu navegador no soporta notificaciones.');
    btn?.classList.add('hidden');
    return;
  }

  const permission = forcedPermission || Notification.permission;

  if (permission === 'granted'){
    updateNotificationStatus('Notificaciones activadas ✅');
    if (btn){
      btn.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Activadas';
    }
  } else if (permission === 'denied'){
    updateNotificationStatus('Están bloqueadas, habilítalas desde los ajustes del navegador.');
    if (btn){
      btn.classList.remove('hidden');
      btn.disabled = true;
      btn.textContent = 'Bloqueadas';
    }
  } else {
    updateNotificationStatus('Activa las notificaciones para que no se te pase ningún botoncito.');
    if (btn){
      btn.classList.remove('hidden');
      btn.disabled = notificationState.requesting;
      btn.textContent = notificationState.requesting ? 'Solicitando…' : 'Activar notificaciones';
    }
  }
}

async function requestNotificationPermission(){
  if(!IS_SECURE_CONTEXT){
    updateNotificationStatus('Necesitas abrir esto en HTTPS o localhost para permitir notificaciones.');
    notificationState.button?.classList.add('hidden');
    return;
  }
  if (!notificationState.supported){
    updateNotificationStatus('Tu navegador no soporta notificaciones.');
    return;
  }
  if (Notification.permission === 'granted') return;
  if (notificationState.requesting) return;
  notificationState.requesting = true;
  syncNotificationPermission('default');
  try{
    const result = await Notification.requestPermission();
    notificationState.requesting = false;
    syncNotificationPermission(result);
  }catch(err){
    notificationState.requesting = false;
    console.warn('Notification permission error', err);
    updateNotificationStatus('No se pudo solicitar el permiso, intenta de nuevo.');
    if (notificationState.button){
      notificationState.button.disabled = false;
      notificationState.button.textContent = 'Reintentar';
    }
  }
}

function initNotificationGuard(){
  const btn = document.querySelector('#notifBtn');
  const status = document.querySelector('#notificationStatus');
  if(!btn || !status) return;
  notificationState.button = btn;
  notificationState.statusNode = status;
  if(!IS_SECURE_CONTEXT){
    updateNotificationStatus('Las notificaciones solo funcionan en HTTPS o localhost.');
    btn.classList.add('hidden');
    return;
  }
  btn.addEventListener('click', requestNotificationPermission);
  syncNotificationPermission();
}

function ensureAudioContext(){
  if (notificationState.audioCtx) return notificationState.audioCtx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  notificationState.audioCtx = new AudioCtx();
  return notificationState.audioCtx;
}

function primeAudioContextOnInteraction(){
  const handler = ()=>{
    const ctx = ensureAudioContext();
    if (ctx && ctx.state === 'suspended'){
      ctx.resume().catch(()=>{});
    }
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('keydown', handler);
  };
  window.addEventListener('pointerdown', handler);
  window.addEventListener('keydown', handler);
}

function playNotificationSound(){
  try{
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.8);
  }catch(err){
    console.warn('Notification sound error', err);
  }
}

function fireSystemNotification(body){
  if (!notificationState.supported) return;
  if (Notification.permission !== 'granted') return;
  try{
    new Notification('Nuevo botoncito 💌', {
      body,
      icon: '/favicon.gif',
      badge: '/favicon.gif',
      tag: 'feeling-signal'
    });
  }catch(err){
    console.warn('Notification show error', err);
  }
}

function showFeelingToast(message){
  const toast = feelingsState.toastNode;
  if(!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  clearTimeout(feelingsState.toastTimer);
  feelingsState.toastTimer = setTimeout(()=>{
    toast.classList.remove('show');
  }, 4200);
}

async function emitFeeling(code, button){
  if (!feelingsState.client){
    showFeelingToast('Activa Supabase para enviarlos.');
    return;
  }
  const def = FEELING_BUTTONS.find(b=>b.id === code);
  if (button){
    button.classList.add('sending');
    button.disabled = true;
  }

  try{
    const { error } = await feelingsState.client
      .from(FEELINGS_TABLE)
      .insert({
        code,
        message: def?.label || code,
        sender_ip: feelingsState.ip || 'unknown'
      });
    if (error) throw error;
    setFeelingStatus('Enviado ✨');
  }catch(err){
    console.warn('Feeling send error', err);
    showFeelingToast('No se pudo enviar 😔');
  }finally{
    if (button){
      button.classList.remove('sending');
      button.disabled = false;
    }
  }
}

async function fetchPublicIp(){
  try{
    const res = await fetch('https://api.ipify.org?format=json', { cache:'no-store' });
    if(!res.ok) throw new Error('ip fail');
    const j = await res.json();
    return j.ip || 'unknown';
  }catch{
    return 'unknown';
  }
}

function handleIncomingFeeling(row){
  if(!row) return;
  const createdAt = row.created_at || null;
  if (feelingsState.sessionStartedAt && createdAt && createdAt < feelingsState.sessionStartedAt) {
    return;
  }
  const key = row.id || `${row.sender_ip || 'unk'}-${row.created_at || Math.random()}`;
  if (key && feelingsState.delivered.has(key)) return;
  if (key){
    feelingsState.delivered.add(key);
    if (feelingsState.delivered.size > 200){
      const firstKey = feelingsState.delivered.values().next().value;
      feelingsState.delivered.delete(firstKey);
    }
  }
  if (createdAt){
    if (!feelingsState.lastCreatedAt || createdAt > feelingsState.lastCreatedAt) {
      feelingsState.lastCreatedAt = createdAt;
    }
  }
  const senderIp = row.sender_ip;
  const localIp = feelingsState.ip;
  const bothKnown = senderIp && localIp && senderIp !== 'unknown' && localIp !== 'unknown';
  if (bothKnown && senderIp === localIp) return;
  const text = row.message || 'Pensé en ti';
  showFeelingToast(text);
  playNotificationSound();
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    fireSystemNotification(text);
  }
  setFeelingStatus('Recibiste un botoncito 💌');
}

function subscribeToFeelings(){
  if (!feelingsState.client) return;
  feelingsState.channel?.unsubscribe?.();
  feelingsState.channel = feelingsState.client
    .channel(`public:${FEELINGS_TABLE}`)
    .on('postgres_changes', { event:'INSERT', schema:'public', table: FEELINGS_TABLE }, payload=>{
      handleIncomingFeeling(payload?.new);
    })
    .subscribe(status=>{
      if (status === 'SUBSCRIBED'){
        setFeelingButtonsEnabled(true);
        setFeelingStatus('Usalos dependiendo como te sientas');
      } else if (status === 'CHANNEL_ERROR'){
        setFeelingStatus('Error al escuchar la tabla. Reintentando...');
        setFeelingButtonsEnabled(false);
        setTimeout(()=> subscribeToFeelings(), 2000);
      } else if (status === 'TIMED_OUT' || status === 'CLOSED'){
        setFeelingStatus('Conexión perdida, intentando reconectar...');
        setFeelingButtonsEnabled(false);
        setTimeout(()=> subscribeToFeelings(), 2000);
      }
    });
  startFeelingPolling();
}

async function initFeelingSignals(){
  const hasUi = setupFeelingUI();
  if(!hasUi) return;

  const hasConfig = Boolean(
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY &&
    window.supabase &&
    typeof window.supabase.createClient === 'function'
  );
  if (!hasConfig){
    setFeelingStatus('Define SUPABASE_URL y SUPABASE_ANON_KEY.');
    return;
  }
  try{
    feelingsState.client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }catch(err){
    console.warn('Supabase init fail', err);
    setFeelingStatus('Supabase no disponible 😢');
    return;
  }

  stopFeelingPolling();
  feelingsState.delivered.clear();
  feelingsState.sessionStartedAt = new Date().toISOString();
  feelingsState.lastCreatedAt = feelingsState.sessionStartedAt;

  setFeelingButtonsEnabled(false);
  setFeelingStatus('Sincronizando...');
  fetchPublicIp().then(ip => { feelingsState.ip = ip || 'unknown'; });
  subscribeToFeelings();
}

function stopFeelingPolling(){
  if (feelingsState.pollTimer){
    clearInterval(feelingsState.pollTimer);
    feelingsState.pollTimer = null;
  }
}

function startFeelingPolling(){
  stopFeelingPolling();
  if (!feelingsState.client) return;
  const poll = async ()=>{
    try{
      let query = feelingsState.client
        .from(FEELINGS_TABLE)
        .select('*')
        .order('created_at', { ascending: true })
        .limit(20);
      const since = feelingsState.lastCreatedAt || feelingsState.sessionStartedAt || null;
      if (since){
        query = query.gt('created_at', since);
      }else{
        const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
        query = query.gt('created_at', hourAgo);
      }
      const { data, error } = await query;
      if (error){
        console.warn('Polling feelings fail', error);
        return;
      }
      if (Array.isArray(data)){
        data.forEach(handleIncomingFeeling);
      }
    }catch(err){
      console.warn('Polling feelings err', err);
    }
  };
  poll();
  feelingsState.pollTimer = setInterval(poll, 6000);
}

function buildHeroVideo(container, hero = {}, spotifyUrl){
  if(!container || !hero || !hero.src) return false;

  const wrap = document.createElement('div');
  wrap.className = 'hero-video';

  if (spotifyUrl) {
    const a = document.createElement('a');
    a.className = 'open-spotify';
    a.href = spotifyUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 6.63 5.373 12 12 12s12-5.37 12-12C24 5.373 18.627 0 12 0Zm5.49 17.31a.86.86 0 0 1-1.18.28c-3.23-1.97-7.29-2.42-12.09-1.34a.86.86 0 0 1-.38-1.68c5.19-1.17 9.67-.65 13.22 1.47.41.25.54.8.23 1.27Zm1.62-3.01a1.08 1.08 0 0 1-1.47.35c-3.7-2.25-9.35-2.9-13.73-1.61a1.08 1.08 0 1 1-.6-2.08c4.94-1.42 11.17-.69 15.39 1.85.51.31.67.98.41 1.49Zm.15-3.24c-4.16-2.47-11.06-2.7-15.04-1.51a1.29 1.29 0 0 1-.73-2.47c4.57-1.36 12.23-1.08 17.03 1.74a1.29 1.29 0 0 1-1.26 2.24Z"/>
      </svg>
      Abrir en Spotify
    `;
    wrap.appendChild(a);
  }

  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = hero.src;
  if (hero.poster) video.poster = hero.poster;
  if (hero.autoplay) video.setAttribute('autoplay', '');
  if (hero.muted || hero.autoplay) video.muted = true;
  if (hero.loop) video.loop = true;

  wrap.appendChild(video);
  container.innerHTML = '';
  container.appendChild(wrap);
  return true;
}

// ========= Render desde URL (modo admin) =========
async function renderFromUrl(spotifyUrl){
  const parsed = parseSpotify(spotifyUrl);
  const o = await fetchOEmbed(spotifyUrl);

  let title = o.title, artist = o.author_name;
  if(o.title && o.title.includes(' — ')){ const [t,a] = o.title.split(' — '); title=t; artist=a; }
  $('#title').textContent = title || '—';
  const art = $('#artistLink'); art.textContent = artist || '—'; art.href = `https://open.spotify.com/search/${encodeURIComponent(artist||'')}`;

  const cover = o.thumbnail_url; if (cover) $('#cover').src = cover;
  /*const embedContainer = $('#embedContainer');
  /*const cleanHtml = o.html || (parsed ? `<iframe src="https://open.spotify.com/embed/${parsed.type}/${parsed.id}" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>` : ""); */
  const embed = $('#embedContainer'); 
embed.innerHTML = '';

function buildHeroVideo({ container, src, poster, autoplay=false, muted=false, loop=false, spotifyUrl }) {
  const wrap = document.createElement('div');
  wrap.className = 'hero-video';

  // Botón abrir en Spotify (opcional)
  if (spotifyUrl) {
    const a = document.createElement('a');
    a.className = 'open-spotify';
    a.href = spotifyUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 6.63 5.373 12 12 12s12-5.37 12-12C24 5.373 18.627 0 12 0Zm5.49 17.31a.86.86 0 0 1-1.18.28c-3.23-1.97-7.29-2.42-12.09-1.34a.86.86 0 0 1-.38-1.68c5.19-1.17 9.67-.65 13.22 1.47.41.25.54.8.23 1.27Zm1.62-3.01a1.08 1.08 0 0 1-1.47.35c-3.7-2.25-9.35-2.9-13.73-1.61a1.08 1.08 0 1 1-.6-2.08c4.94-1.42 11.17-.69 15.39 1.85.51.31.67.98.41 1.49Zm.15-3.24c-4.16-2.47-11.06-2.7-15.04-1.51a1.29 1.29 0 0 1-.73-2.47c4.57-1.36 12.23-1.08 17.03 1.74a1.29 1.29 0 0 1-1.26 2.24Z"/>
      </svg>
      Abrir en Spotify
    `;
    wrap.appendChild(a);
  }

  const v = document.createElement('video');
  v.controls = true;
  v.playsInline = true;               // iOS inline
  v.preload = 'metadata';
  v.src = src;
  if (poster) v.poster = poster;
  if (autoplay) v.setAttribute('autoplay', '');
  if (muted) v.muted = true;          // autoplay móvil requiere muted
  if (loop) v.loop = true;

  wrap.appendChild(v);
  container.innerHTML = '';
  container.appendChild(wrap);
}

let hero = j.hero_video || j.video;   // usa el que tengas
if (hero && hero.src) {
  buildHeroVideo({
    container: embed,
    src: hero.src,
    poster: hero.poster,
    autoplay: !!hero.autoplay,
    muted: !!hero.muted,
    loop: !!hero.loop,
    spotifyUrl: j.spotify_url || (j.spotify_embed ? j.spotify_embed.replace('/embed/','/track/') : null)
  });
} else if (j.preview_audio) {
  // Si ya tenías un buildAudioPlayer, úsalo aquí como fallback
  buildAudioPlayer({
    container: embed,
    src: j.preview_audio,
    title: j.title, artist: j.artist, cover: j.cover,
    spotifyUrl: j.spotify_url
  });
} else {
  // Último recurso: deja el iframe de Spotify si existiera
  let src = j.spotify_embed ? j.spotify_embed : null;
  if (!src && j.spotify_embed_html) src = extractSpotifySrc(j.spotify_embed_html);
  if (src) {
    embed.innerHTML = `<iframe src="${src}" width="100%" height="152" frameborder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
  }
}
  embedContainer.innerHTML = cleanHtml;

  $('#result').classList.remove('hidden');
  if(cover){ try{ const cols = await extractPalette(cover, 5); applyPalette(cols); }catch{} }

  $('#date').textContent = ''; $('#duration').textContent = ''; $('#tracks').innerHTML=''; $('#totalDur').textContent='';
  const token = await getToken();
  if(parsed && token){
    try{
      if(parsed.type === 'album'){
        const album = await fetchSpotifyAPI(`albums/${parsed.id}`, token);
        $('#date').textContent = album.release_date || '';
        const totalMs = album.tracks.items.reduce((acc,t)=>acc+t.duration_ms,0);
        $('#duration').textContent = totalMs ? `Duración: ${msToMin(totalMs)}` : '';
        const ol = $('#tracks'); ol.innerHTML='';
        album.tracks.items.forEach((t,i)=>{
          const li = document.createElement('li');
          li.innerHTML = `<span>${i+1}. ${t.name}</span><span class="muted">${msToMin(t.duration_ms)}</span>`;
          ol.appendChild(li);
        });
        $('#totalDur').textContent = totalMs ? `Duración total: ${msToMin(totalMs)}` : '';
      } else if(parsed.type === 'playlist'){
        const pl = await fetchSpotifyAPI(`playlists/${parsed.id}`, token);
        $('#date').textContent = 'Playlist';
        let totalMs = 0; const ol = $('#tracks'); ol.innerHTML='';
        pl.tracks.items.forEach((it,i)=>{
          const t = it.track; if(!t) return;
          totalMs += t.duration_ms||0;
          const li = document.createElement('li');
          li.innerHTML = `<span>${i+1}. ${t.name}</span><span class="muted">${msToMin(t.duration_ms)}</span>`;
          ol.appendChild(li);
        });
        $('#duration').textContent = totalMs ? `Duración: ${msToMin(totalMs)}` : '';
        $('#totalDur').textContent = totalMs ? `Duración total: ${msToMin(totalMs)}` : '';
      } else if(parsed.type === 'track'){
        const track = await fetchSpotifyAPI(`tracks/${parsed.id}`, token);
        $('#date').textContent = (track.album && track.album.release_date) ? track.album.release_date : '';
        $('#duration').textContent = track.duration_ms ? `Duración: ${msToMin(track.duration_ms)}` : '';
        const ol = $('#tracks'); ol.innerHTML='';
        const li = document.createElement('li');
        li.innerHTML = `<span>${track.name}</span><span class="muted">${msToMin(track.duration_ms)}</span>`;
        ol.appendChild(li);
        $('#totalDur').textContent = `Duración total: ${msToMin(track.duration_ms||0)}`;
      }
    }catch(e){ console.warn(e); }
  }
}

// ========= Carrusel (global) =========
function renderGalleryFromJson(j){
  const box = document.querySelector('#galleryBox');
  if (!box) return;

  const items = (j && Array.isArray(j.gallery)) ? j.gallery : [];
  if (!items.length){
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  box.innerHTML = `
    <div class="carousel" role="region" aria-label="Galería">
      <button class="nav-btn nav-prev" aria-label="Anterior">‹</button>
      <button class="nav-btn nav-next" aria-label="Siguiente">›</button>
      <div class="carousel-track">
        ${items.map(it => `
          <div class="slide">
            <figure>
              <img loading="lazy" src="${it.src}" alt="${(it.alt||'Foto')}" />
            </figure>
          </div>
        `).join('')}
      </div>
      <div class="dots">
        ${items.map((_,i)=> `<span class="dot ${i===0?'active':''}" data-i="${i}"></span>`).join('')}
      </div>
    </div>
  `;
  box.classList.remove('hidden');

  makeCarousel(box.querySelector('.carousel'));
}
function makeCarousel(root){
  const track   = root.querySelector('.carousel-track');
  const slides  = Array.from(root.querySelectorAll('.slide'));
  const prevBtn = root.querySelector('.nav-prev');
  const nextBtn = root.querySelector('.nav-next');
  const dots    = Array.from(root.querySelectorAll('.dot'));

  let index = 0;
  const total = slides.length;

  // ancho del carrusel (más estable que clientWidth)
  const getWidth = () => root.getBoundingClientRect().width;

  function setArrowVisibility(){
    // Ocultar/mostrar flechas en extremos
    prevBtn.style.visibility = (index === 0) ? 'hidden' : 'visible';
    nextBtn.style.visibility = (index === total - 1) ? 'hidden' : 'visible';

    prevBtn.disabled = (index === 0);
    nextBtn.disabled = (index === total - 1);
    prevBtn.setAttribute('aria-disabled', prevBtn.disabled ? 'true' : 'false');
    nextBtn.setAttribute('aria-disabled', nextBtn.disabled ? 'true' : 'false');
  }

  function update(){
    const x = -index * getWidth();
    track.style.transform = `translateX(${x}px)`;
    dots.forEach((d,i)=> d.classList.toggle('active', i===index));
    setArrowVisibility();
  }

  function go(n){
    const next = Math.max(0, Math.min(total - 1, n)); // clamp
    if (next === index) return;
    index = next;
    update();
  }

  // --- Botones  ---
  const stop = e => { e.stopPropagation(); };
  ['pointerdown','pointermove','pointerup','click'].forEach(ev=>{
    prevBtn.addEventListener(ev, stop);
    nextBtn.addEventListener(ev, stop);
  });
  prevBtn.addEventListener('click', ()=> go(index - 1));
  nextBtn.addEventListener('click', ()=> go(index + 1));

  // --- puntitos como los de instagram alv ---
  dots.forEach(d => d.addEventListener('click', (e)=> {
    e.stopPropagation();
    const i = parseInt(d.dataset.i, 10);
    if (!Number.isNaN(i)) go(i);
  }));

  let startX = 0, lastX = 0, dragging = false;
  const threshold = 40;

  track.addEventListener('pointerdown', e=>{
    dragging = true;
    startX = lastX = e.clientX;
    track.setPointerCapture?.(e.pointerId);
  });
  track.addEventListener('pointermove', e=>{
    if(!dragging) return;
    lastX = e.clientX;
  });
  track.addEventListener('pointerup', e=>{
    if(!dragging) return;
    dragging = false;
    const dx = lastX - startX;
    if (Math.abs(dx) > threshold){
      if (dx < 0) go(index + 1);
      else go(index - 1);
    }
  });

  root.setAttribute('tabindex', '0');
  root.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowLeft')  { e.preventDefault(); go(index - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
  });

  const onResize = () => update();
  window.addEventListener('resize', onResize, { passive: true });


  let imagesPending = slides.length;
  slides.forEach(sl => {
    const img = sl.querySelector('img');
    if (!img || img.complete) { imagesPending--; return; }
    img.addEventListener('load', ()=>{
      imagesPending--;
      if (imagesPending <= 0) update();
    }, { once: true });
  });

  // Inicial
  update();
}

function escapeHTML(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}
function highlightDATA(s){
  // respeta saltos de línea y resalta solo la palabra DATA exacta
  const safe = escapeHTML(s || '').replace(/\n/g,'<br>');
  return safe.replace(/\bDATA\b/g, '<span class="data-glow">DATA</span>');
}

// ========= Render desde today.json (viewer) =========
async function renderFromTodayJson(){
  try{
    const r = await fetch('today.json', { cache: 'no-store' });
    if(!r.ok) throw new Error('today.json no encontrado');
    const j = await r.json();

    // Meta
    $('#title').textContent = j.title || '—';
    const a = $('#artistLink');
    a.textContent = j.artist || '—';
    a.href = j.artist ? `https://open.spotify.com/search/${encodeURIComponent(j.artist)}` : '#';
    if (j.cover) $('#cover').src = j.cover;

    // Player
    const embed = $('#embedContainer'); embed.innerHTML = '';
    const heroVideo = j.hero_video || j.video || null;
    const spotifyUrl = deriveSpotifyUrl(j);
    const hasVideo = buildHeroVideo(embed, heroVideo, spotifyUrl);
    if (!hasVideo) {
      let src = j.spotify_embed ? j.spotify_embed : null;
      if (!src && j.spotify_embed_html) src = extractSpotifySrc(j.spotify_embed_html);
      if (src) {
        embed.innerHTML = `<iframe src="${src}" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
      }
    }

    

    // Paleta (no se pq no sirve)
    if (j.cover) { try { const cols = await extractPalette(j.cover, 5); applyPalette(cols); } catch {} }




    // Textos
    $('#lyric').innerHTML = highlightDATA(j.lyric_highlight || '');
    $('#note').textContent  = j.message || '';
    $('#bibleRef').textContent = j.bible_ref || 'Pasaje';
    $('#bibleText').textContent = j.bible_text || '';

    // Extras
    $('#date').textContent = j.date || '';
    $('#duration').textContent = '';
    $('#tracks').innerHTML = '';
    $('#totalDur').textContent = '';

    // ==== Video opcional (MP4) ====
    const box = document.querySelector('#videoBox');
    if (box) {
      const v = j.video;
      if (v && v.src) {
        const wrap = document.createElement('div');
        wrap.className = 'video-wrap';

        const vid = document.createElement('video');
        vid.controls = true;
        vid.playsInline = true;
        vid.preload = 'metadata';
        vid.src = v.src;                   // "media/not.mp4"
        if (v.poster) vid.poster = v.poster;
        if (v.autoplay) vid.setAttribute('autoplay', '');
        if (v.muted) vid.muted = true;     // autoplay móvil requiere muted
        if (v.loop)  vid.loop = true;

        wrap.appendChild(vid);
        box.innerHTML = '';
        box.appendChild(wrap);
        box.classList.remove('hidden');
      } else {
        box.classList.add('hidden');
        box.innerHTML = '';
      }
    }

    // ==== Galería opcional ====
    renderGalleryFromJson(j);

    $('#result').classList.remove('hidden');
  }catch(e){
    console.warn('No se pudo cargar today.json', e);
  }
}

// ========= Exportar JSON (solo lo veo yo) =========
function exportJSON(){
  const iframe = $('#embedContainer')?.querySelector('iframe');
  const src = iframe?.getAttribute('src') || '';
  const data = {
    title: $('#title')?.textContent || '',
    artist: $('#artistLink')?.textContent || '',
    date: $('#date')?.textContent.replace('Duración:','').trim() || '',
    cover: $('#cover')?.src || '',
    spotify_embed_html: iframe ? iframe.outerHTML : '',
    spotify_embed: src,
    lyric_highlight: $('#lyric')?.textContent || '',
    message: $('#note')?.textContent || '',
    bible_ref: $('#bibleRef')?.textContent || '',
    bible_text: $('#bibleText')?.textContent || ''
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'today.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ========= Arranque =========
document.addEventListener('DOMContentLoaded', ()=>{
  // Dianita solo verá contenido
  if (VIEW_MODE) document.body.classList.add('viewer');
  initNotificationGuard();
  primeAudioContextOnInteraction();
  initFeelingSignals();

  // Botones (solo los veo yo)
  $('#btnGen')?.addEventListener('click', ()=>{
    const url = $('#spotifyUrl')?.value.trim();
    if(!url) return;
    renderFromUrl(url);
  });
  $('#btnExport')?.addEventListener('click', exportJSON);

  // Flujo inicial
  const qp = getParam('spotify');
  if (!VIEW_MODE && qp) {
    $('#spotifyUrl') && ($('#spotifyUrl').value = qp);
    renderFromUrl(qp);
  } else if (VIEW_MODE) {
    renderFromTodayJson();  // Dianita entra y lo ve directo
    
  }


// --- Toggle blur/visible ---
const revealCard = document.querySelector('#revealThoughts');
if (revealCard){
  revealCard.addEventListener('click', (e)=>{
    // toggle al hacer click en el card (excepto cuando haces scroll con la rueda)
    revealCard.classList.toggle('active');
    const box = revealCard.querySelector('.scrollbox');
    box.classList.toggle('blurred', !revealCard.classList.contains('active'));
  });

  // también permitir con teclado (Enter/Espacio)
  const box = document.querySelector('#revealBox');
  box.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      revealCard.click();
    }
  });
}



});
