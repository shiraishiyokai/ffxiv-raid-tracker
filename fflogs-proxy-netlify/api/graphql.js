const TOKEN_CACHE = { token: null, expiresAt: 0 };

async function getAccessToken() {
  if (TOKEN_CACHE.token && TOKEN_CACHE.expiresAt > Date.now() + 60000) {
    return TOKEN_CACHE.token;
  }

  const tokenUrl = 'https://cn.fflogs.com/oauth/token';
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.FFLOGS_CLIENT_ID,
    client_secret: process.env.FFLOGS_CLIENT_SECRET,
  });

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    throw new Error(`OAuth2 token request failed: ${resp.status}`);
  }

  const data = await resp.json();
  TOKEN_CACHE.token = data.access_token;
  TOKEN_CACHE.expiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 300000;

  return TOKEN_CACHE.token;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  try {
    const token = await getAccessToken();
    const fflogsResp = await fetch('https://cn.fflogs.com/api/v2/client', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: event.body,
    });

    const responseData = await fflogsResp.json();
    return {
      statusCode: fflogsResp.status,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify(responseData),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
