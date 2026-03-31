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
  const { headers: optHeaders, ...restOptions } = options;
  const config = {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...optHeaders,
    },
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

async function authRequest(path, options = {}) {
  try {
    return await request(path, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers,
      },
    });
  } catch (err) {
    if (err.status === 401) {
      localStorage.removeItem('admin_token');
      window.location.href = '/admin/login';
    }
    throw err;
  }
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
export function scanTicket(code, pin, device_id) {
  const body = { code };
  if (device_id) body.device_id = device_id;
  return request('/scan', {
    method: 'POST',
    headers: { 'X-Scanner-Pin': pin },
    body: JSON.stringify(body),
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
    localStorage.setItem('admin_username', data.username || username);
    localStorage.setItem('admin_role', data.role || 'admin');
    localStorage.setItem('admin_display_name', data.displayName || data.username || username);
  }
  return data;
}

export function adminLogout() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_username');
  localStorage.removeItem('admin_role');
  localStorage.removeItem('admin_display_name');
}

export function isAdminLoggedIn() {
  return !!localStorage.getItem('admin_token');
}

export function getAdminRole() {
  return localStorage.getItem('admin_role') || 'staff';
}

export function getAdminDisplayName() {
  return localStorage.getItem('admin_display_name') || 'Admin';
}

// ─── Forgot / Reset Password ────────────────────────────────
export function forgotPassword(email) {
  return request('/admin/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}

export function resetPassword(token, password) {
  return request('/admin/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
}

// ─── Profile ────────────────────────────────────────────────
export function fetchProfile() {
  return authRequest('/admin/profile');
}

export function updateProfile(data) {
  return authRequest('/admin/profile', { method: 'PUT', body: JSON.stringify(data) });
}

export function changePassword(current_password, new_password) {
  return authRequest('/admin/profile/password', { method: 'PUT', body: JSON.stringify({ current_password, new_password }) });
}

// ─── User Management ────────────────────────────────────────
export function fetchUsers() {
  return authRequest('/admin/users');
}

export function createUser(data) {
  return authRequest('/admin/users', { method: 'POST', body: JSON.stringify(data) });
}

export function updateUser(id, data) {
  return authRequest(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteUser(id) {
  return authRequest(`/admin/users/${id}`, { method: 'DELETE' });
}

export function changeUserPassword(id, password) {
  return authRequest(`/admin/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) });
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

export function refundOrder(id, body = {}) {
  return authRequest(`/admin/orders/${id}/refund`, {
    method: 'POST',
    body: JSON.stringify(body),
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

// ─── Scanner Users ──────────────────────────────────────────
export function fetchScannerUsers() {
  return authRequest('/admin/scanner-users');
}

export function createScannerUser(data) {
  return authRequest('/admin/scanner-users', { method: 'POST', body: JSON.stringify(data) });
}

export function updateScannerUser(id, data) {
  return authRequest(`/admin/scanner-users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteScannerUser(id) {
  return authRequest(`/admin/scanner-users/${id}`, { method: 'DELETE' });
}

// ─── Door Stats ─────────────────────────────────────────────
export function fetchDoorStats(eventId) {
  return authRequest(`/admin/door/${eventId}`);
}

// ─── Stats / Analytics ──────────────────────────────────────
export function fetchStatsOverview() {
  return authRequest('/admin/stats/overview');
}
export function fetchRevenueChart(days = 30) {
  return authRequest(`/admin/stats/revenue-chart?days=${days}`);
}
export function fetchStatsByEvent() {
  return authRequest('/admin/stats/by-event');
}
export function fetchTicketTypeStats() {
  return authRequest('/admin/stats/ticket-types');
}
export function fetchScansTimeline(days = 30) {
  return authRequest(`/admin/stats/scans-timeline?days=${days}`);
}
export function fetchScannerLeaderboard() {
  return authRequest('/admin/stats/scanner-leaderboard');
}
export function fetchEmailStats() {
  return authRequest('/admin/stats/emails');
}
export function fetchHourlyPattern() {
  return authRequest('/admin/stats/hourly-pattern');
}
export function fetchEventOps(eventId) {
  return authRequest(`/admin/stats/event/${eventId}`);
}

// ─── Addon Top-Up ───────────────────────────────────────────
export function addAddonToOrder(orderId, data) {
  return authRequest(`/admin/orders/${orderId}/add-addon`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Social Posts ────────────────────────────────────────────
export function generateSocialPost(eventId, data) {
  return authRequest(`/events/${eventId}/social-post`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
