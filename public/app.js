// ========= Config =========
if (typeof window.SPOTIFY_TOKEN_ENDPOINT === "undefined") {
  window.SPOTIFY_TOKEN_ENDPOINT = "/api/spotify-token";
}
// Viewer por defecto (Dianita view).
const params = new URLSearchParams(location.search);
const VIEW_MODE = params.get("view") !== "0";
const TWITCH_CHANNEL = 'sopadecoditoo';
const TWITCH_EMBED_SCRIPT = 'https://player.twitch.tv/js/embed/v1.js';
const TWITCH_MIN_HEIGHT = 240;
const REACTION_OPTIONS = ['👍🏻', '❤️', '🥺', '😡'];

const FEELING_BUTTONS = [
  { id: 'miss', label: 'Te extraño' },
  { id: 'sorry', label: 'Beso' },
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
  bannerNode: null,
  bannerTimer: null,
  logNode: null,
  logEntries: [],
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
const REACTIONS_TABLE = window.SUPABASE_REACTIONS_TABLE || 'imessage_reactions';
const FRUIT_RAIN_DEFAULTS = ['mango', 'sandia'];
const fruitRainState = {
  root: null,
  active: false,
  current: null
};
const STAR_LAYERS = [
  { count: 58, size: [0.8, 1.6], parallax: 26, opacity: [0.35, 0.7] },
  { count: 44, size: [1.6, 2.6], parallax: 46, opacity: [0.45, 0.8] },
  { count: 30, size: [2.6, 4], parallax: 68, opacity: [0.55, 0.9] },
  { count: 18, size: [4, 5.4], parallax: 92, opacity: [0.65, 1] }
];
const starfieldState = {
  root: null,
  stars: [],
  pointer: { x: 0, y: 0 },
  raf: null,
  handlersBound: false,
  moveHandler: null,
  leaveHandler: null
};
const STARFIELD_INTENSITY = 1.35;
const reactionState = {
  map: {},
  loaded: false,
  client: null,
  channel: null,
  syncing: false,
  syncedOnce: false
};
const pollState = {
  client: null,
  loading: false,
  votes: { si: 0, no: 0 },
  voted: false,
  syncing: false,
  noAttempts: 0,
  warnTimer: null
};
const DEFAULT_CONTACT_AVATAR = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2080%2080%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22a%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23f2f2f9%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23c7d2fe%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width%3D%2280%22%20height%3D%2280%22%20rx%3D%2240%22%20fill%3D%22url%28%23a%29%22/%3E%3Ccircle%20cx%3D%2240%22%20cy%3D%2230%22%20r%3D%2216%22%20fill%3D%22%23fff%22/%3E%3Cpath%20d%3D%22M16%2066c4-14%2044-14%2048%200z%22%20fill%3D%22%23e0e7ff%22/%3E%3C/svg%3E';
const imessageState = {
  typingTimer: null,
  revealTimer: null,
  messageReady: false
};

// ========= Helpers =========
const $ = (sel) => document.querySelector(sel);
const getParam = (k) => new URLSearchParams(location.search).get(k);
const randBetween = (min, max) => min + Math.random() * (max - min);
const dayMs = 24 * 60 * 60 * 1000;

function ensureReactionsLoaded(){
  if (reactionState.loaded) return;
  reactionState.loaded = true;
  try{
    const raw = localStorage.getItem('imessageReactions');
    reactionState.map = raw ? JSON.parse(raw) : {};
  }catch{
    reactionState.map = {};
  }
}
function ensureReactionsClient(){
  if (reactionState.client) return reactionState.client;
  try{
    if (feelingsState?.client) {
      reactionState.client = feelingsState.client;
      return reactionState.client;
    }
    if (window.supabase?.createClient && window.SUPABASE_URL && window.SUPABASE_ANON_KEY){
      reactionState.client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      return reactionState.client;
    }
  }catch(err){
    console.warn('No se pudo iniciar Supabase para reacciones', err);
  }
  return null;
}
function saveReactionsLocal(){
  try{
    localStorage.setItem('imessageReactions', JSON.stringify(reactionState.map));
  }catch{/* ignore */}
}
function getReactionFor(lineKey){
  ensureReactionsLoaded();
  return reactionState.map?.[lineKey] || '';
}
function updateReactionStamp(lineKey, emoji){
  const bubbles = Array.from(document.querySelectorAll('.imessage-bubble'));
  const bubble = bubbles.find(node => node.dataset.lineKey === lineKey);
  const wrap = bubble?.parentElement;
  const stamp = wrap?.querySelector('.reaction-stamp');
  if (!stamp) return;
  if (emoji){
    stamp.textContent = emoji;
    stamp.dataset.active = 'true';
    stamp.classList.remove('is-empty');
    stamp.classList.add('show');
  }else{
    stamp.textContent = '🙂';
    stamp.dataset.active = 'false';
    stamp.classList.add('is-empty');
    stamp.classList.remove('show');
  }
}
function applyReactionLocal(lineKey, value, { persist=true } = {}){
  if (!lineKey) return;
  ensureReactionsLoaded();
  if (value){
    reactionState.map[lineKey] = value;
  } else {
    delete reactionState.map[lineKey];
  }
  if (persist) saveReactionsLocal();
  updateReactionStamp(lineKey, value);
}
async function saveReactionRemote(lineKey, value){
  const client = ensureReactionsClient();
  if (!client) return;
  try{
    if (value){
      await client.from(REACTIONS_TABLE).upsert(
        { line_key: lineKey, reaction: value, updated_at: new Date().toISOString() },
        { onConflict: 'line_key' }
      );
    }else{
      await client.from(REACTIONS_TABLE).delete().eq('line_key', lineKey);
    }
  }catch(err){
    console.warn('No se pudo guardar reacción en Supabase', err);
  }
}
async function syncReactionsRemote(){
  const client = ensureReactionsClient();
  if (!client || reactionState.syncing) return;
  reactionState.syncing = true;
  try{
    const { data, error } = await client
      .from(REACTIONS_TABLE)
      .select('line_key,reaction');
    if (error) throw error;
    ensureReactionsLoaded();
    reactionState.map = {};
    (data || []).forEach(row => {
      if (row?.line_key) reactionState.map[row.line_key] = row.reaction || '';
    });
    reactionState.syncedOnce = true;
    saveReactionsLocal();
    refreshReactionStamps();
    subscribeReactions();
  }catch(err){
    console.warn('Sync de reacciones falló', err);
  }finally{
    reactionState.syncing = false;
  }
}
function subscribeReactions(){
  const client = ensureReactionsClient();
  if (!client) return;
  if (reactionState.channel) return;
  reactionState.channel = client
    .channel(`public:${REACTIONS_TABLE}`)
    .on('postgres_changes', { event:'INSERT', schema:'public', table: REACTIONS_TABLE }, payload=>{
      const row = payload?.new;
      applyReactionLocal(row?.line_key, row?.reaction || '', { persist:true });
    })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table: REACTIONS_TABLE }, payload=>{
      const row = payload?.new;
      applyReactionLocal(row?.line_key, row?.reaction || '', { persist:true });
    })
    .on('postgres_changes', { event:'DELETE', schema:'public', table: REACTIONS_TABLE }, payload=>{
      const row = payload?.old;
      applyReactionLocal(row?.line_key, '', { persist:true });
    })
    .subscribe(status=>{
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'){
        reactionState.channel = null;
        setTimeout(()=> subscribeReactions(), 1500);
      }
    });
}
function refreshReactionStamps(){
  const bubbles = Array.from(document.querySelectorAll('.imessage-bubble'));
  bubbles.forEach(bubble=>{
    const key = bubble.dataset.lineKey;
    updateReactionStamp(key, getReactionFor(key));
  });
}
function setReactionFor(lineKey, value){
  if (!lineKey) return;
  applyReactionLocal(lineKey, value);
  saveReactionRemote(lineKey, value);
}

