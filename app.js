const STORAGE_KEY = 'spotify_alarm_data_v1';
const TOKEN_KEY = 'spotify_auth_token_v1';
const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

const state = {
  alarms: [],
  settings: {
    clientId: '',
    redirectUri: '',
    manualToken: '',
  },
  albums: [],
  activeRing: null,
  lastTriggeredMinuteByAlarm: {},
};

const el = {
  settingsForm: document.getElementById('settings-form'),
  clientId: document.getElementById('clientId'),
  redirectUri: document.getElementById('redirectUri'),
  manualToken: document.getElementById('manualToken'),
  connectSpotify: document.getElementById('connectSpotify'),
  logoutSpotify: document.getElementById('logoutSpotify'),
  authStatus: document.getElementById('authStatus'),
  alarmForm: document.getElementById('alarm-form'),
  editingAlarmId: document.getElementById('editingAlarmId'),
  alarmTime: document.getElementById('alarmTime'),
  weekdayPicker: document.getElementById('weekdayPicker'),
  loadAlbums: document.getElementById('loadAlbums'),
  albumSearch: document.getElementById('albumSearch'),
  albumList: document.getElementById('albumList'),
  alarmList: document.getElementById('alarmList'),
  cancelEdit: document.getElementById('cancelEdit'),
  ringOverlay: document.getElementById('ringOverlay'),
  ringTrack: document.getElementById('ringTrack'),
  ringAlbum: document.getElementById('ringAlbum'),
  stopAlarm: document.getElementById('stopAlarm'),
  snoozeAlarm: document.getElementById('snoozeAlarm'),
  tapToPlay: document.getElementById('tapToPlay'),
};

init();

function init() {
  setupWeekdaySelector();
  loadState();
  handleOAuthCallback();
  renderSettings();
  renderAlbums();
  renderAlarms();
  bindEvents();
  startAlarmWatcher();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // no-op
    });
  }
}

function bindEvents() {
  el.settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.settings.clientId = el.clientId.value.trim();
    state.settings.redirectUri = el.redirectUri.value.trim();
    state.settings.manualToken = el.manualToken.value.trim();
    saveState();
    renderAuthStatus();
    alert('設定を保存しました');
  });

  el.connectSpotify.addEventListener('click', startSpotifyAuth);
  el.logoutSpotify.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    renderAuthStatus();
  });

  el.loadAlbums.addEventListener('click', loadSavedAlbumsFromSpotify);

  el.albumSearch.addEventListener('input', renderAlbums);

  el.alarmForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const selectedDays = [...el.weekdayPicker.querySelectorAll('input:checked')].map((n) => Number(n.value));
    const selectedAlbumIds = [...el.albumList.querySelectorAll('input[type="checkbox"]:checked')].map((n) => n.value);

    if (!selectedDays.length || !selectedAlbumIds.length) {
      alert('曜日とアルバムを1つ以上選択してください。');
      return;
    }

    const currentId = el.editingAlarmId.value;
    const alarm = {
      id: currentId || crypto.randomUUID(),
      time: el.alarmTime.value,
      days: selectedDays,
      albumIds: selectedAlbumIds,
      enabled: true,
      snoozeUntil: null,
    };

    if (currentId) {
      state.alarms = state.alarms.map((a) => (a.id === currentId ? alarm : a));
    } else {
      state.alarms.push(alarm);
    }

    saveState();
    clearAlarmForm();
    renderAlarms();
  });

  el.cancelEdit.addEventListener('click', clearAlarmForm);

  el.stopAlarm.addEventListener('click', stopRinging);
  el.snoozeAlarm.addEventListener('click', snoozeActiveAlarm);
  el.tapToPlay.addEventListener('click', () => {
    if (state.activeRing?.trackUrl) window.open(state.activeRing.trackUrl, '_blank', 'noopener');
    el.tapToPlay.classList.add('hidden');
  });
}

function setupWeekdaySelector() {
  el.weekdayPicker.innerHTML = weekdays
    .map(
      (label, idx) => `
      <label>
        <input type="checkbox" value="${idx}" />
        ${label}
      </label>
    `,
    )
    .join('');
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ alarms: state.alarms, settings: state.settings }));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.alarms = parsed.alarms || [];
    state.settings = { ...state.settings, ...(parsed.settings || {}) };
  } catch {
    // ignore broken storage
  }
}

