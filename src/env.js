// Where the app is running. Railway sets RAILWAY_ENVIRONMENT_NAME on every service.
export const onRailway = !!(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
export const isProd = process.env.NODE_ENV === 'production' || onRailway;
export const isTest = process.env.NODE_ENV === 'test';
// The test sign-in box can never be switched on in production.
export const devLoginEnabled = process.env.DEV_LOGIN === '1' && !isProd;
// The visitor's real IP. Behind Cloudflare's proxy every request arrives from a Cloudflare
// address, so per-IP limits would lump all visitors together; Cloudflare passes the real
// one in CF-Connecting-IP. Only trusted on requests that carry Cloudflare's CF-Ray header.
export function clientIp(req) {
  const cf = req.get('cf-connecting-ip');
  return cf && req.get('cf-ray') && /^[0-9a-fA-F:.]{3,45}$/.test(cf) ? cf : req.ip;
}