// ========= Poll (Supabase) =========
async function loadPoll(){
  const status = $('#pollStatus');
  if (!status) return;
  if (pollState.loading) return;
  pollState.loading = true;
  const client = getSupabaseClient();
  if (!client){
    status.textContent = '';
    pollState.loading = false;
    return;
  }
  status.textContent = '';
  pollState.loading = false;
}
async function voteYes(){
  const status = $('#pollStatus');
  const yesBtn = $('#pollYes');
  if (!yesBtn) return;
  const client = getSupabaseClient();
  if (!client){
    status.textContent = 'Supabase no disponible';
    return;
  }
  yesBtn.disabled = true;
  status.textContent = 'Enviando voto...';
  try{
    await client.from('love_poll').insert({ option:'si', created_at: new Date().toISOString() });
    status.textContent = '¡Voto enviado!';
    pollState.voted = true;
  }catch(err){
    console.warn('voto si fail', err);
    status.textContent = 'No se pudo votar, intenta de nuevo';
    yesBtn.disabled = false;
  }
}
function initPoll(){
  const card = $('#lovePoll');
  if (!card) return;
  const yesBtn = $('#pollYes');
  const noBtn = $('#pollNo');
  const warning = $('#pollWarning');
  const client = getSupabaseClient();
  if (!client){
    const status = $('#pollStatus');
    if (status) status.textContent = 'Supabase no disponible';
    return;
  }
  if (yesBtn){
    yesBtn.addEventListener('click', voteYes);
  }
  if (noBtn){
    let dodgeTimer = null;
    const hideWarning = ()=>{
      if (warning){
        warning.classList.remove('show');
      }
      if (pollState.warnTimer){
        clearTimeout(pollState.warnTimer);
        pollState.warnTimer = null;
      }
    };
    const showWarning = ()=>{
      if (!warning) return;
      warning.classList.add('show');
      if (pollState.warnTimer) clearTimeout(pollState.warnTimer);
      pollState.warnTimer = setTimeout(()=> {
        warning.classList.remove('show');
        pollState.warnTimer = null;
      }, 3500);
    };
    const resetNo = ()=>{
      noBtn.style.transform = '';
      noBtn.classList.remove('runaway','fading','hint');
      noBtn.style.opacity = '';
      noBtn.style.pointerEvents = '';
      dodgeTimer = null;
    };
    const dodge = ()=>{
      if (dodgeTimer) return;
      pollState.noAttempts = (pollState.noAttempts || 0) + 1;
      if (pollState.noAttempts >= 3){
        showWarning();
        pollState.noAttempts = 0;
      }
      const dx = (Math.random()*70 + 50) * (Math.random()>0.5?1:-1);
      const dy = (Math.random()*50 + 25) * (Math.random()>0.5?1:-1);
      noBtn.classList.add('runaway');
      noBtn.style.transform = `translate(${dx}px, ${dy}px)`;
      noBtn.style.pointerEvents = 'none';
      dodgeTimer = setTimeout(resetNo, 260);
    };
    noBtn.addEventListener('pointerenter', dodge);
    noBtn.addEventListener('pointerdown', dodge);
  }
  loadPoll();
}

