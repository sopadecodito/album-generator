// ========= helpers =========

<script>
  // En Vercel las serverless viven bajo el mismo dominio:
  window.SPOTIFY_TOKEN_ENDPOINT = "/api/spotify-token";
</script>

const $ = sel => document.querySelector(sel);
const getParam = k => new URLSearchParams(location.search).get(k);

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

// ========= oEmbed (sin claves) =========
async function fetchOEmbed(url){
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {cache:'no-store'});
  if(!res.ok) throw new Error('oEmbed fail '+res.status);
  return res.json(); // {title, author_name, thumbnail_url, html}
}

// ========= Token opcional (para datos pro) =========
async function getToken(){
  const endpoint = window.SPOTIFY_TOKEN_ENDPOINT || "";
  if(!endpoint) return null;
  try{
    const r = await fetch(endpoint);
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

// ========= Palette (desde portada) =========
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
  const bg = `
    radial-gradient(60vmax 60vmax at 8% 0%, ${cols[0]}22, transparent 60%),
    radial-gradient(60vmax 60vmax at 90% 10%, ${cols[1]||cols[0]}22, transparent 60%),
    linear-gradient(180deg, var(--bg-2), var(--bg-1))`;
  document.body.style.background = bg;

  const pal = $('#palette'); pal.innerHTML='';
  cols.forEach(c=>{
    const sw = document.createElement('div');
    sw.className='sw'; sw.style.background = c; pal.appendChild(sw);
  });
}

// ========= Render principal =========
async function renderFromUrl(spotifyUrl){
  const parsed = parseSpotify(spotifyUrl);
  const o = await fetchOEmbed(spotifyUrl);

  // título / artista desde oEmbed
  let title = o.title, artist = o.author_name;
  if(o.title && o.title.includes(' — ')){
    const [t,a] = o.title.split(' — ');
    title = t; artist = a;
  }
  $('#title').textContent = title || '—';
  $('#artistLink').textContent = artist || '—';
  $('#artistLink').href = `https://open.spotify.com/search/${encodeURIComponent(artist||'')}`;

  // portada
  const cover = o.thumbnail_url;
  $('#cover').src = cover || '';

  // embed (oEmbed trae o.html listo)
  const embedContainer = $('#embedContainer');
  const cleanHtml = o.html || (parsed ? `<iframe src="https://open.spotify.com/embed/${parsed.type}/${parsed.id}" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>` : "");
  embedContainer.innerHTML = cleanHtml;

  $('#result').classList.remove('hidden');

  // paleta
  if(cover){ try{ const cols = await extractPalette(cover, 5); applyPalette(cols); }catch{} }

  // Limpia secciones pro
  $('#date').textContent = '';
  $('#duration').textContent = '';
  $('#tracks').innerHTML = '';
  $('#totalDur').textContent = '';

  // datos pro con API si hay token
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
        $('#date').textContent = pl.description ? 'Playlist' : '';
        let totalMs = 0;
        const ol = $('#tracks'); ol.innerHTML='';
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
    }catch(e){
      // si falla token o permisos, nos quedamos con datos de oEmbed
      console.warn(e);
    }
  }
}

// ========= Exportar JSON para tu otra página =========
function exportJSON(){
  const url = $('#spotifyUrl').value.trim();
  const iframe = $('#embedContainer')?.querySelector('iframe');
  const src = iframe?.getAttribute('src') || '';
  const data = {
    title: $('#title').textContent || '',
    artist: $('#artistLink').textContent || '',
    date: $('#date').textContent.replace('Duración:','').trim(),
    cover: $('#cover').src || '',
    spotify_embed_html: iframe ? iframe.outerHTML : '',
    spotify_embed: src,
    lyric_highlight: "",
    message: "",
    bible_ref: "",
    bible_text: ""
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'today.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ========= UI =========
$('#btnGen').addEventListener('click', ()=>{
  const url = $('#spotifyUrl').value.trim();
  if(!url) return;
  renderFromUrl(url);
});
$('#btnExport').addEventListener('click', exportJSON);

// Soporta ?spotify= en la URL
const qp = getParam('spotify');
if(qp){ $('#spotifyUrl').value = qp; renderFromUrl(qp); }
