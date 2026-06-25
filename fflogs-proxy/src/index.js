/**
 * Cloudflare Worker: FFLogs API Proxy
 *
 * Proxies GraphQL requests to cn.fflogs.com/api/v2/client,
 * injecting OAuth2 Bearer token and adding CORS headers.
 *
 * Routes:
 *   POST /graphql  → Forward GraphQL query to FFLogs v2 API
 *   GET  /health   → Health check
 *   OPTIONS *      → CORS preflight
 */

// FFLogs OAuth2 configuration (set via wrangler secret)
// FFLOGS_CLIENT_ID and FFLOGS_CLIENT_SECRET

const TOKEN_CACHE = { token: null, expiresAt: 0 };

async function getAccessToken(env) {
  // Check cached token
  if (TOKEN_CACHE.token && TOKEN_CACHE.expiresAt > Date.now() + 60000) {
    return TOKEN_CACHE.token;
  }

  // Request new token via OAuth2 client credentials
  const tokenUrl = 'https://cn.fflogs.com/oauth/token';
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.FFLOGS_CLIENT_ID,
    client_secret: env.FFLOGS_CLIENT_SECRET,
  });

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('OAuth2 token request failed:', resp.status, errText);
    throw new Error(`OAuth2 token request failed: ${resp.status}`);
  }

  const data = await resp.json();
  TOKEN_CACHE.token = data.access_token;
  // Token typically expires in 3600s (1 hour), cache with buffer
  TOKEN_CACHE.expiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 300000;

  return TOKEN_CACHE.token;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

async function handleGraphQL(request, env) {
  const token = await getAccessToken(env);

  // Read the GraphQL query from the client request
  const clientBody = await request.json();

  // Forward to FFLogs v2 GraphQL API
  const fflogsResp = await fetch('https://cn.fflogs.com/api/v2/client', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(clientBody),
  });

  const responseData = await fflogsResp.json();

  return new Response(JSON.stringify(responseData), {
    status: fflogsResp.status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function handleHealth() {
  return new Response(JSON.stringify({ status: 'ok', service: 'fflogs-proxy' }), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Health check
    if (url.pathname === '/health') {
      return handleHealth();
    }

    // GraphQL proxy
    if (url.pathname === '/graphql' && request.method === 'POST') {
      try {
        return await handleGraphQL(request, env);
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }
    }

    // Unknown route
    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  },
};
