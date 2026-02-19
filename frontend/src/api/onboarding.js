import { api } from './client';

export function createTenant(data) {
  return api.post('/onboarding/tenant', data);
}

export function completeSetup(data) {
  return api.post('/onboarding/setup', data);
}