function renderSettings() {
  el.clientId.value = state.settings.clientId;
  el.redirectUri.value = state.settings.redirectUri || location.origin + location.pathname;
  if (!state.settings.redirectUri) state.settings.redirectUri = el.redirectUri.value;
  el.manualToken.value = state.settings.manualToken;
  renderAuthStatus();
}

function renderAuthStatus() {
  const token = getTokenSync();
  el.authStatus.textContent = token ? 'Spotify接続済み（OAuth2）' : '未接続（OAuth2接続が必要）';
}

function getTokenSync() {
  const manual = state.settings.manualToken?.trim();
  if (manual) return manual;

  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    const token = JSON.parse(raw);
    if (Date.now() < token.expires_at) return token.access_token;
    return null;
  } catch {
    return null;
  }
}

async function getValidToken() {
  const manual = state.settings.manualToken?.trim();
  if (manual) return manual;

  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;

  try {
    const token = JSON.parse(raw);
    if (Date.now() < token.expires_at - 10_000) return token.access_token;
    if (!token.refresh_token || !state.settings.clientId) return null;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: state.settings.clientId,
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return null;
    const refreshed = await res.json();
    const next = {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || token.refresh_token,
      expires_at: Date.now() + refreshed.expires_in * 1000,
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
    return next.access_token;
  } catch {
    return null;
  }
}

function startSpotifyAuth() {
  const clientId = state.settings.clientId?.trim();
  const redirectUri = state.settings.redirectUri?.trim();
  if (!clientId || !redirectUri) {
    alert('Client ID と Redirect URI を先に保存してください。');
    return;
  }

  const codeVerifier = generateRandomString(64);
  sessionStorage.setItem('spotify_code_verifier', codeVerifier);

  generateCodeChallenge(codeVerifier).then((codeChallenge) => {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      scope: 'user-library-read user-read-email user-read-private',
    });
    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  });
}

async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;

  const verifier = sessionStorage.getItem('spotify_code_verifier');
  if (!verifier) return;

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: state.settings.redirectUri,
      client_id: state.settings.clientId,
      code_verifier: verifier,
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) throw new Error('Spotify認証に失敗しました');

    const token = await res.json();
    localStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({
        access_token: token.access_token,
        refresh_token: token.refresh_token || null,
        expires_at: Date.now() + token.expires_in * 1000,
      }),
    );

    history.replaceState({}, '', state.settings.redirectUri);
    renderAuthStatus();
  } catch (e) {
    console.error(e);
    alert('Spotify認証に失敗しました。設定値を確認してください。');
  }
}

