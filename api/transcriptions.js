const FIREBASE_PROJECT_ID = 'kimyalab-d5009';
const GROQ_TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MAX_AUDIO_REQUEST_BYTES = 4_000_000;

function shouldTryBackupKey(status) {
  return [401, 403, 408, 429, 498].includes(status) || status >= 500;
}

async function readRequestBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const incomingChunk of req) {
    const chunk = Buffer.isBuffer(incomingChunk) ? incomingChunk : Buffer.from(incomingChunk);
    totalBytes += chunk.length;
    if (totalBytes <= MAX_AUDIO_REQUEST_BYTES) chunks.push(chunk);
  }

  if (totalBytes > MAX_AUDIO_REQUEST_BYTES) {
    const error = new Error('Ses kaydı izin verilen boyutu aşıyor.');
    error.code = 'AUDIO_REQUEST_TOO_LARGE';
    throw error;
  }

  return Buffer.concat(chunks, totalBytes);
}

function readFirebaseTokenClaims(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      claims.aud !== FIREBASE_PROJECT_ID ||
      claims.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` ||
      !claims.sub ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= nowSeconds
    ) return null;

    return claims;
  } catch (error) {
    return null;
  }
}

async function isActiveTeacher(token, uid) {
  const profileUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/profiles/${encodeURIComponent(uid)}`;
  const response = await fetch(profileUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return false;

  const profile = await response.json();
  const fields = profile.fields || {};
  const role = fields.role?.stringValue || '';
  const isActive = Number(fields.is_active?.integerValue || 0) === 1;
  return role === 'admin' || isActive;
}

module.exports = async function transcriptionsHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: { message: 'Yalnızca POST isteği destekleniyor.' } });
  }

  const groqApiKeys = [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_BACKUP]
    .map(key => typeof key === 'string' ? key.trim() : '')
    .filter((key, index, keys) => key && keys.indexOf(key) === index);
  if (groqApiKeys.length === 0) {
    return res.status(503).json({ error: { message: 'Whisper sunucu anahtarı henüz ayarlanmamış.' } });
  }

  const authorization = req.headers.authorization || '';
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const idToken = tokenMatch?.[1];
  const claims = idToken ? readFirebaseTokenClaims(idToken) : null;
  if (!claims) {
    return res.status(401).json({ error: { message: 'Oturum doğrulanamadı. Lütfen yeniden giriş yapın.' } });
  }

  try {
    if (!(await isActiveTeacher(idToken, claims.sub))) {
      return res.status(403).json({ error: { message: 'Whisper kullanımı için etkin öğretmen hesabı gerekli.' } });
    }
  } catch (error) {
    console.error('Whisper kullanıcı doğrulaması başarısız:', error);
    return res.status(503).json({ error: { message: 'Kullanıcı doğrulanamadı. Lütfen tekrar deneyin.' } });
  }

  const contentType = req.headers['content-type'];
  if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('multipart/form-data;')) {
    return res.status(415).json({ error: { message: 'Ses kaydı biçimi desteklenmiyor.' } });
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > MAX_AUDIO_REQUEST_BYTES) {
    return res.status(413).json({ error: { message: 'Ses kaydı izin verilen boyutu aşıyor.' } });
  }

  const controller = new AbortController();
  req.on('aborted', () => controller.abort());

  try {
    // Keep one bounded copy so the same multipart audio body can be retried with the backup key.
    const audioBody = await readRequestBody(req);
    if (controller.signal.aborted) return;

    let groqResponse;
    let usedBackupKey = false;
    for (let keyIndex = 0; keyIndex < groqApiKeys.length; keyIndex++) {
      const headers = {
        Authorization: `Bearer ${groqApiKeys[keyIndex]}`,
        'Content-Type': contentType,
        'Content-Length': String(audioBody.length)
      };

      try {
        groqResponse = await fetch(GROQ_TRANSCRIPTIONS_URL, {
          method: 'POST',
          headers,
          body: audioBody,
          signal: controller.signal
        });
      } catch (error) {
        if (error.name === 'AbortError' || controller.signal.aborted) return;
        if (keyIndex < groqApiKeys.length - 1) continue;
        throw error;
      }

      if (!groqResponse.ok && shouldTryBackupKey(groqResponse.status) && keyIndex < groqApiKeys.length - 1) {
        if (groqResponse.body) await groqResponse.body.cancel().catch(() => {});
        continue;
      }
      usedBackupKey = groqResponse.ok && keyIndex > 0;
      break;
    }

    const responseBody = await groqResponse.text();
    res.status(groqResponse.status);
    res.setHeader('Content-Type', groqResponse.headers.get('content-type') || 'application/json');
    if (usedBackupKey) res.setHeader('X-Whisper-Key-Fallback', 'backup');
    return res.send(responseBody);
  } catch (error) {
    if (error.name === 'AbortError' || controller.signal.aborted) return;
    if (error.code === 'AUDIO_REQUEST_TOO_LARGE') {
      return res.status(413).json({ error: { message: error.message } });
    }
    console.error('Groq Whisper proxy hatası:', error);
    return res.status(502).json({ error: { message: 'Whisper servisine şu anda ulaşılamıyor.' } });
  }
};

module.exports.config = {
  api: { bodyParser: false }
};
