// ========= Config =========
if (typeof window.SPOTIFY_TOKEN_ENDPOINT === "undefined") {
  window.SPOTIFY_TOKEN_ENDPOINT = "/api/spotify-token";
}
// Viewer por defecto (tu novia). Usa ?view=0 para modo admin.
const params = new URLSearchParams(location.search);
const VIEW_MODE = params.get("view") !== "0";

// ========= Helpers =========
const $ = (sel) => document.querySelector(sel);
const getParam = (k) => new URLSearchParams(location.search).get(k);

function lockBackground(){
  // borra inline previos y añade clase de bloqueo
  document.body.style.background = '';
  document.body.classList.add('bg-locked');
}

document.addEventListener('DOMContentLoaded', () => {
  lockBackground();
});


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

// ========= Render desde URL (modo admin) =========
async function renderFromUrl(spotifyUrl){
  const parsed = parseSpotify(spotifyUrl);
  const o = await fetchOEmbed(spotifyUrl);

  let title = o.title, artist = o.author_name;
  if(o.title && o.title.includes(' — ')){ const [t,a] = o.title.split(' — '); title=t; artist=a; }
  $('#title').textContent = title || '—';
  const art = $('#artistLink'); art.textContent = artist || '—'; art.href = `https://open.spotify.com/search/${encodeURIComponent(artist||'')}`;

  const cover = o.thumbnail_url; if (cover) $('#cover').src = cover;
  const embedContainer = $('#embedContainer');
  const cleanHtml = o.html || (parsed ? `<iframe src="https://open.spotify.com/embed/${parsed.type}/${parsed.id}" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>` : "");
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

    // Player (sanear iframe del JSON)
    const embed = $('#embedContainer'); embed.innerHTML = '';
    let src = j.spotify_embed ? j.spotify_embed : null;
    if (!src && j.spotify_embed_html) src = extractSpotifySrc(j.spotify_embed_html);
    if (src) {
      embed.innerHTML = `<iframe src="${src}" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
    }

    // Paleta
    if (j.cover) { try { const cols = await extractPalette(j.cover, 5); applyPalette(cols); } catch {} }

    // Textos
    $('#lyric').textContent = j.lyric_highlight || '';
    $('#note').textContent  = j.message || '';
    $('#bibleRef').textContent = j.bible_ref || 'Pasaje';
    $('#bibleText').textContent = j.bible_text || '';

    // Campos simples extra
    $('#date').textContent = j.date || '';
    $('#duration').textContent = '';
    $('#tracks').innerHTML = '';
    $('#totalDur').textContent = '';

    $('#result').classList.remove('hidden');
  }catch(e){ console.warn('No se pudo cargar today.json', e); }
}

// ========= Exportar JSON (solo admin) =========
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
  // En viewer ocultamos la toolbar con clase en el body
  if (VIEW_MODE) document.body.classList.add('viewer');

  // Botones (solo si estás en admin)
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
    renderFromTodayJson();  // Tu novia entra y lo ve directo
  }
});