function lockBackground(){
  document.body.style.background = '';
  document.body.classList.add('bg-locked');
}
document.addEventListener('DOMContentLoaded', lockBackground);

function setupTwitchEmbed(){
  const mount = document.getElementById('twitchPlayer');
  if(!mount) return;

  const parentHosts = window.location.hostname ? [window.location.hostname] : ['localhost'];
  const renderError = (msg)=>{
    mount.innerHTML = '';
    const fallback = document.createElement('p');
    fallback.className = 'muted small';
    fallback.textContent = msg;
    mount.appendChild(fallback);
  };
  const spawnPlayer = ()=>{
    if(!(window.Twitch && window.Twitch.Embed)){
      renderError('No se pudo cargar el reproductor de Twitch.');
      return;
    }
    mount.innerHTML = '';
    const width = mount.offsetWidth || 360;
    const height = Math.max(Math.round(width * 9 / 16), TWITCH_MIN_HEIGHT);
    try{
      new Twitch.Embed(mount.id, {
        channel: TWITCH_CHANNEL,
        width: '100%',
        height,
        parent: parentHosts,
        autoplay: false,
        muted: true
      });
    }catch(err){
      console.warn('Twitch embed error', err);
      renderError('Ocurrió un problema al iniciar Twitch.');
    }
  };

  if(window.Twitch?.Embed){
    spawnPlayer();
    return;
  }

  let script = document.querySelector(`script[src="${TWITCH_EMBED_SCRIPT}"]`);
  if(script){
    script.addEventListener('load', spawnPlayer, { once:true });
    return;
  }

  script = document.createElement('script');
  script.src = TWITCH_EMBED_SCRIPT;
  script.async = true;
  script.setAttribute('data-purpose', 'twitch-embed');
  script.addEventListener('load', spawnPlayer, { once:true });
  script.addEventListener('error', ()=> renderError('Twitch no está disponible ahora.'), { once:true });
  document.body.appendChild(script);
}
document.addEventListener('DOMContentLoaded', setupTwitchEmbed);

function ensureFruitRainRoot(){
  if (fruitRainState.root) return fruitRainState.root;
  fruitRainState.root = document.getElementById('fruitRain');
  return fruitRainState.root;
}
function createFruitNode(type){
  const rootClass = type === 'mango'
    ? 'mango'
    : type === 'sandia'
      ? 'sandia'
      : 'apple';
  const node = document.createElement('span');
  node.className = `fruit ${rootClass}`;
  const size = 18 + Math.random() * 18;
  node.style.setProperty('--size', `${size.toFixed(2)}px`);
  node.style.setProperty('--x', `${Math.random() * 100}%`);
  node.style.setProperty('--duration', `${(7 + Math.random() * 6).toFixed(2)}s`);
  node.style.setProperty('--delay', `${(Math.random() * 6).toFixed(2)}s`);
  node.style.setProperty('--alpha', (0.45 + Math.random() * 0.4).toFixed(2));
  node.style.setProperty('--spin-start', `${(-35 + Math.random() * 70).toFixed(2)}deg`);
  node.style.setProperty('--spin-end', `${(-20 + Math.random() * 70).toFixed(2)}deg`);
  return node;
}
function enableFruitRain(config = {}){
  const mount = ensureFruitRainRoot();
  if (!mount) return;
  const fruits = Array.isArray(config.fruits) && config.fruits.length
    ? config.fruits
    : FRUIT_RAIN_DEFAULTS;
  const density = Math.max(6, Math.min(36, Number(config.density) || 18));
  mount.innerHTML = '';
  for (let i = 0; i < density; i++){
    const type = fruits[Math.floor(Math.random() * fruits.length)] || FRUIT_RAIN_DEFAULTS[0];
    mount.appendChild(createFruitNode(type));
  }
  mount.dataset.active = 'true';
  fruitRainState.active = true;
  fruitRainState.current = config;
}
function disableFruitRain(){
  const mount = ensureFruitRainRoot();
  if (mount){
    mount.innerHTML = '';
    delete mount.dataset.active;
  }
  fruitRainState.active = false;
  fruitRainState.current = null;
}
function syncFruitRain(entry){
  // Lluvia desactivada a petición: siempre limpiamos
  disableFruitRain();
}

