// POSaBIT Venue Configuration
// 5 Craft Cannabis locations (Leavenworth removed per Aaron Apr 17 2026)
// Tokens are imported from gitignored tokens.ts

import { INTEGRATOR_TOKEN as _INTEGRATOR_TOKEN, VENUE_TOKENS } from './tokens.js';

export interface Venue {
  id: string;
  name: string;
  token: string;
}

export const VENUES: Record<string, Venue> = {
  tacoma: {
    id: 'tacoma',
    name: 'Craft Cannabis Tacoma',
    token: VENUE_TOKENS.tacoma
  },
  andresen: {
    id: 'andresen',
    name: 'Craft Cannabis Andresen',
    token: VENUE_TOKENS.andresen
  },
  millPlain: {
    id: 'millPlain',
    name: 'Craft Cannabis Mill Plain',
    token: VENUE_TOKENS.millPlain
  },
  southWenatchee: {
    id: 'southWenatchee',
    name: 'Craft Cannabis Wenatchee South',
    token: VENUE_TOKENS.southWenatchee
  },
  wenatchee: {
    id: 'wenatchee',
    name: 'Craft Cannabis Wenatchee North',
    token: VENUE_TOKENS.wenatchee
  }
};

export const INTEGRATOR_TOKEN = _INTEGRATOR_TOKEN;

export function getVenueList(): Venue[] {
  return Object.values(VENUES);
}

export function getVenueById(id: string): Venue | undefined {
  return VENUES[id];
}
