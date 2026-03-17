import { api } from './client';

export function createTenant(data) {
  return api.post('/onboarding/tenant', data);
}

export function completeSetup(data) {
  return api.post('/onboarding/setup', data);
}

/** GET /onboarding/config — tenant config (meta_phone_number_id, ai_system_prompt, etc.). */
export function getTenantConfig() {
  return api.get('/onboarding/config');
}
