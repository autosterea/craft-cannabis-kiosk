// POSaBIT Venue Configuration
// All 6 Craft Cannabis locations

export interface Venue {
  id: string;
  name: string;
  token: string;
}

export const VENUES: Record<string, Venue> = {
  tacoma: {
    id: 'tacoma',
    name: 'Craft Cannabis Tacoma',
    token: 'REDACTED_VENUE_TOKEN'
  },
  andresen: {
    id: 'andresen',
    name: 'Craft Cannabis Andresen',
    token: 'REDACTED_VENUE_TOKEN'
  },
  leavenworth: {
    id: 'leavenworth',
    name: 'Craft Cannabis Leavenworth',
    token: 'REDACTED_VENUE_TOKEN'
  },
  millPlain: {
    id: 'millPlain',
    name: 'Craft Cannabis Mill Plain',
    token: 'REDACTED_VENUE_TOKEN'
  },
  southWenatchee: {
    id: 'southWenatchee',
    name: 'Craft Cannabis South Wenatchee',
    token: 'REDACTED_VENUE_TOKEN'
  },
  wenatchee: {
    id: 'wenatchee',
    name: 'Craft Cannabis Wenatchee',
    token: 'REDACTED_VENUE_TOKEN'
  }
};

export const INTEGRATOR_TOKEN = 'REDACTED_INTEGRATOR_TOKEN';

export function getVenueList(): Venue[] {
  return Object.values(VENUES);
}

export function getVenueById(id: string): Venue | undefined {
  return VENUES[id];
}