async function loadSavedAlbumsFromSpotify() {
  const token = await getValidToken();
  if (!token) {
    alert('Spotifyへ接続してください。');
    return;
  }

  try {
    const items = [];
    let offset = 0;
    let hasNext = true;

    while (hasNext && offset < 200) {
      const res = await fetch(`https://api.spotify.com/v1/me/albums?limit=50&offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('アルバム取得に失敗');
      const data = await res.json();
      items.push(...data.items);
      hasNext = Boolean(data.next);
      offset += 50;
    }

    state.albums = items.map((item) => ({
      id: item.album.id,
      name: item.album.name,
      image: item.album.images?.[2]?.url || item.album.images?.[0]?.url || '',
      artist: item.album.artists?.map((a) => a.name).join(', ') || '-',
    }));

    renderAlbums();
  } catch (e) {
    console.error(e);
    alert('アルバムの取得に失敗しました。');
  }
}

function renderAlbums() {
  const q = el.albumSearch.value.trim().toLowerCase();
  const filtered = state.albums.filter((a) => `${a.name} ${a.artist}`.toLowerCase().includes(q));

  if (!filtered.length) {
    el.albumList.innerHTML = '<p class="hint">アルバムがありません。Spotifyから取得してください。</p>';
    return;
  }

  const selected = new Set([...el.albumList.querySelectorAll('input[type="checkbox"]:checked')].map((v) => v.value));

  el.albumList.innerHTML = filtered
    .map(
      (album) => `
      <label class="album-item">
        <input type="checkbox" value="${album.id}" ${selected.has(album.id) ? 'checked' : ''} />
        <img src="${album.image}" alt="${escapeHtml(album.name)}" />
        <div>
          <strong>${escapeHtml(album.name)}</strong><br />
          <small>${escapeHtml(album.artist)}</small>
        </div>
      </label>
    `,
    )
    .join('');
}

function renderAlarms() {
  if (!state.alarms.length) {
    el.alarmList.innerHTML = '<li>アラームはまだありません。</li>';
    return;
  }

  el.alarmList.innerHTML = state.alarms
    .map(
      (alarm) => `
      <li>
        <div>
          <strong>${alarm.time}</strong>
          <div>${alarm.days.map((d) => weekdays[d]).join(' / ')}</div>
          <small>アルバム ${alarm.albumIds.length}件</small>
          ${alarm.snoozeUntil ? `<div><small>スヌーズ: ${new Date(alarm.snoozeUntil).toLocaleTimeString()}</small></div>` : ''}
        </div>
        <div class="button-row">
          <button data-action="toggle" data-id="${alarm.id}" class="secondary">${alarm.enabled ? 'ON' : 'OFF'}</button>
          <button data-action="edit" data-id="${alarm.id}" class="secondary">編集</button>
          <button data-action="delete" data-id="${alarm.id}" class="danger">削除</button>
        </div>
      </li>
    `,
    )
    .join('');

  el.alarmList.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const alarm = state.alarms.find((a) => a.id === id);
      if (!alarm) return;
      if (action === 'toggle') {
        alarm.enabled = !alarm.enabled;
      } else if (action === 'delete') {
        state.alarms = state.alarms.filter((a) => a.id !== id);
      } else if (action === 'edit') {
        fillForm(alarm);
      }
      saveState();
      renderAlarms();
    });
  });
}

function fillForm(alarm) {
  el.editingAlarmId.value = alarm.id;
  el.alarmTime.value = alarm.time;
  el.weekdayPicker.querySelectorAll('input').forEach((input) => {
    input.checked = alarm.days.includes(Number(input.value));
  });
  el.albumList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = alarm.albumIds.includes(input.value);
  });
}

function clearAlarmForm() {
  el.alarmForm.reset();
  el.editingAlarmId.value = '';
}

function startAlarmWatcher() {
  setInterval(async () => {
    const now = new Date();
    const day = now.getDay();
    const currentHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (const key of Object.keys(state.lastTriggeredMinuteByAlarm)) {
      if (!key.endsWith(`_${currentHHmm}`)) delete state.lastTriggeredMinuteByAlarm[key];
    }

    for (const alarm of state.alarms) {
      if (!alarm.enabled) continue;

      let shouldRing = false;
      if (alarm.snoozeUntil && Date.now() >= alarm.snoozeUntil) {
        alarm.snoozeUntil = null;
        shouldRing = true;
      }

      if (alarm.days.includes(day) && alarm.time === currentHHmm) {
        const key = `${alarm.id}_${currentHHmm}`;
        if (!state.lastTriggeredMinuteByAlarm[key]) {
          state.lastTriggeredMinuteByAlarm[key] = true;
          shouldRing = true;
        }
      }

      if (shouldRing) {
        saveState();
        await triggerAlarm(alarm);
      }
    }
  }, 1000);
}

async function triggerAlarm(alarm) {
  const albumId = alarm.albumIds[Math.floor(Math.random() * alarm.albumIds.length)];
  const album = state.albums.find((a) => a.id === albumId);

  let track = null;
  const token = await getValidToken();
  if (token) {
    try {
      const res = await fetch(`https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.items?.length) track = data.items[Math.floor(Math.random() * data.items.length)];
      }
    } catch {
      // noop
    }
  }

  const trackName = track?.name || 'Spotifyでランダム再生';
  const albumName = album?.name || '選択アルバム';
  const trackUrl = track?.external_urls?.spotify || `https://open.spotify.com/album/${albumId}`;

  state.activeRing = { alarmId: alarm.id, trackUrl };

  el.ringTrack.textContent = `曲: ${trackName}`;
  el.ringAlbum.textContent = `アルバム: ${albumName}`;
  el.ringOverlay.classList.remove('hidden');

  const popup = window.open(trackUrl, '_blank', 'noopener');
  if (!popup) el.tapToPlay.classList.remove('hidden');
}

function stopRinging() {
  state.activeRing = null;
  el.ringOverlay.classList.add('hidden');
  el.tapToPlay.classList.add('hidden');
}

function snoozeActiveAlarm() {
  if (!state.activeRing) return;
  const alarm = state.alarms.find((a) => a.id === state.activeRing.alarmId);
  if (!alarm) return;
  alarm.snoozeUntil = Date.now() + 5 * 60 * 1000;
  saveState();
  renderAlarms();
  stopRinging();
}

function escapeHtml(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((x) => chars[x % chars.length])
    .join('');
}

async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
