// Where the app is running. Railway sets RAILWAY_ENVIRONMENT_NAME on every service.
export const onRailway = !!(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
export const isProd = process.env.NODE_ENV === 'production' || onRailway;
export const isTest = process.env.NODE_ENV === 'test';
// The test sign-in box can never be switched on in production.
export const devLoginEnabled = process.env.DEV_LOGIN === '1' && !isProd;