function initStarfield(){
  const mount = document.getElementById('starfield');
  if (!mount) return;
  starfieldState.root = mount;
  starfieldState.stars = [];
  mount.innerHTML = '';
  STAR_LAYERS.forEach(layer=>{
    const count = layer.count || 0;
    const minSize = layer.size?.[0] ?? 1;
    const maxSize = layer.size?.[1] ?? (minSize + 1);
    const opacityRange = Array.isArray(layer.opacity) && layer.opacity.length === 2
      ? layer.opacity
      : [0.4, 0.85];
    for (let i = 0; i < count; i++){
      const star = document.createElement('span');
      star.className = 'star';
      const size = randBetween(minSize, maxSize);
      star.style.width = `${size.toFixed(2)}px`;
      star.style.height = `${size.toFixed(2)}px`;
      star.style.left = `${(Math.random() * 100).toFixed(2)}%`;
      star.style.top = `${(Math.random() * 100).toFixed(2)}%`;
      star.style.opacity = randBetween(opacityRange[0], opacityRange[1]).toFixed(2);
      star.dataset.parallax = String(layer.parallax || 18);
      mount.appendChild(star);
      starfieldState.stars.push(star);
    }
  });
  if (!starfieldState.handlersBound){
    starfieldState.moveHandler = (evt)=> updateStarfieldPointer(evt.clientX, evt.clientY);
    starfieldState.leaveHandler = ()=> updateStarfieldPointer(null, null);
    window.addEventListener('pointermove', starfieldState.moveHandler, { passive:true });
    window.addEventListener('pointerleave', starfieldState.leaveHandler, { passive:true });
    window.addEventListener('blur', starfieldState.leaveHandler);
    window.addEventListener('resize', ()=> requestStarfieldFrame(), { passive:true });
    starfieldState.handlersBound = true;
  }
  updateStarfieldPointer(null, null);
}
function updateStarfieldPointer(clientX, clientY){
  const { innerWidth, innerHeight } = window;
  if (!innerWidth || !innerHeight) return;
  if (typeof clientX !== 'number' || typeof clientY !== 'number'){
    starfieldState.pointer.x = 0;
    starfieldState.pointer.y = 0;
  } else {
    starfieldState.pointer.x = ((clientX / innerWidth) - 0.5) * STARFIELD_INTENSITY;
    starfieldState.pointer.y = ((clientY / innerHeight) - 0.5) * STARFIELD_INTENSITY;
  }
  requestStarfieldFrame();
}
function requestStarfieldFrame(){
  if (starfieldState.raf) return;
  starfieldState.raf = requestAnimationFrame(applyStarfieldParallax);
}
function applyStarfieldParallax(){
  starfieldState.raf = null;
  if (!starfieldState.stars.length) return;
  const { x, y } = starfieldState.pointer;
  starfieldState.stars.forEach(star=>{
    const depth = Number(star.dataset.parallax) || 12;
    const tx = x * depth;
    const ty = y * depth;
    star.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
  });
}

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

