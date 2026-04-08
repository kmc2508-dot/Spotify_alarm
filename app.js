const STORAGE_KEY = 'spotify_alarm_app_v1';
const TOKEN_KEY = 'spotify_access_token';
const TOKEN_EXP_KEY = 'spotify_access_token_exp';
const SETTINGS_KEY = 'spotify_alarm_settings_v1';

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

const state = {
  alarms: [],
  albums: [],
  token: '',
  currentRing: null,
  settings: {
    displayName: '',
    clientId: '',
    redirectUri: '',
  },
};

const el = {
  settingsScreen: document.getElementById('settingsScreen'),
  settingsForm: document.getElementById('settingsForm'),
  alarmScreen: document.getElementById('alarmScreen'),
  displayName: document.getElementById('displayName'),
  spotifyClientId: document.getElementById('spotifyClientId'),
  redirectUri: document.getElementById('redirectUri'),
  spotifyStatus: document.getElementById('spotifyStatus'),
  connectSpotifyBtn: document.getElementById('connectSpotifyBtn'),
  disconnectSpotifyBtn: document.getElementById('disconnectSpotifyBtn'),
  alarmForm: document.getElementById('alarmForm'),
  alarmId: document.getElementById('alarmId'),
  alarmTime: document.getElementById('alarmTime'),
  dayCheckboxes: document.getElementById('dayCheckboxes'),
  albumList: document.getElementById('albumList'),
  alarmItems: document.getElementById('alarmItems'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),
  snoozeMinutes: document.getElementById('snoozeMinutes'),
  ringModal: document.getElementById('ringModal'),
  ringTrackInfo: document.getElementById('ringTrackInfo'),
  openSpotifyBtn: document.getElementById('openSpotifyBtn'),
  stopAlarmBtn: document.getElementById('stopAlarmBtn'),
  snoozeBtn: document.getElementById('snoozeBtn'),
};

function loadState() {
  const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"alarms":[]}');
  state.alarms = Array.isArray(parsed.alarms) ? parsed.alarms : [];
  state.token = localStorage.getItem(TOKEN_KEY) || '';
  const exp = Number(localStorage.getItem(TOKEN_EXP_KEY) || 0);
  if (Date.now() > exp) {
    state.token = '';
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXP_KEY);
  }

  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  state.settings.displayName = settings.displayName || '';
  state.settings.clientId = settings.clientId || '';
  state.settings.redirectUri = settings.redirectUri || `${location.origin}${location.pathname}`;

  el.displayName.value = state.settings.displayName;
  el.spotifyClientId.value = state.settings.clientId;
  el.redirectUri.value = state.settings.redirectUri;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ alarms: state.alarms }));
}

function saveSettings() {
  state.settings = {
    displayName: el.displayName.value.trim(),
    clientId: el.spotifyClientId.value.trim(),
    redirectUri: el.redirectUri.value.trim(),
  };

  if (!state.settings.displayName || !state.settings.clientId || !state.settings.redirectUri) {
    alert('表示名・Client ID・Redirect URI を入力してください。');
    return false;
  }

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  updateSpotifyStatus();
  toggleAppScreens();
  return true;
}

function isSettingsReady() {
  return Boolean(state.settings.displayName && state.settings.clientId && state.settings.redirectUri);
}

function toggleAppScreens() {
  const ready = isSettingsReady();
  el.settingsScreen.classList.toggle('top-highlight', !ready);
  el.alarmScreen.classList.toggle('hidden', !ready);
}

function createDayCheckboxes() {
  el.dayCheckboxes.innerHTML = '';
  DAYS.forEach((day, index) => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${index}" /> ${day}`;
    el.dayCheckboxes.append(label);
  });
}

function getCheckedDays() {
  return [...el.dayCheckboxes.querySelectorAll('input:checked')].map((n) => Number(n.value));
}

function renderAlbums(selectedIds = []) {
  if (!state.token) {
    el.albumList.innerHTML = '<p class="help">設定保存 → Spotify接続後に保存済みアルバムを表示します。</p>';
    return;
  }
  if (!state.albums.length) {
    el.albumList.innerHTML = '<p class="help">アルバム取得中、または保存済みアルバムがありません。</p>';
    return;
  }
  el.albumList.innerHTML = '';
  state.albums.forEach((album) => {
    const item = document.createElement('label');
    item.className = 'album-item';
    const checked = selectedIds.includes(album.id) ? 'checked' : '';
    item.innerHTML = `
      <input type="checkbox" value="${album.id}" ${checked} />
      <strong>${album.name}</strong><br/>
      <small>${album.artist}</small>
    `;
    el.albumList.append(item);
  });
}

