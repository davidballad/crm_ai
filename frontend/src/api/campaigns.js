import { api } from './client';

export function fetchCampaigns() {
  return api.get('/campaigns');
}

export function fetchCampaign(id) {
  return api.get(`/campaigns/${id}`);
}

export function createCampaign(data) {
  return api.post('/campaigns', data);
}

export function patchCampaign(id, data) {
  return api.patch(`/campaigns/${id}`, data);
}

export function sendCampaign(id) {
  return api.post(`/campaigns/${id}/send`, {});
}

export function deleteCampaign(id) {
  return api.delete(`/campaigns/${id}`);
}
