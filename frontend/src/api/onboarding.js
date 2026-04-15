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

/** PATCH /onboarding/config — partial update of tenant config fields. */
export function patchTenantConfig(data) {
  return api.patch('/onboarding/config', data);
}

/** POST /onboarding/upload-logo-url — presigned PUT URL for tenant logo. */
export function getLogoUploadUrl({ filename, contentType }) {
  return api.post('/onboarding/upload-logo-url', {
    filename: filename || 'logo.jpg',
    content_type: contentType || 'image/jpeg',
  });
}