function rgbToHsl(r, g, b){
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0){
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch(max){
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
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
    const [hue, sat, light] = rgbToHsl(r, g, b);
    if (sat < 0.08 && light < 0.22) continue; // ignora grises muy oscuros

    // Agrupa en cubetas pequeñas pero suficientes para mantener variación
    const key = `${Math.round(r/12)}-${Math.round(g/12)}-${Math.round(b/12)}`;
    const entry = map.get(key) || { count:0, sumR:0, sumG:0, sumB:0, score:0 };
    entry.count++;
    entry.sumR += r; entry.sumG += g; entry.sumB += b;
    // pondera saturación y luz para premiar colores vivos y medios
    const satBoost = 0.6 + sat; // 0.6–1.6
    const lightCenter = 1 - Math.abs(light - 0.5) * 1.2; // premia luz media
    const pixScore = satBoost * (0.6 + Math.max(0, lightCenter));
    entry.score += pixScore;
    map.set(key, entry);
  }
  const sorted = [...map.values()]
    .map(v=>{
      const avgR = Math.round(v.sumR / v.count);
      const avgG = Math.round(v.sumG / v.count);
      const avgB = Math.round(v.sumB / v.count);
      const weight = v.score * Math.log1p(v.count);
      return { color:`rgb(${avgR}, ${avgG}, ${avgB})`, weight };
    })
    .sort((a,b)=>b.weight - a.weight)
    .slice(0, n);

  if (!sorted.length) return ['rgb(167, 139, 250)', 'rgb(255, 91, 211)'];
  return sorted.map(it => it.color);
}
function applyPalette(cols){
  if(!cols || !cols.length) return;
  const primary = cols[0];
  const secondary = cols[1] || primary;
  const root = document.documentElement?.style;
  if (!root) return;

  root.setProperty('--accent', primary);
  root.setProperty('--accent-2', secondary);
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
  feelingsState.bannerNode = document.querySelector('#feelingBanner') || null;
  feelingsState.logNode = document.querySelector('#feelingLog') || null;
  status.textContent = 'Configura Supabase para activarlos.';
  renderFeelingLog();
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
    updateNotificationStatus('Notificaciones activadas');
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

function renderFeelingLog(){
  const list = feelingsState.logNode;
  if (!list) return;
  if (!feelingsState.logEntries.length){
    list.innerHTML = '<li class="muted">Aún no hay botoncitos.</li>';
    return;
  }
  list.innerHTML = feelingsState.logEntries.map(entry=>{
    const safeMsg = escapeHTML(entry.message || 'Sin texto');
    const rel = formatRelativeTime(entry.iso);
    const exact = entry.exact ? ` · ${escapeHTML(entry.exact)}` : '';
    const datetimeAttr = entry.iso ? ` datetime="${entry.iso}"` : '';
    return `<li><strong>${safeMsg}</strong><time${datetimeAttr}>${rel}${exact}</time></li>`;
  }).join('');
}
function resetFeelingLog(){
  feelingsState.logEntries = [];
  renderFeelingLog();
}
function addFeelingLogEntry(message, createdAt){
  const iso = createdAt || new Date().toISOString();
  let exact = '';
  try{
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())){
      exact = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    }
  }catch{}
  feelingsState.logEntries.unshift({ message, iso, exact });
  if (feelingsState.logEntries.length > 12) feelingsState.logEntries.pop();
  renderFeelingLog();
}

function showFeelingToast(message, meta = {}){
  const toast = feelingsState.toastNode;
  if(!toast) return;
  const lines = [message || 'Nuevo mensaje'];
  if (meta.timeText) lines.push(meta.timeText);
  toast.textContent = lines.join('\n');
  toast.classList.remove('hidden');
  toast.classList.add('show');
  clearTimeout(feelingsState.toastTimer);
  feelingsState.toastTimer = setTimeout(()=>{
    toast.classList.remove('show');
    setTimeout(()=> toast.classList.add('hidden'), 320);
  }, 10500);
}

