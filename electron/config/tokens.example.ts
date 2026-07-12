// POSaBIT API Tokens - TEMPLATE
// Copy this file to tokens.ts and fill in your actual tokens
// tokens.ts is gitignored and will not be committed

export const INTEGRATOR_TOKEN = 'YOUR_INTEGRATOR_TOKEN_HERE';

export const VENUE_TOKENS: Record<string, string> = {
  tacoma: 'YOUR_VENUE_TOKEN_HERE',
  andresen: 'YOUR_VENUE_TOKEN_HERE',
  leavenworth: 'YOUR_VENUE_TOKEN_HERE',
  millPlain: 'YOUR_VENUE_TOKEN_HERE',
  southWenatchee: 'YOUR_VENUE_TOKEN_HERE',
  wenatchee: 'YOUR_VENUE_TOKEN_HERE',
};

// Fleet telemetry heartbeat secret (64-char hex, must match KIOSK_TELEMETRY_SECRET on the server)
export const TELEMETRY_SECRET = 'YOUR_TELEMETRY_SECRET_HERE';
