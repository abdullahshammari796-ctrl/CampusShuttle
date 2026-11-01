// Thin HTTP client for the REST API. All requests are same-origin and carry
// the custom header the server's CSRF guard requires.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'X-Requested-With': 'campus-shuttle' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.');
  }
  if (response.status === 204) return null;
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = data && data.error ? data.error : {};
    throw new ApiError(response.status, error.code || `HTTP_${response.status}`, error.message || `Request failed (${response.status}).`, error.details);
  }
  return data;
}

export const HOME = { student: '/student.html', driver: '/driver.html', office: '/office.html' };

/** Ensures a signed-in user with the expected role; otherwise redirects. */
export async function requireUser(role) {
  try {
    const { user } = await api('/api/auth/me');
    if (user.role !== role) {
      location.replace(HOME[user.role] || '/');
      return null;
    }
    return user;
  } catch {
    location.replace('/');
    return null;
  }
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } finally {
    location.replace('/');
  }
}