function showFeelingBanner(message, meta = {}){
  const banner = feelingsState.bannerNode;
  if(!banner) return;
  const parts = [message || 'Nuevo mensaje'];
  if (meta.timeText) parts.push(meta.timeText);
  banner.textContent = parts.join(' · ');
  banner.classList.remove('hidden');
  banner.classList.add('show');
  clearTimeout(feelingsState.bannerTimer);
  feelingsState.bannerTimer = setTimeout(()=>{
    banner.classList.remove('show');
    setTimeout(()=> banner.classList.add('hidden'), 280);
  }, 5200);
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
    setFeelingStatus('Enviado ');
  }catch(err){
    console.warn('Feeling send error', err);
    showFeelingToast('No se pudo enviar');
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
  const timeText = formatRelativeTime(createdAt);
  const meta = { timeText };
  showFeelingToast(text, meta);
  showFeelingBanner(text, meta);
  playNotificationSound();
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    fireSystemNotification(text);
  }
  addFeelingLogEntry(text, createdAt);
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
  resetFeelingLog();

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
  syncFruitRain(null);
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
    a.rel = 'noopener'; // actualizado
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
function calcDaysSince(dateStr){
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / dayMs);
}
function formatShortDate(dateStr){
  try{
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' });
  }catch{
    return '';
  }
}
function getSupabaseClient(){
  if (feelingsState?.client) return feelingsState.client;
  if (reactionState?.client) return reactionState.client;
  if (window.supabase?.createClient && window.SUPABASE_URL && window.SUPABASE_ANON_KEY){
    try{
      return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }catch(err){
      console.warn('No se pudo crear cliente supabase', err);
      return null;
    }
  }
  return null;
}
function splitMessageIntoLines(message){
  if (!message) return [];
  return String(message)
    .split(/\r?\n/)
    .map(part => part.trim())
    .filter(Boolean);
}
function parseImessageLine(line){
  const markdownImg = line.match(/^!\[(.*?)\]\((.+?)\)$/);
  if (markdownImg){
    return { type:'image', src: markdownImg[2], alt: markdownImg[1] || 'Foto', raw: line };
  }
  const simpleImg = line.match(/^\[?img\]?:?\s*(.+)$/i);
  if (simpleImg){
    const src = simpleImg[1].trim();
    return { type:'image', src, alt: 'Foto', raw: `img:${src}` };
  }
  return { type:'text', text: line, raw: line };
}
function attachReactionControls(wrapper, bubble, lineKey){
  if (!bubble || !wrapper) return;
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  const stamp = document.createElement('button');
  stamp.type = 'button';
  stamp.className = 'reaction-stamp reaction-trigger';

  const apply = (emoji, { persist=true } = {})=>{
    if (persist){
      setReactionFor(lineKey, emoji);
    }else{
      applyReactionLocal(lineKey, emoji, { persist:false });
    }
    const current = getReactionFor(lineKey);
    if (current){
      stamp.textContent = current;
      stamp.dataset.active = 'true';
      stamp.classList.add('show');
      stamp.classList.remove('is-empty');
    }else{
      stamp.textContent = '🙂';
      stamp.dataset.active = 'false';
      stamp.classList.add('is-empty');
      stamp.classList.remove('show');
    }
  };

  const current = getReactionFor(lineKey);
  apply(current, { persist:false });

  REACTION_OPTIONS.forEach(emoji=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'reaction-option';
    btn.textContent = emoji;
    btn.setAttribute('aria-label', `Reaccionar con ${emoji}`);
    if (current === emoji) btn.dataset.selected = 'true';
    btn.addEventListener('click', ()=>{
      const next = getReactionFor(lineKey) === emoji ? '' : emoji;
      apply(next);
      picker.classList.remove('open');
      Array.from(picker.querySelectorAll('.reaction-option')).forEach(o=> delete o.dataset.selected);
      if (next === emoji) btn.dataset.selected = 'true';
    });
    picker.appendChild(btn);
  });

  let hoverTimer = null;
  const openPicker = ()=> {
    clearTimeout(hoverTimer);
    picker.classList.add('open');
  };
  const closePicker = ()=> {
    hoverTimer = setTimeout(()=> picker.classList.remove('open'), 140);
  };

  stamp.addEventListener('click', ()=>{
    picker.classList.toggle('open');
  });
  stamp.addEventListener('mouseenter', openPicker);
  stamp.addEventListener('mouseleave', closePicker);
  picker.addEventListener('mouseenter', openPicker);
  picker.addEventListener('mouseleave', closePicker);

  wrapper.appendChild(picker);
  wrapper.appendChild(bubble);
  wrapper.appendChild(stamp);
}
function renderImessageBubbles(message){
  const thread = document.getElementById('imessageThread');
  if (!thread) return [];
  thread.dataset.ready = 'false';
  thread.innerHTML = '';
  const lines = splitMessageIntoLines(message).map(parseImessageLine);
  lines.forEach((item, idx)=>{
    const wrap = document.createElement('div');
    wrap.className = 'imessage-bubble-wrap';
    const bubble = document.createElement('div');
    bubble.className = 'imessage-bubble';
    bubble.setAttribute('role', 'article');
    bubble.setAttribute('aria-live', 'polite');
    const lineKey = item.raw || `line-${idx}`;
    bubble.dataset.lineKey = lineKey;
    if (item.raw) bubble.dataset.lineValue = item.raw;
    if (item.type === 'image' && item.src){
      bubble.classList.add('imessage-bubble--media');
      const img = document.createElement('img');
      img.className = 'imessage-photo';
      img.src = item.src;
      img.alt = item.alt || 'Foto';
      bubble.appendChild(img);
    }else{
      const p = document.createElement('p');
      p.className = 'spell-text';
      if (idx === 0) p.id = 'note';
      p.textContent = item.text || '';
      bubble.appendChild(p);
      if (!bubble.dataset.lineValue) bubble.dataset.lineValue = item.text || '';
    }
    attachReactionControls(wrap, bubble, lineKey);
    thread.appendChild(wrap);
  });
  const markReady = ()=> { thread.dataset.ready = 'true'; };
  requestAnimationFrame(()=> requestAnimationFrame(markReady));
  const body = document.querySelector('.imessage-body');
  if (body) body.scrollTop = 0;
  return lines;
}
function collectImessageMessage(){
  const bubbles = Array.from(document.querySelectorAll('#imessageThread .imessage-bubble'));
  if (!bubbles.length) return '';
  return bubbles
    .map(node => {
      const raw = node.dataset.lineValue || '';
      if (raw) return raw;
      const text = node.querySelector('.spell-text')?.textContent || '';
      return text;
    })
    .filter(Boolean)
    .join('\n');
}
function buildImessageTimestamp(ts){
  if (ts) return ts;
  try{
    return `iMessage · ${new Date().toLocaleTimeString('es-MX',{ hour:'numeric', minute:'2-digit' })}`;
  }catch{
    return 'iMessage';
  }
}
function updateImessageContact(config = {}){
  const name = config.name || 'Amor';
  const avatar = config.avatar || DEFAULT_CONTACT_AVATAR;
  const subtitle = config.subtitle || 'iMessage';
  const timestamp = buildImessageTimestamp(config.timestamp);
  const nameNode = $('#imessageName');
  const avatarNode = $('#imessageAvatar');
  const subtitleNode = $('#imessageStatusLine');
  const timeNode = $('#imessageTimestamp');
  if (nameNode) nameNode.textContent = name;
  if (avatarNode){
    avatarNode.src = avatar;
    avatarNode.alt = `Foto de ${name}`;
  }
  if (subtitleNode) subtitleNode.textContent = subtitle;
  if (timeNode) timeNode.textContent = timestamp;
}
function cancelImessageTimers(){
  if (imessageState.typingTimer){
    clearTimeout(imessageState.typingTimer);
    imessageState.typingTimer = null;
  }
  if (imessageState.revealTimer){
    clearTimeout(imessageState.revealTimer);
    imessageState.revealTimer = null;
  }
}
function resetImessageVisuals(){
  $('#imessageTyping')?.classList.remove('hidden');
  document.querySelectorAll('#imessageThread .imessage-bubble').forEach(bubble=>{
    bubble.classList.remove('show');
  });
}
function maybeStartImessageSequence(){
  const card = document.querySelector('.magical-note');
  const typing = $('#imessageTyping');
  const bubbles = Array.from(document.querySelectorAll('#imessageThread .imessage-bubble'));
  if (!card || !typing || !bubbles.length){
    return;
  }
  if (!card.classList.contains('lit') || !imessageState.messageReady){
    return;
  }
  cancelImessageTimers();
  resetImessageVisuals();
  imessageState.typingTimer = window.setTimeout(()=>{
    typing.classList.add('hidden');
  }, 2200);
  imessageState.revealTimer = window.setTimeout(()=>{
    bubbles.forEach(bubble => bubble.classList.add('show'));
  }, 2600);
}
function initMagicNote(){
  const cards = Array.from(document.querySelectorAll('.magical-note'));
  if (!cards.length) return;

  cards.forEach(card => {
    const switchBtn = card.querySelector('.light-switch');
    const switchLabel = switchBtn?.querySelector('.switch-label');
    const autoMode = card.dataset.autoPlay || 'manual';
    let isOn = switchBtn ? (autoMode === 'always' || (autoMode === 'viewer' && VIEW_MODE)) : true;
    const applyState = () => {
      card.classList.toggle('lit', isOn);
      if (switchBtn && switchLabel){
        switchBtn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        switchLabel.textContent = isOn ? 'Apagar la luz' : 'Encender la luz';
      }
      if (isOn){
        maybeStartImessageSequence();
      }else{
        cancelImessageTimers();
        resetImessageVisuals();
      }
    };

    applyState();
    if (switchBtn){
      switchBtn.addEventListener('click', ()=>{
        isOn = !isOn;
        applyState();
      });
    }
  });
}

