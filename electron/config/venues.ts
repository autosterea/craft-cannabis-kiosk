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
    token: '5NJA0xyWr1RlPTVwi37xNg'
  },
  andresen: {
    id: 'andresen',
    name: 'Craft Cannabis Andresen',
    token: 'asZnAS37259ass9r2G7ooA'
  },
  leavenworth: {
    id: 'leavenworth',
    name: 'Craft Cannabis Leavenworth',
    token: 'M-lXQB4I_ZbtIjlP6gS4ZA'
  },
  millPlain: {
    id: 'millPlain',
    name: 'Craft Cannabis Mill Plain',
    token: 'ntsfEyacub8y3fyo8SnabA'
  },
  southWenatchee: {
    id: 'southWenatchee',
    name: 'Craft Cannabis South Wenatchee',
    token: 'E21VGhcsRqeC75Kr8x48fg'
  },
  wenatchee: {
    id: 'wenatchee',
    name: 'Craft Cannabis Wenatchee',
    token: 'jaelIza7BXhDtt3GXQE0HA'
  }
};

export const INTEGRATOR_TOKEN = '2HaQ1k3XZoX_xswGQHG6hw';

export function getVenueList(): Venue[] {
  return Object.values(VENUES);
}

export function getVenueById(id: string): Venue | undefined {
  return VENUES[id];
}
