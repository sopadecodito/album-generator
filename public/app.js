// ========= Config =========
if (typeof window.SPOTIFY_TOKEN_ENDPOINT === "undefined") {
  window.SPOTIFY_TOKEN_ENDPOINT = "/api/spotify-token";
}
// Viewer por defecto (Dianita view).
const params = new URLSearchParams(location.search);
const VIEW_MODE = params.get("view") !== "0";

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
    let src = j.spotify_embed ? j.spotify_embed : null;
    if (!src && j.spotify_embed_html) src = extractSpotifySrc(j.spotify_embed_html);
    if (src) {
      embed.innerHTML = `<iframe src="${src}" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
    }

    // Paleta (no se pq no sirve)
    if (j.cover) { try { const cols = await extractPalette(j.cover, 5); applyPalette(cols); } catch {} }

    // Textos
    $('#lyric').textContent = j.lyric_highlight || '';
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


// Desgarrar la carta
// No pude hacer que se desgarrara, sabes lo dificil que es hacer formas en css? sajkldajsd
document.querySelectorAll('.envelope').forEach(env=>{
  const toggle = ()=>{
    const isOpen = env.classList.toggle('open');
    env.setAttribute('aria-expanded', String(isOpen));
  };
  env.addEventListener('click', toggle);
  env.addEventListener('keydown', e=>{
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
});


});