function selectedAlbumIds() {
  return [...el.albumList.querySelectorAll('input:checked')].map((i) => i.value);
}

function renderAlarms() {
  el.alarmItems.innerHTML = '';
  if (!state.alarms.length) {
    el.alarmItems.innerHTML = '<li>アラームがありません。</li>';
    return;
  }
  state.alarms.forEach((alarm) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <strong>${alarm.time}</strong> (${alarm.days.map((d) => DAYS[d]).join(', ')})<br/>
        <small>${alarm.albumIds.length}件のアルバム / スヌーズ${alarm.snoozeMinutes}分</small>
      </div>
      <div>
        <label><input data-action="toggle" data-id="${alarm.id}" type="checkbox" ${alarm.enabled ? 'checked' : ''}/> ON</label>
        <button data-action="edit" data-id="${alarm.id}" class="secondary">編集</button>
        <button data-action="delete" data-id="${alarm.id}" class="secondary">削除</button>
      </div>
    `;
    el.alarmItems.append(li);
  });
}

function resetForm() {
  el.alarmId.value = '';
  el.alarmForm.reset();
  createDayCheckboxes();
  el.snoozeMinutes.value = 5;
  renderAlbums();
}

function upsertAlarm(evt) {
  evt.preventDefault();
  const id = el.alarmId.value || crypto.randomUUID();
  const alarm = {
    id,
    time: el.alarmTime.value,
    days: getCheckedDays(),
    albumIds: selectedAlbumIds(),
    enabled: true,
    snoozeMinutes: Number(el.snoozeMinutes.value || 5),
  };

  if (!alarm.time || !alarm.days.length || !alarm.albumIds.length) {
    alert('時刻・曜日・アルバムを設定してください。');
    return;
  }

  const idx = state.alarms.findIndex((a) => a.id === id);
  if (idx >= 0) {
    state.alarms[idx] = { ...state.alarms[idx], ...alarm };
  } else {
    state.alarms.push(alarm);
  }
  saveState();
  renderAlarms();
  resetForm();
}

function handleAlarmListClick(evt) {
  const target = evt.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  if (!action) return;

  const id = target.dataset.id;
  const alarm = state.alarms.find((a) => a.id === id);
  if (!alarm) return;

  if (action === 'delete') {
    state.alarms = state.alarms.filter((a) => a.id !== id);
  } else if (action === 'edit') {
    el.alarmId.value = alarm.id;
    el.alarmTime.value = alarm.time;
    el.snoozeMinutes.value = alarm.snoozeMinutes || 5;
    createDayCheckboxes();
    [...el.dayCheckboxes.querySelectorAll('input')].forEach((c) => {
      c.checked = alarm.days.includes(Number(c.value));
    });
    renderAlbums(alarm.albumIds);
  } else if (action === 'toggle') {
    alarm.enabled = target.checked;
  }

  saveState();
  renderAlarms();
}

function parseTokenFromHash() {
  if (!location.hash.includes('access_token=')) return;
  const params = new URLSearchParams(location.hash.slice(1));
  const accessToken = params.get('access_token');
  const expiresIn = Number(params.get('expires_in') || 3600);
  if (!accessToken) return;

  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + expiresIn * 1000));
  state.token = accessToken;
  history.replaceState({}, '', location.pathname);
}

function startSpotifyAuth() {
  if (!saveSettings()) return;

  const scope = encodeURIComponent('user-library-read user-read-playback-state user-modify-playback-state streaming');
  const authUrl = `https://accounts.spotify.com/authorize?client_id=${state.settings.clientId}&response_type=token&redirect_uri=${encodeURIComponent(state.settings.redirectUri)}&scope=${scope}`;
  location.href = authUrl;
}

async function fetchSavedAlbums() {
  if (!state.token) return;
  const resp = await fetch('https://api.spotify.com/v1/me/albums?limit=50', {
    headers: { Authorization: `Bearer ${state.token}` },
  });
  if (!resp.ok) {
    el.spotifyStatus.textContent = 'Spotify接続エラー。再接続してください。';
    return;
  }
  const data = await resp.json();
  state.albums = (data.items || []).map((item) => ({
    id: item.album.id,
    name: item.album.name,
    artist: item.album.artists.map((a) => a.name).join(', '),
  }));
  renderAlbums();
}

function updateSpotifyStatus() {
  const base = isSettingsReady()
    ? `設定済み: ${state.settings.displayName} さん`
    : '未設定: まずトップ画面で設定を保存してください';
  el.spotifyStatus.textContent = state.token ? `${base} / Spotify接続済み` : `${base} / Spotify未接続`;
}

async function chooseRandomTrack(alarm) {
  const albumId = alarm.albumIds[Math.floor(Math.random() * alarm.albumIds.length)];
  const resp = await fetch(`https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`, {
    headers: { Authorization: `Bearer ${state.token}` },
  });
  if (!resp.ok) {
    return { trackName: '取得失敗', albumName: '不明', openUrl: `https://open.spotify.com/album/${albumId}` };
  }
  const data = await resp.json();
  const tracks = data.items || [];
  if (!tracks.length) {
    return { trackName: 'トラックなし', albumName: '不明', openUrl: `https://open.spotify.com/album/${albumId}` };
  }
  const t = tracks[Math.floor(Math.random() * tracks.length)];
  return {
    trackName: t.name,
    albumName: state.albums.find((a) => a.id === albumId)?.name || 'Unknown Album',
    openUrl: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
  };
}

async function triggerAlarm(alarm) {
  if (!state.token) {
    alert('Spotify未接続のため再生できません。');
    return;
  }
  const track = await chooseRandomTrack(alarm);
  state.currentRing = { alarm, track };
  el.ringTrackInfo.textContent = `再生候補: ${track.trackName} / ${track.albumName}`;
  el.ringModal.classList.remove('hidden');
  window.open(track.openUrl, '_blank', 'noopener');
}

function minuteString(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

let lastTriggeredMinute = '';
function tick() {
  const now = new Date();
  const currentMinute = `${now.toDateString()}-${minuteString(now)}`;
  if (currentMinute === lastTriggeredMinute) return;

  const day = now.getDay();
  const time = minuteString(now);
  const matched = state.alarms.find((a) => a.enabled && a.time === time && a.days.includes(day));
  if (!matched) return;

  lastTriggeredMinute = currentMinute;
  triggerAlarm(matched);
}

function stopAlarm() {
  state.currentRing = null;
  el.ringModal.classList.add('hidden');
}

function snoozeAlarm() {
  if (!state.currentRing) return;
  const { alarm } = state.currentRing;
  const snooze = Number(alarm.snoozeMinutes || 5);
  stopAlarm();
  setTimeout(() => {
    triggerAlarm(alarm);
  }, snooze * 60 * 1000);
}

function disconnectSpotify() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXP_KEY);
  state.token = '';
  state.albums = [];
  updateSpotifyStatus();
  renderAlbums();
}

function init() {
  parseTokenFromHash();
  loadState();
  createDayCheckboxes();
  renderAlarms();
  updateSpotifyStatus();
  toggleAppScreens();
  renderAlbums();

  el.settingsForm.addEventListener('submit', (evt) => {
    evt.preventDefault();
    saveSettings();
  });
  el.alarmForm.addEventListener('submit', upsertAlarm);
  el.alarmItems.addEventListener('click', handleAlarmListClick);
  el.connectSpotifyBtn.addEventListener('click', startSpotifyAuth);
  el.disconnectSpotifyBtn.addEventListener('click', disconnectSpotify);
  el.cancelEditBtn.addEventListener('click', resetForm);
  el.openSpotifyBtn.addEventListener('click', () => {
    if (state.currentRing) {
      window.open(state.currentRing.track.openUrl, '_blank', 'noopener');
    }
  });
  el.stopAlarmBtn.addEventListener('click', stopAlarm);
  el.snoozeBtn.addEventListener('click', snoozeAlarm);

  if (state.token) {
    fetchSavedAlbums();
  }

  setInterval(tick, 1000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // ignore
    });
  }
}

init();
