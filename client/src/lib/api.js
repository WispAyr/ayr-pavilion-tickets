const BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Convert snake_case keys to camelCase recursively
function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelizeKeys(obj) {
  if (Array.isArray(obj)) return obj.map(camelizeKeys);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamel(k), camelizeKeys(v)])
    );
  }
  return obj;
}

function getAuthHeaders() {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  const res = await fetch(url, config);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error || body.message || `Request failed (${res.status})`);
    error.status = res.status;
    error.body = body;
    throw error;
  }

  if (res.status === 204) return null;
  const json = await res.json();
  return camelizeKeys(json);
}

function authRequest(path, options = {}) {
  return request(path, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });
}

// Normalize event object for frontend consumption
function normalizeEvent(ev) {
  if (!ev) return ev;
  return {
    ...ev,
    date: ev.dateTime || ev.date,
    doorsOpen: ev.doorsOpen,
    imageUrl: ev.heroImage || ev.imageUrl,
    ageRestriction: ev.ageRestriction,
    ticketTypes: (ev.ticketTypes || []).map(tt => ({
      ...tt,
      saleStart: tt.saleStart,
      saleEnd: tt.saleEnd,
    })),
    addons: ev.addons || [],
    waivers: ev.waivers || [],
  };
}

// ─── Public Events ──────────────────────────────────────────
export async function fetchEvents(params = {}) {
  const query = new URLSearchParams(params).toString();
  const qs = query ? `?${query}` : '';
  const data = await request(`/events${qs}`);
  if (Array.isArray(data)) return data.map(normalizeEvent);
  if (data?.events) return { ...data, events: data.events.map(normalizeEvent) };
  return data;
}

export async function fetchEvent(slug) {
  const data = await request(`/events/${slug}`);
  return normalizeEvent(data);
}

// ─── Admin Events ───────────────────────────────────────────
export function createEvent(data) {
  return authRequest('/events', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateEvent(id, data) {
  return authRequest(`/events/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteEvent(id) {
  return authRequest(`/events/${id}`, {
    method: 'DELETE',
  });
}

// ─── Ticket Types ───────────────────────────────────────────
export function fetchTicketTypes(eventId) {
  return authRequest(`/events/${eventId}/ticket-types`);
}

export function createTicketType(eventId, data) {
  return authRequest(`/events/${eventId}/ticket-types`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateTicketType(id, data) {
  return authRequest(`/ticket-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteTicketType(id) {
  return authRequest(`/ticket-types/${id}`, {
    method: 'DELETE',
  });
}

// ─── Addons ────────────────────────────────────────────────
export function fetchAddons(eventId) {
  return request(`/events/${eventId}/addons`);
}

export function createAddon(eventId, data) {
  return authRequest(`/events/${eventId}/addons`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateAddon(id, data) {
  return authRequest(`/addons/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteAddon(id) {
  return authRequest(`/addons/${id}`, {
    method: 'DELETE',
  });
}

// ─── Waivers ───────────────────────────────────────────────
export function fetchWaivers(eventId) {
  return request(`/events/${eventId}/waivers`);
}

export function fetchWaiverTemplates() {
  return authRequest('/waiver-templates');
}

export function createWaiver(eventId, data) {
  return authRequest(`/events/${eventId}/waivers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateWaiver(id, data) {
  return authRequest(`/waivers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteWaiver(id) {
  return authRequest(`/waivers/${id}`, {
    method: 'DELETE',
  });
}

// ─── Checkout / Tickets ─────────────────────────────────────
export function createCheckout(data) {
  return request('/stripe/checkout', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchTicket(code) {
  const data = await request(`/tickets/${code}`);
  // Normalize nested event date fields
  if (data?.event) {
    data.event.date = data.event.dateTime || data.event.date;
  }
  if (data?.ticketType) {
    data.ticketType = data.ticketType;
  }
  return data;
}

// ─── Scanner ────────────────────────────────────────────────
export function scanTicket(code, pin) {
  return request('/scan', {
    method: 'POST',
    headers: { 'X-Scanner-Pin': pin },
    body: JSON.stringify({ code }),
  });
}

export function validateScannerPin(pin) {
  return request('/scan/validate', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

export function fetchScanStats(eventId, pin) {
  return request(`/scan/stats/${eventId}`, {
    headers: { 'X-Scanner-Pin': pin },
  });
}

// ─── Admin Auth ─────────────────────────────────────────────
export async function adminLogin(username, password) {
  const data = await request('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (data.token) {
    localStorage.setItem('admin_token', data.token);
  }
  return data;
}

export function adminLogout() {
  localStorage.removeItem('admin_token');
}

export function isAdminLoggedIn() {
  return !!localStorage.getItem('admin_token');
}

// ─── Admin Dashboard / Orders ───────────────────────────────
export function fetchDashboard() {
  return authRequest('/admin/dashboard');
}

export function fetchOrders(params = {}) {
  const query = new URLSearchParams(params).toString();
  const qs = query ? `?${query}` : '';
  return authRequest(`/admin/orders${qs}`);
}

export function fetchOrder(id) {
  return authRequest(`/admin/orders/${id}`);
}

export function refundOrder(id) {
  return authRequest(`/admin/orders/${id}/refund`, {
    method: 'POST',
  });
}

// ─── Image Upload ────────────────────────────────────────────
export function uploadEventImage(eventId, file) {
  const formData = new FormData();
  formData.append('image', file);
  const token = localStorage.getItem('admin_token');
  return fetch(`${BASE_URL}/events/${eventId}/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Upload failed');
    }
    return res.json();
  });
}

// ─── Social Posts ────────────────────────────────────────────
export function generateSocialPost(eventId, data) {
  return authRequest(`/events/${eventId}/social-post`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
