export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
// no mames mi amora, no deberias estar viendo esto
// Robate mis credenciales si quieres jaklsdjaskd 
// toma todo lo que quieras de mi
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    res.status(500).json({ error: 'Missing Spotify credentials' });
    return;
  }

  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  try {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store',
    });

    if (!r.ok) {
      const txt = await r.text();
      res.status(r.status).json({ error: txt });
      return;
    }

    const j = await r.json(); // { access_token, token_type, expires_in }
    // (Opcional) podrías cachear en KV/Edge Config; para simple, retornamos directo:
    res.status(200).json({ access_token: j.access_token, token_type: 'Bearer', expires_in: j.expires_in });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
