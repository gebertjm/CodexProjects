const API_BASE = '/api/dev/sms-simulator';
const POLL_INTERVAL_MS = 1800;

const state = {
  sessions: [],
  activeSessionId: null,
  messagesById: new Map(),
  pollTimer: null,
  debugVisible: false,
};

const elements = {
  accessNotice: document.querySelector('#accessNotice'),
  sessionForm: document.querySelector('#sessionForm'),
  sessionTabs: document.querySelector('#sessionTabs'),
  activeSessionSummary: document.querySelector('#activeSessionSummary'),
  refreshButton: document.querySelector('#refreshButton'),
  messageThread: document.querySelector('#messageThread'),
  messageForm: document.querySelector('#messageForm'),
  messageInput: document.querySelector('#messageInput'),
  debugToggle: document.querySelector('#debugToggle'),
  debugPanel: document.querySelector('#debugPanel'),
  devToken: document.querySelector('#devToken'),
  controls: Array.from(document.querySelectorAll('[data-control]')),
};

function devHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };
  const token = elements.devToken.value.trim();

  if (token) {
    headers['x-sms-simulator-token'] = token;
  }

  return headers;
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...devHeaders(),
      ...(options.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Request failed: ${response.status}`);
  }

  return payload;
}

function setNotice(message, hidden = false) {
  elements.accessNotice.textContent = message;
  elements.accessNotice.hidden = hidden;
}

function formatTime(value) {
  if (!value) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));
  } catch (_error) {
    return value;
  }
}

function messageText(message) {
  return message.direction === 'outbound'
    ? message.rendered_text
    : message.raw_text ?? message.rendered_text;
}

function renderMessages(messages) {
  for (const message of messages) {
    state.messagesById.set(message.message_id, message);
  }

  const ordered = Array.from(state.messagesById.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  elements.messageThread.replaceChildren(
    ...ordered.map((message) => {
      const item = document.createElement('li');
      item.className = `message ${message.direction}`;

      const text = document.createElement('div');
      text.textContent = messageText(message);

      const meta = document.createElement('span');
      meta.className = 'message-meta';
      meta.textContent =
        message.direction === 'outbound'
          ? `DailyTTRPG SMS - ${formatTime(message.created_at)}`
          : `You - ${formatTime(message.created_at)}`;

      item.append(text, meta);
      return item;
    })
  );

  elements.messageThread.scrollTop = elements.messageThread.scrollHeight;
}

function renderSessions() {
  elements.sessionTabs.replaceChildren(
    ...state.sessions.map((session, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = session.session_id === state.activeSessionId ? 'active' : '';
      button.textContent = `${session.active_sms_character_name || `Player ${index + 1}`} ${session.phone_number}`;
      button.addEventListener('click', () => {
        state.activeSessionId = session.session_id;
        state.messagesById.clear();
        updateActiveSessionSummary();
        refreshMessages();
      });
      return button;
    })
  );
}

function activeSession() {
  return state.sessions.find((session) => session.session_id === state.activeSessionId) ?? null;
}

function updateActiveSessionSummary() {
  const session = activeSession();

  if (!session) {
    elements.activeSessionSummary.textContent = 'No active session yet.';
    return;
  }

  elements.activeSessionSummary.textContent =
    `${session.phone_number} | user ${session.user_id} | character ${session.active_sms_character_id}` +
    ` | campaign ${session.campaign_id || 'none'}`;
}

async function refreshSessions() {
  const payload = await api('/sessions');
  state.sessions = payload.sessions ?? [];

  if (!state.activeSessionId && state.sessions.length > 0) {
    state.activeSessionId = state.sessions[0].session_id;
  }

  if (state.activeSessionId && !state.sessions.some((session) => session.session_id === state.activeSessionId)) {
    state.activeSessionId = state.sessions[0]?.session_id ?? null;
  }

  renderSessions();
  updateActiveSessionSummary();
}

async function refreshMessages() {
  if (!state.activeSessionId) {
    return;
  }

  const payload = await api(`/messages/${encodeURIComponent(state.activeSessionId)}`);
  renderMessages(payload.messages ?? []);

  if (state.debugVisible) {
    await refreshDebug();
  }
}

async function refreshDebug() {
  if (!state.activeSessionId) {
    elements.debugPanel.textContent = 'No active session.';
    return;
  }

  const debug = await api(`/debug/${encodeURIComponent(state.activeSessionId)}`);
  elements.debugPanel.textContent = JSON.stringify(debug, null, 2);
}

function startPolling() {
  window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(() => {
    refreshMessages().catch((error) => setNotice(error.message));
  }, POLL_INTERVAL_MS);
}

async function createSession(event) {
  event.preventDefault();

  const formData = new FormData(elements.sessionForm);
  const payload = Object.fromEntries(formData.entries());
  payload.verified = formData.get('verified') === 'on';
  const onboardingMode = formData.get('new_onboarding_phone') === 'on';

  if (onboardingMode) {
    payload.active_sms_character_id = '';
    payload.active_sms_character_name = 'Adventurer';
    payload.campaign_id = '';
  }

  payload.state = {
    current_context: onboardingMode
      ? 'SMS onboarding has not started yet.'
      : 'Broken Caravan: a damaged wagon waits beside the Grey Road.',
    current_objective: onboardingMode ? null : 'investigate the caravan',
    active_thread: onboardingMode ? 'onboarding' : 'exploration',
    onboarding_state: onboardingMode ? 'awaiting_start' : 'active_play',
  };

  const endpoint = onboardingMode ? '/create-fresh-session' : '/session';
  const response = await api(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  state.activeSessionId = response.session.session_id;
  state.messagesById.clear();
  await refreshSessions();
  await refreshMessages();
}

async function sendInbound(event) {
  event.preventDefault();

  const message = elements.messageInput.value.trim();

  if (!message || !state.activeSessionId) {
    return;
  }

  elements.messageInput.value = '';
  await api('/inbound', {
    method: 'POST',
    body: JSON.stringify({
      session_id: state.activeSessionId,
      message,
    }),
  });
  await refreshSessions();
  await refreshMessages();
}

async function runControl(control) {
  if (!state.activeSessionId) {
    setNotice('Create or select a simulator session first.');
    return;
  }

  const button = elements.controls.find((element) => element.dataset.control === control);
  const originalText = button?.textContent;

  try {
    if (button) {
      button.disabled = true;
      if (button.dataset.primaryControl === 'true') {
        button.textContent = 'Advancing...';
      }
    }

    if (control === 'verify-persistence') {
      const persistence = await api(`/persistence/${encodeURIComponent(state.activeSessionId)}`);
      setNotice(`Persistence verified: account ${persistence.account.exists ? 'yes' : 'no'}, character ${persistence.active_character.exists ? 'yes' : 'no'}, campaign ${persistence.campaign_instance.exists ? 'yes' : 'no'}.`);
      if (state.debugVisible) {
        elements.debugPanel.textContent = JSON.stringify(persistence, null, 2);
      }
    } else {
      await api(`/${control}`, {
        method: 'POST',
        body: JSON.stringify({
          session_id: state.activeSessionId,
        }),
      });
    }

    if (control === 'reset-session') {
      state.messagesById.clear();
    }

    await refreshSessions();
    await refreshMessages();
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

async function initialize() {
  try {
    const access = await api('/enabled');

    if (!access.enabled) {
      setNotice('SMS simulator is disabled. Set ENABLE_SMS_SIMULATOR=true for local/dev use.');
    } else if (access.protected) {
      setNotice('SMS simulator is protected. Enter the configured dev token before using controls.');
    } else {
      setNotice('Local developer simulator is enabled. Do not expose this route publicly.', true);
    }

    if (access.enabled) {
      await refreshSessions();
      if (state.activeSessionId) {
        await refreshMessages();
      }
      startPolling();
    }
  } catch (error) {
    setNotice(error.message);
  }
}

elements.sessionForm.addEventListener('submit', (event) => {
  createSession(event).catch((error) => setNotice(error.message));
});

elements.messageForm.addEventListener('submit', (event) => {
  sendInbound(event).catch((error) => setNotice(error.message));
});

elements.refreshButton.addEventListener('click', () => {
  refreshSessions()
    .then(refreshMessages)
    .catch((error) => setNotice(error.message));
});

for (const control of elements.controls) {
  control.addEventListener('click', () => {
    runControl(control.dataset.control).catch((error) => setNotice(error.message));
  });
}

elements.debugToggle.addEventListener('click', () => {
  state.debugVisible = !state.debugVisible;
  elements.debugPanel.hidden = !state.debugVisible;
  elements.debugToggle.textContent = state.debugVisible ? 'Hide Debug' : 'Show Debug';

  if (state.debugVisible) {
    refreshDebug().catch((error) => setNotice(error.message));
  }
});

initialize();
