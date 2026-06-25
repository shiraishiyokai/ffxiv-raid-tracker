const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

exports.handler = async () => ({
  statusCode: 200,
  headers: CORS,
  body: JSON.stringify({ status: 'ok', service: 'fflogs-proxy' }),
});