function formatRelativeTime(iso){
  try{
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.getTime())) throw new Error('invalid date');
    const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diffSec < 10) return 'Justo ahora';
    if (diffSec < 60) return `Hace ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `Hace ${diffHour} h`;
    const diffDay = Math.floor(diffHour / 24);
    return `Hace ${diffDay} d`;
  }catch{
    return 'Justo ahora';
  }
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
    const baseHeroVideo = j.hero_video || j.video || null;
    const cloudVideoSrc = j.cloud_video_embed || j.cloud_video_url || null;
    let heroVideo = baseHeroVideo;
    if (cloudVideoSrc) {
      heroVideo = {
        ...(baseHeroVideo || {}),
        src: cloudVideoSrc
      };
      embed.dataset.cloudVideo = cloudVideoSrc;
    } else {
      delete embed.dataset.cloudVideo;
    }
    const spotifyUrl = deriveSpotifyUrl(j);
    const hasVideo = buildHeroVideo(embed, heroVideo, spotifyUrl);
    if (!hasVideo) {
      let src = j.spotify_embed ? j.spotify_embed : null;
      if (!src && j.spotify_embed_html) src = extractSpotifySrc(j.spotify_embed_html);
      if (src) {
        embed.innerHTML = `<iframe src="${src}" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
      }
    }

    const weeklySection = document.getElementById('weeklyObsession');
    const weeklyMount = document.getElementById('weeklyPlaylist');
    if (weeklySection && weeklyMount) {
      weeklyMount.innerHTML = '';
      let weeklySrc = j.weekly_playlist_embed || null;
      if (!weeklySrc && j.weekly_playlist_embed_html) {
        weeklySrc = extractSpotifySrc(j.weekly_playlist_embed_html);
      }
      if (weeklySrc) {
        weeklyMount.innerHTML = `<iframe src="${weeklySrc}" width="100%" height="352" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
        weeklySection.removeAttribute('data-empty');
      } else {
        weeklyMount.innerHTML = '<p class="muted small">Agrega un enlace embed en today.json dentro de "weekly_playlist_embed" para mostrar la playlist de la semana.</p>';
        weeklySection.setAttribute('data-empty', 'true');
      }
    }

    

    // Paleta (no se pq no sirve)
    if (j.cover) { try { const cols = await extractPalette(j.cover, 5); applyPalette(cols); } catch {} }




    // Textos
    $('#lyric').innerHTML = highlightDATA(j.lyric_highlight || '');
    const messageLines = renderImessageBubbles(j.message || '');
    updateImessageContact({
      ...(j.message_contact || {}),
      name: j.message_contact?.name || j.contact_name,
      avatar: j.message_contact?.avatar || j.contact_avatar,
      subtitle: j.message_contact?.subtitle || j.message_contact?.status,
      timestamp: j.message_contact?.timestamp || j.message_timestamp
    });
    cancelImessageTimers();
    resetImessageVisuals();
    imessageState.messageReady = messageLines.length > 0;
    if (imessageState.messageReady) maybeStartImessageSequence();
    syncReactionsRemote();
    //$('#bibleRef').textContent = j.bible_ref || 'Pasaje';
    $('#bibleRef').textContent = j.bible_ref || '';
    $('#bibleText').textContent = j.bible_text || '';

    // Extras
    $('#date').textContent = j.date || '';
    $('#duration').textContent = '';
    const togetherSince = j.together_since || j.togetherSince || '';
    const togetherCard = $('#togetherCard');
    if (togetherCard) {
      const daysTogether = calcDaysSince(togetherSince);
      const sinceText = formatShortDate(togetherSince);
      const daysNode = $('#togetherDaysBig');
      const labelNode = $('#togetherDaysLabel');
      const dateNode = $('#togetherDate');
      if (daysTogether !== null) {
        if (daysNode) {
          const unit = daysTogether === 1 ? 'día' : 'días';
          daysNode.textContent = `${daysTogether} ${unit}`;
        }
        if (dateNode) dateNode.textContent = sinceText || togetherSince || '—';
        if (labelNode) {
          const milestone = (daysTogether >= 30 && daysTogether <= 32) ? '1 mes hoy ' : 'y contando';
          labelNode.textContent = milestone;
        }
        togetherCard.classList.remove('hidden');
        togetherCard.dataset.since = togetherSince;
      } else {
        togetherCard.classList.add('hidden');
        delete togetherCard.dataset.since;
      }
    }
    $('#tracks').innerHTML = '';
    $('#totalDur').textContent = '';

    const pollCard = $('#lovePoll');
    if (pollCard) {
      const isEnabled = j.poll_enabled === true || j.poll_enabled === 'true';
      const isDisabled = j.poll_disabled === true || j.poll_hidden === true;
      const shouldHidePoll = !isEnabled || isDisabled;
      pollCard.classList.toggle('hidden', shouldHidePoll);
    }

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
    syncFruitRain(j);

    $('#result').classList.remove('hidden');
  }catch(e){
    console.warn('No se pudo cargar today.json', e);
  }
}

function exportJSON(){
  const embedContainer = $('#embedContainer');
  const iframe = embedContainer?.querySelector('iframe');
  const src = iframe?.getAttribute('src') || '';
  const weeklyIframe = $('#weeklyPlaylist')?.querySelector('iframe');
  const weeklySrc = weeklyIframe?.getAttribute('src') || '';
  const data = {
    title: $('#title')?.textContent || '',
    artist: $('#artistLink')?.textContent || '',
    date: $('#date')?.textContent.replace('Duración:','').trim() || '',
    cover: $('#cover')?.src || '',
    spotify_embed_html: iframe ? iframe.outerHTML : '',
    spotify_embed: src,
    cloud_video_embed: embedContainer?.dataset?.cloudVideo || '',
    weekly_playlist_embed_html: weeklyIframe ? weeklyIframe.outerHTML : '',
    weekly_playlist_embed: weeklySrc,
    lyric_highlight: $('#lyric')?.textContent || '',
    message: collectImessageMessage(),
    message_contact: {
      name: $('#imessageName')?.textContent || '',
      avatar: $('#imessageAvatar')?.getAttribute('src') || '',
      subtitle: $('#imessageStatusLine')?.textContent || '',
      timestamp: $('#imessageTimestamp')?.textContent || ''
    },
    bible_ref: $('#bibleRef')?.textContent || '',
    bible_text: $('#bibleText')?.textContent || '',
    together_since: $('#togetherCard')?.dataset?.since || ''
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
  if (VIEW_MODE) {
    const pollCard = document.getElementById('lovePoll');
    if (pollCard) pollCard.classList.add('hidden');
  }
  initStarfield();
  initNotificationGuard();
  primeAudioContextOnInteraction();
  initFeelingSignals();
  initMagicNote();
  initPoll();

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
