import { HOME, api } from './api.js';

const form = document.getElementById('login-form');
const error = document.getElementById('login-error');

// Already signed in? Go straight to the right interface.
api('/api/auth/me')
  .then(({ user }) => location.replace(HOME[user.role]))
  .catch(() => {});

document.getElementById('demo-accounts').addEventListener('click', (event) => {
  const button = event.target.closest('[data-user]');
  if (!button) return;
  document.getElementById('username').value = button.dataset.user;
  document.getElementById('password').focus();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.classList.add('hidden');
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  try {
    const { user } = await api('/api/auth/login', {
      method: 'POST',
      body: { username: form.username.value, password: form.password.value },
    });
    location.replace(HOME[user.role]);
  } catch (e) {
    error.textContent = e.message;
    error.classList.remove('hidden');
  } finally {
    button.disabled = false;
  }
});

// The button stays disabled until this handler exists, so the browser can never submit the form
// natively (which would put the password into a URL) before the script has loaded.
form.querySelector('button[type=submit]').disabled = false;
