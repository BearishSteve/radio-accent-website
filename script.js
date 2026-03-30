const config = window.RADIO_ACCENT_CONFIG || {};
const playlistHistoryApi = String(config.playlistHistoryApi || '').trim();
const pwaState = window.__RADIO_ACCENT_PWA || {
  deferredPrompt: null,
  installed: false,
  listenersBound: false,
  serviceWorkerRegistered: false
};
window.__RADIO_ACCENT_PWA = pwaState;
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
const header = document.querySelector('.site-header');
const canSpaNavigate = window.location.protocol === 'http:' || window.location.protocol === 'https:';
const CONSENT_KEY = 'radioAccentConsent';
const PLAYER_VOLUME_KEY = 'radioAccentVolume';
const MOBILE_PLAYER_COLLAPSE_KEY = 'radioAccentMobilePlayerCollapsed';
let analyticsInitialized = false;

const getSafeStorage = (type) => {
  try {
    return window[type];
  } catch {
    return null;
  }
};

const getSafeStorageItem = (type, key) => {
  try {
    return getSafeStorage(type)?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const setSafeStorageItem = (type, key, value) => {
  try {
    const storage = getSafeStorage(type);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Failed to write ${type} key "${key}".`, error);
    return false;
  }
};

const streamOptions = config.streams || {
  low: config.streamUrl || '',
  high: config.streamUrl || ''
};

const isAppleMobileDevice = (() => {
  const userAgent = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  return /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && touchPoints > 1);
})();

const isMobilePlayerViewport = () => window.matchMedia('(max-width: 980px)').matches;
const isCoarsePointerDevice = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const shouldHidePlayerShare = () => isAppleMobileDevice || isMobilePlayerViewport() || isCoarsePointerDevice();

const configuredDefaultQuality = String(config.defaultStreamQuality || '').trim().toLowerCase();
const defaultQuality = streamOptions[configuredDefaultQuality]
  ? configuredDefaultQuality
  : (streamOptions.high ? 'high' : 'low');
const initialQuality = defaultQuality;
let autoFallbackApplied = false;
let waitingFallbackTimer = null;

const playerState = window.__RADIO_ACCENT_PLAYER_STATE || {
  playing: false,
  quality: initialQuality,
  mode: 'live',
  mix: null,
  isBuffering: false
};
const playerAudio = window.__RADIO_ACCENT_PLAYER_AUDIO || new Audio('');
const livePlayerMeta = window.__RADIO_ACCENT_LIVE_META || {
  artist: config.defaultNowPlaying?.artist || 'Radio Accent',
  title: config.defaultNowPlaying?.title || 'Live',
  cover: config.defaultDabSlide || 'assets/logo_dab.png',
  duration: 0,
  startedAt: '',
  endsAt: '',
  updatedAt: '',
  nextTitle: '',
  nextDuration: '',
  nextImage: ''
};
const rawStoredVolume = getSafeStorageItem('localStorage', PLAYER_VOLUME_KEY);
const storedVolume = rawStoredVolume === null || rawStoredVolume === ''
  ? null
  : Number(rawStoredVolume);
const resumeWasPlaying = getSafeStorageItem('sessionStorage', 'radioAccentWasPlaying') === 'true';
let mobilePlayerCollapsed = getSafeStorageItem('localStorage', MOBILE_PLAYER_COLLAPSE_KEY) === 'true';

playerAudio.crossOrigin = 'anonymous';

if (isAppleMobileDevice) {
  playerAudio.volume = 1;
} else if (!Number.isNaN(storedVolume) && storedVolume !== null && storedVolume >= 0 && storedVolume <= 1) {
  playerAudio.volume = storedVolume;
} else {
  playerAudio.volume = 0.85;
}


window.__RADIO_ACCENT_PLAYER_STATE = playerState;
window.__RADIO_ACCENT_PLAYER_AUDIO = playerAudio;
window.__RADIO_ACCENT_LIVE_META = livePlayerMeta;
const mixDurationCache = window.__RADIO_ACCENT_MIX_DURATION_CACHE || {};
window.__RADIO_ACCENT_MIX_DURATION_CACHE = mixDurationCache;
let activeMixArchiveRequestToken = 0;

const setText = (selector, value) => {
  if (!value) return;
  document.querySelectorAll(selector).forEach((el) => {
    el.textContent = value;
  });
};

const updateMediaSession = ({ artist = '', title = '', cover = '' } = {}) => {
  if (!('mediaSession' in navigator) || typeof window.MediaMetadata !== 'function') return;

  const fallbackCover = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
  const artworkSrc = sanitizeMediaUrl(cover, { fallback: fallbackCover });
  const nextSignature = JSON.stringify({
    title: title || 'Live',
    artist: artist || config.stationName || 'Radio Accent',
    album: config.stationName || 'Radio Accent',
    artworkSrc
  });

  if (window.__RADIO_ACCENT_MEDIA_SESSION_SIGNATURE === nextSignature) {
    return;
  }
  window.__RADIO_ACCENT_MEDIA_SESSION_SIGNATURE = nextSignature;

  navigator.mediaSession.metadata = new window.MediaMetadata({
    title: title || 'Live',
    artist: artist || config.stationName || 'Radio Accent',
    album: config.stationName || 'Radio Accent',
    artwork: artworkSrc ? [
      { src: artworkSrc, sizes: '96x96' },
      { src: artworkSrc, sizes: '128x128' },
      { src: artworkSrc, sizes: '192x192' },
      { src: artworkSrc, sizes: '256x256' },
      { src: artworkSrc, sizes: '384x384' },
      { src: artworkSrc, sizes: '512x512' }
    ] : []
  });
};

const updateMediaSessionPlayback = () => {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = playerState.playing ? 'playing' : 'paused';

  if (typeof navigator.mediaSession.setPositionState === 'function') {
    if (playerState.mode === 'mix') {
      const duration = Number.isFinite(playerAudio.duration) && playerAudio.duration > 0 ? playerAudio.duration : 0;
      if (duration > 0) {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: playerAudio.playbackRate || 1,
          position: Math.min(playerAudio.currentTime || 0, duration)
        });
        return;
      }
    } else {
      const liveProgress = getLiveTrackProgress();
      if (liveProgress.active && liveProgress.duration > 0) {
        navigator.mediaSession.setPositionState({
          duration: liveProgress.duration,
          playbackRate: 1,
          position: Math.min(liveProgress.current || 0, liveProgress.duration)
        });
        return;
      }
    }
  }

  if (typeof navigator.mediaSession.setPositionState === 'function') {
    try {
      navigator.mediaSession.setPositionState(null);
    } catch {
      // Older engines may reject clearing position state.
    }
  }
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

const getEmptyStateToneLabel = (tone) => {
  if (tone === 'warning') return 'Let op';
  if (tone === 'error') return 'Niet beschikbaar';
  if (tone === 'success') return 'In orde';
  return 'Status';
};

const renderEmptyStateCard = ({
  title = 'Nog geen data',
  text = '',
  tone = 'info',
  compact = false
} = {}) => `
  <article class="ui-empty-state${compact ? ' is-compact' : ''}" data-tone="${escapeHtml(tone)}">
    <p class="ui-empty-eyebrow">${escapeHtml(getEmptyStateToneLabel(tone))}</p>
    <h3>${escapeHtml(title)}</h3>
    ${text ? `<p>${escapeHtml(text)}</p>` : ''}
  </article>
`;

const resolveBaseUrl = (baseUrl = window.location.href) => {
  try {
    return new URL(baseUrl || window.location.href, window.location.href).href;
  } catch {
    return window.location.href;
  }
};

const sanitizeMediaUrl = (value, { baseUrl = window.location.href, fallback = '' } = {}) => {
  if (!value || typeof value !== 'string') return fallback;
  try {
    const resolved = new URL(value, resolveBaseUrl(baseUrl));
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return fallback;
    }
    return resolved.href;
  } catch {
    return fallback;
  }
};

const sanitizeLinkUrl = (value, { baseUrl = window.location.href, fallback = '#' } = {}) => {
  if (!value || typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return fallback;
  if (trimmed.startsWith('#')) return trimmed;

  try {
    const resolved = new URL(trimmed, resolveBaseUrl(baseUrl));
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(resolved.protocol)) {
      return fallback;
    }
    return resolved.href;
  } catch {
    return fallback;
  }
};

const wireImageFallback = (img, fallback) => {
  if (!img || !fallback) return;
  const originalSrc = String(img.getAttribute('src') || img.src || '').trim();
  img.onerror = null;
  img.onerror = () => {
    if (originalSrc && originalSrc !== fallback) {
      const cache = window.__RADIO_ACCENT_BROKEN_IMAGES || new Set();
      if (!cache.has(originalSrc)) {
        cache.add(originalSrc);
        window.__RADIO_ACCENT_BROKEN_IMAGES = cache;
        console.warn('Image fallback applied for missing artwork.', originalSrc);
      }
    }
    img.onerror = null;
    img.src = fallback;
  };
};

const getStreamUrlForQuality = (quality) => {
  if (quality === 'low' && streamOptions.low) return streamOptions.low;
  if (quality === 'high' && streamOptions.high) return streamOptions.high;
  return streamOptions.high || streamOptions.low || config.streamUrl || '';
};

const getDefaultLiveStreamUrl = () => getStreamUrlForQuality(defaultQuality);

const getActiveStreamUrl = () => {
  if (playerState.mode === 'mix' && playerState.mix?.streamUrl) {
    return playerState.mix.streamUrl;
  }
  return getStreamUrlForQuality(playerState.quality || defaultQuality);
};

const savePlaybackSnapshot = () => {
  setSafeStorageItem('sessionStorage', 'radioAccentWasPlaying', String(playerState.playing));
  setSafeStorageItem('sessionStorage', 'radioAccentQuality', playerState.quality || defaultQuality);
};

const applyDeviceClasses = () => {
  document.body.classList.toggle('device-ios', isAppleMobileDevice);
};

const syncMobilePlayerCollapseUi = () => {
  const dock = document.getElementById('player-dock');
  const content = document.getElementById('player-dock-content');
  const toggle = document.getElementById('player-mobile-toggle');
  const share = document.getElementById('player-share');
  if (!dock || !content || !toggle) return;

  const canCollapse = isMobilePlayerViewport();
  const collapsed = canCollapse && mobilePlayerCollapsed;

  dock.classList.toggle('is-collapsed', collapsed);
  content.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
  toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  toggle.setAttribute('aria-label', collapsed ? 'Toon de player' : 'Verberg de player');
  document.body.classList.toggle('player-dock-collapsed', collapsed);
  if (share) {
    share.hidden = shouldHidePlayerShare();
    share.setAttribute('aria-hidden', share.hidden ? 'true' : 'false');
  }
};

const setMobilePlayerCollapsed = (collapsed) => {
  mobilePlayerCollapsed = Boolean(collapsed);
  setSafeStorageItem('localStorage', MOBILE_PLAYER_COLLAPSE_KEY, String(mobilePlayerCollapsed));
  syncMobilePlayerCollapseUi();
};

const setPlayerPresentation = ({ kicker = '', artist = '', title = '', cover = '' } = {}) => {
  const playerKicker = document.querySelector('.player-kicker');
  const playerArtist = document.getElementById('player-track-artist');
  const playerTitle = document.getElementById('player-track-title');
  const playerCover = document.getElementById('player-cover');
  const fallbackCover = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });

  if (playerKicker) playerKicker.textContent = kicker;
  if (playerArtist) playerArtist.textContent = artist;
  if (playerTitle) playerTitle.textContent = title;
  const resolvedCover = sanitizeMediaUrl(cover, { fallback: fallbackCover });
  if (playerCover) {
    wireImageFallback(playerCover, fallbackCover);
    const nextCover = resolvedCover || fallbackCover;
    if (playerCover.getAttribute('src') !== nextCover) {
      playerCover.src = nextCover;
    }
  }
  updateMediaSession({ artist, title, cover: resolvedCover });
};

const getSharePayload = () => {
  const isMixMode = playerState.mode === 'mix' && playerState.mix;
  const artist = isMixMode
    ? String(playerState.mix?.title || '').trim()
    : String(livePlayerMeta.artist || '').trim();
  const title = isMixMode
    ? String(playerState.mix?.dj || playerState.mix?.description || config.stationName || 'Radio Accent').trim()
    : String(livePlayerMeta.title || '').trim();
  const shareUrl = new URL('index.html', window.location.href).href;
  const shareText = artist && title
    ? `Nu op ${config.stationName || 'Radio Accent'}: ${artist} - ${title}`
    : `Luister live naar ${config.stationName || 'Radio Accent'}`;

  return {
    title: `${config.stationName || 'Radio Accent'} live`,
    text: shareText,
    url: shareUrl
  };
};

const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const helper = document.createElement('textarea');
  helper.value = text;
  helper.setAttribute('readonly', 'true');
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  document.body.appendChild(helper);
  helper.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(helper);
  return copied;
};

const setShareButtonFeedback = (text) => {
  const button = document.getElementById('player-share');
  if (!button) return;
  const defaultLabel = button.dataset.defaultLabel || 'Deel track';
  button.textContent = text;
  if (window.__RADIO_ACCENT_SHARE_FEEDBACK_TIMER) {
    window.clearTimeout(window.__RADIO_ACCENT_SHARE_FEEDBACK_TIMER);
  }
  window.__RADIO_ACCENT_SHARE_FEEDBACK_TIMER = window.setTimeout(() => {
    button.textContent = defaultLabel;
  }, 1800);
};

const shareCurrentTrack = async () => {
  const payload = getSharePayload();

  try {
    if (typeof navigator.share === 'function') {
      await navigator.share(payload);
      setShareButtonFeedback('Gedeeld');
      return;
    }

    await copyTextToClipboard(`${payload.text} ${payload.url}`);
    setShareButtonFeedback('Gekopieerd');
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return;
    }
    console.error('Share action failed.', error);
    setShareButtonFeedback('Niet gelukt');
  }
};

const formatPlayerTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const getLiveTrackProgress = () => {
  const duration = Number(livePlayerMeta.duration || 0);
  const startedAt = String(livePlayerMeta.startedAt || '').trim();
  if (!duration || !startedAt) {
    return { active: false, duration: 0, current: 0 };
  }

  const startedTimestamp = new Date(startedAt).getTime();
  if (Number.isNaN(startedTimestamp)) {
    return { active: false, duration: 0, current: 0 };
  }

  const elapsed = Math.max(0, Math.floor((Date.now() - startedTimestamp) / 1000));
  return {
    active: true,
    duration,
    current: Math.min(duration, elapsed)
  };
};

const maybeRefreshMetadataAtTrackBoundary = (liveProgress) => {
  if (playerState.mode !== 'live' || !playerState.playing || !liveProgress?.active) return;

  const duration = Number(liveProgress.duration || 0);
  const current = Number(liveProgress.current || 0);
  const currentTrackKey = [
    String(livePlayerMeta.artist || '').trim(),
    String(livePlayerMeta.title || '').trim(),
    String(livePlayerMeta.startedAt || '').trim(),
    String(livePlayerMeta.updatedAt || '').trim()
  ].join('::');

  if (!duration || !currentTrackKey) return;

  if (current + 1 < duration) {
    window.__RADIO_ACCENT_BOUNDARY_REFRESH_KEY = '';
    return;
  }

  if (window.__RADIO_ACCENT_BOUNDARY_REFRESH_KEY === currentTrackKey) return;
  window.__RADIO_ACCENT_BOUNDARY_REFRESH_KEY = currentTrackKey;
  void refreshMetadata();
};

const updatePlaybackProgressUi = () => {
  const dock = document.getElementById('player-dock');
  const trackPanel = dock?.querySelector('.player-track-panel');
  const wrap = document.getElementById('player-mix-progress');
  const range = document.getElementById('player-progress');
  const current = document.getElementById('player-progress-current');
  const duration = document.getElementById('player-progress-duration');
  if (!wrap || !range || !current || !duration) return;

  const isMixMode = playerState.mode === 'mix';
  const liveProgress = !isMixMode ? getLiveTrackProgress() : { active: false, duration: 0, current: 0 };
  const showProgress = isMixMode || liveProgress.active;

  if (dock) dock.classList.toggle('player-dock-mix-mode', showProgress);
  if (trackPanel) trackPanel.classList.toggle('player-track-panel-mix-mode', showProgress);
  wrap.hidden = !showProgress;
  if (!showProgress) {
    range.value = '0';
    range.max = '1';
    range.disabled = true;
    current.textContent = '0:00';
    duration.textContent = '0:00';
    return;
  }

  if (isMixMode) {
    const durationValue = Number.isFinite(playerAudio.duration) ? playerAudio.duration : 0;
    const currentValue = Number.isFinite(playerAudio.currentTime) ? playerAudio.currentTime : 0;
    const canSeek = durationValue > 0 && Number.isFinite(durationValue) && playerAudio.seekable.length > 0;

    range.max = String(Math.max(1, Math.floor(durationValue || 1)));
    range.value = String(Math.min(Math.floor(currentValue), Math.floor(durationValue || 0)));
    range.disabled = !canSeek;
    current.textContent = formatPlayerTime(currentValue);
    duration.textContent = formatPlayerTime(durationValue);
    updateMediaSessionPlayback();
    return;
  }

  range.max = String(Math.max(1, Math.floor(liveProgress.duration || 1)));
  range.value = String(Math.min(Math.floor(liveProgress.current), Math.floor(liveProgress.duration || 0)));
  range.disabled = true;
  current.textContent = formatPlayerTime(liveProgress.current);
  duration.textContent = formatPlayerTime(liveProgress.duration);
  maybeRefreshMetadataAtTrackBoundary(liveProgress);
  updateMediaSessionPlayback();
};

const syncPlayerPresentation = () => {
  if (playerState.mode === 'mix' && playerState.mix) {
    setPlayerPresentation({
      kicker: playerState.mix.schedule || 'Mix programma',
      artist: playerState.mix.title,
      title: playerState.mix.dj || playerState.mix.description || 'Radio Accent',
      cover: playerState.mix.cover || config.defaultDabSlide || 'assets/logo_dab.png'
    });
    updateProgramNowNextUi();
    return;
  }

  setPlayerPresentation({
    kicker: `Nu live op ${config.stationName || 'Radio Accent'}`,
    artist: livePlayerMeta.artist,
    title: livePlayerMeta.title,
    cover: livePlayerMeta.cover
  });
  updateProgramNowNextUi();
};

const setPlayerModeLive = () => {
  playerState.mode = 'live';
  playerState.mix = null;
  syncPlayerPresentation();
  updatePlaybackProgressUi();
};

const setPlayerModeMix = (mix) => {
  playerState.mode = 'mix';
  playerState.mix = {
    title: String(mix.title || '').trim() || 'Mix',
    dj: String(mix.dj || '').trim(),
    description: String(mix.description || '').trim(),
    schedule: String(mix.schedule || '').trim(),
    streamUrl: sanitizeMediaUrl(String(mix.streamUrl || '').trim()),
    cover: sanitizeMediaUrl(String(mix.cover || '').trim(), { fallback: config.defaultDabSlide || 'assets/logo_dab.png' })
  };
  syncPlayerPresentation();
};

const CONTACT_PHONE_PLACEHOLDER = '+32 (0)0 00 00 00';

const isMeaningfulContactValue = (value, type = 'text') => {
  const safeValue = String(value || '').trim();
  if (!safeValue) return false;
  if (type === 'phone' && safeValue === CONTACT_PHONE_PLACEHOLDER) return false;
  return true;
};

const applyContactValue = (selector, value, type = 'text') => {
  document.querySelectorAll(selector).forEach((element) => {
    const hasValue = isMeaningfulContactValue(value, type);
    const wrapper = element.closest('[data-contact-block]') || element.closest('p') || element;
    if (wrapper instanceof HTMLElement) {
      wrapper.hidden = !hasValue;
    }
    if (hasValue) {
      element.textContent = String(value).trim();
    }
  });
};

const setContact = () => {
  const contact = config.contact || {};
  applyContactValue('[data-contact-email]', contact.email);
  applyContactValue('[data-contact-phone]', contact.phone, 'phone');
  applyContactValue('[data-contact-address1]', contact.addressLine1);
  applyContactValue('[data-contact-address2]', contact.addressLine2);
};

const setBranding = () => {
  setText('[data-station-name]', config.stationName);
  setText('[data-station-tagline]', config.tagline);
  const liveStream = getDefaultLiveStreamUrl();
  if (!liveStream) return;
  document.querySelectorAll('[data-stream-link]').forEach((link) => {
    link.setAttribute('href', liveStream);
  });
};

const METADATA_HISTORY_KEY = 'radioAccentMetadataHistoryV1';
const metadataHistoryLimit = 60;
const playlistPageSize = 200;
const playlistDefaultDays = 7;
const playlistDefaultKind = '';
const PLAYLIST_ALLOWED_KINDS = ['', 'music', 'news', 'weather', 'traffic', 'promo'];
const HISTORY_KIND_LABELS = {
  music: 'Muziek',
  news: 'Nieuws',
  weather: 'Weer',
  traffic: 'Verkeer',
  promo: 'Promo'
};
const playlistState = window.__RADIO_ACCENT_PLAYLIST_STATE || {
  active: false,
  days: playlistDefaultDays,
  kind: playlistDefaultKind,
  query: '',
  offset: 0,
  total: 0,
  loading: false,
  hasMore: false,
  source: 'loading'
};
window.__RADIO_ACCENT_PLAYLIST_STATE = playlistState;
const nowPlayingStreamApi = String(config.nowPlayingStreamApi || '').trim();
const nowPlayingPollInterval = Number(config.nowPlayingPollInterval) > 0 ? Number(config.nowPlayingPollInterval) : 15000;
const keywordCoverRules = Array.isArray(config.keywordCovers) ? config.keywordCovers : [];
const defaultHistoryKindRules = Array.isArray(config.historyKinds) ? config.historyKinds : [];

const normalizePayload = (raw) => {
  if (Array.isArray(raw)) return raw[0] || {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw || {};
};

const getClockLabel = (date = new Date()) => date.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
const getTrackTimeLabel = (value, fallback = '--:--') => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : getClockLabel(date);
};
const getTrackDateLabel = (value, fallback = '') => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
};
const normalizeNeedle = (value) => String(value || '').trim().toLowerCase();
const normalizeHistoryKindRule = (item) => {
  const kind = normalizeNeedle(item?.kind);
  const keywords = Array.isArray(item?.keywords)
    ? item.keywords.map((keyword) => normalizeNeedle(keyword)).filter(Boolean)
    : String(item?.keywords || '')
      .split(',')
      .map((keyword) => normalizeNeedle(keyword))
      .filter(Boolean);
  if (!['news', 'weather', 'traffic', 'promo'].includes(kind) || !keywords.length) return null;
  return { kind, keywords: [...new Set(keywords)] };
};
const sanitizeHistoryKindRules = (rules) => {
  const safeRules = Array.isArray(rules) ? rules.map(normalizeHistoryKindRule).filter(Boolean) : [];
  return safeRules.length ? safeRules : defaultHistoryKindRules.map(normalizeHistoryKindRule).filter(Boolean);
};
let historyKindRules = sanitizeHistoryKindRules(defaultHistoryKindRules);
const setHistoryKindRules = (rules) => {
  historyKindRules = sanitizeHistoryKindRules(rules);
  return historyKindRules;
};
const getHistoryKindRules = () => historyKindRules;
const detectHistoryKindFromRules = ({ artist = '', title = '', kind = '', rules = getHistoryKindRules() } = {}) => {
  const explicitKind = normalizeNeedle(kind);
  if (PLAYLIST_ALLOWED_KINDS.includes(explicitKind) && explicitKind) {
    return explicitKind;
  }

  const haystack = normalizeNeedle(`${artist} ${title}`);
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (rule.keywords.some((keyword) => keyword && haystack.includes(keyword))) {
      return rule.kind;
    }
  }

  return 'music';
};
const getTrackKind = ({ artist = '', title = '', kind = '' } = {}) => detectHistoryKindFromRules({ artist, title, kind });
const getTrackKindLabel = (kind) => HISTORY_KIND_LABELS[String(kind || '').trim()] || HISTORY_KIND_LABELS.music;

const findKeywordCoverMatch = ({ artist = '', title = '', rules = [] } = {}) => {
  const haystack = `${String(artist || '').trim()} ${String(title || '').trim()}`.toLowerCase();
  if (!haystack.trim()) return null;

  for (const rule of rules) {
    const keywords = Array.isArray(rule?.keywords) ? rule.keywords : [];
    const matched = keywords.some((keyword) => {
      const needle = String(keyword || '').trim().toLowerCase();
      return needle && haystack.includes(needle);
    });
    if (matched) {
      return {
        cover: String(rule?.cover || '').trim(),
        keywords: keywords.map((keyword) => String(keyword || '').trim()).filter(Boolean)
      };
    }
  }

  return null;
};

const getKeywordCoverRules = () => {
  try {
    const cmsData = getCmsData();
    return Array.isArray(cmsData?.keywordCovers) ? cmsData.keywordCovers : keywordCoverRules;
  } catch {
    return keywordCoverRules;
  }
};

const findKeywordCover = ({ artist = '', title = '' } = {}) => {
  const match = findKeywordCoverMatch({
    artist,
    title,
    rules: getKeywordCoverRules()
  });
  return String(match?.cover || '').trim();
};

const resolveTrackImage = ({ artist = '', title = '', image = '' } = {}) => {
  const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
  const explicitImage = sanitizeMediaUrl(image, { fallback: '' });
  if (explicitImage) {
    return explicitImage;
  }
  const keywordCover = findKeywordCover({ artist, title });
  return sanitizeMediaUrl(keywordCover, { fallback: fallbackImage });
};

const sanitizeHistoryTrack = (item) => {
  if (!item || typeof item !== 'object') return null;
  const artist = String(item.artist || '').trim();
  const title = String(item.title || '').trim();
  if (!artist && !title) return null;
  const startedAt = String(item.startedAt || '').trim();
  const updatedAt = String(item.updatedAt || '').trim();
  const time = String(item.time || '').trim() || getTrackTimeLabel(startedAt || updatedAt, '--:--');
  const kind = getTrackKind({ artist, title, kind: item.kind });
  return {
    id: String(item.id || '').trim(),
    artist: artist || config.stationName || 'Radio Accent',
    title: title || 'Track',
    time,
    date: getTrackDateLabel(startedAt || updatedAt),
    image: resolveTrackImage({ artist, title, image: item.image || item.cover || '' }),
    duration: Number(item.duration || 0),
    startedAt,
    updatedAt,
    kind,
    kindLabel: getTrackKindLabel(kind)
  };
};

const getStoredMetadataHistory = () => {
  try {
    const raw = getSafeStorageItem('localStorage', METADATA_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => sanitizeHistoryTrack(item)).filter(Boolean).slice(0, metadataHistoryLimit);
  } catch {
    return [];
  }
};

const setStoredMetadataHistory = (tracks) => {
  const safe = Array.isArray(tracks)
    ? tracks.map((item) => sanitizeHistoryTrack(item)).filter(Boolean).slice(0, metadataHistoryLimit)
    : [];
  setSafeStorageItem('localStorage', METADATA_HISTORY_KEY, JSON.stringify(safe));
  return safe;
};

const persistMetadataHistory = (tracks) => {
  try {
    return setStoredMetadataHistory(tracks);
  } catch (error) {
    console.error('Failed to persist metadata history.', error);
    return Array.isArray(tracks)
      ? tracks.map((item) => sanitizeHistoryTrack(item)).filter(Boolean).slice(0, metadataHistoryLimit)
      : [];
  }
};

const rememberCurrentTrack = (track) => {
  const normalized = sanitizeHistoryTrack(track);
  if (!normalized) return getStoredMetadataHistory();

  const history = getStoredMetadataHistory();
  const [current, ...rest] = history;
  if (current && current.artist === normalized.artist && current.title === normalized.title) {
    return setStoredMetadataHistory([
      { ...current, image: normalized.image || current.image, time: normalized.time || current.time },
      ...rest
    ]);
  }

  return setStoredMetadataHistory([normalized, ...history]);
};

const findFirstString = (value, keyPattern) => {
  if (!value || typeof value === 'string') return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstString(item, keyPattern);
      if (found) return found;
    }
    return '';
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (keyPattern.test(key) && typeof nestedValue === 'string' && nestedValue.trim()) {
      return nestedValue.trim();
    }
  }

  for (const nestedValue of Object.values(value)) {
    if (nestedValue && typeof nestedValue === 'object') {
      const found = findFirstString(nestedValue, keyPattern);
      if (found) return found;
    }
  }

  return '';
};

const parseArtistTitleString = (input) => {
  if (!input || typeof input !== 'string') return { artist: '', title: '' };
  const separators = [' - ', ' \u2013 ', ' \u2014 '];
  for (const separator of separators) {
    if (input.includes(separator)) {
      const [artist, ...rest] = input.split(separator);
      return { artist: artist.trim(), title: rest.join(separator).trim() };
    }
  }
  return { artist: '', title: input.trim() };
};

const resolveMediaUrl = (value, baseUrl) => sanitizeMediaUrl(value, { baseUrl: baseUrl || window.location.origin, fallback: '' });

const parseMetadataTextLine = (raw, sourceUrl) => {
  if (!raw || typeof raw !== 'string') return null;
  const line = raw.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
  if (!line) return null;

  const [trackPart, coverPart = ''] = line.split('|');
  const parsed = parseArtistTitleString(trackPart.trim());
  if (!parsed.artist && !parsed.title) return null;

  return {
    artist: parsed.artist || 'Radio Accent',
    title: parsed.title || 'Live',
    image: sanitizeMediaUrl(coverPart.trim(), {
      baseUrl: sourceUrl || window.location.href,
      fallback: sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' })
    })
  };
};

const getWeatherFromMetadata = (data) => {
  const weather = data?.weather || data?.meteo || data?.forecast || {};
  const icon = weather.icon || weather.image || data?.weather_icon || data?.meteo_icon || data?.temp_icon || '';
  const temperature = weather.temperature || weather.temp || data?.temperature || data?.temp || '';
  return {
    icon: sanitizeMediaUrl(icon, {
      fallback: sanitizeMediaUrl(config.weather?.icon || 'assets/weather-cloud.svg', { fallback: 'assets/weather-cloud.svg' })
    }),
    temperature: String(temperature || config.weather?.temperature || '').trim() || '9\u00B0C'
  };
};

const WEATHER_CACHE_KEY = 'radioAccentLiveWeatherV1';

const sanitizeLiveWeatherData = (weatherData) => {
  if (!weatherData || typeof weatherData !== 'object') return null;

  const location = String(weatherData.location || '').trim();
  const temperature = String(weatherData.temperature || '').trim();
  const icon = String(weatherData.icon || '').trim();
  const condition = String(weatherData.condition || '').trim();
  const forecast = Array.isArray(weatherData.forecast)
    ? weatherData.forecast.slice(0, 3).map((item) => ({
      time: String(item?.time || '').trim(),
      temperature: String(item?.temperature || '').trim(),
      icon: String(item?.icon || '').trim()
    }))
    : [];

  if (!location && !temperature && !icon && !condition && !forecast.length) {
    return null;
  }

  return { location, temperature, icon, condition, forecast };
};

const getStoredWeatherData = () => {
  try {
    const memoryWeather = sanitizeLiveWeatherData(window.__RADIO_ACCENT_LIVE_WEATHER);
    if (memoryWeather) return memoryWeather;

    const raw = getSafeStorageItem('localStorage', WEATHER_CACHE_KEY);
    if (!raw) return null;
    return sanitizeLiveWeatherData(JSON.parse(raw));
  } catch {
    return null;
  }
};

const setStoredWeatherData = (weatherData) => {
  const safe = sanitizeLiveWeatherData(weatherData);
  if (!safe) return null;
  window.__RADIO_ACCENT_LIVE_WEATHER = safe;
  setSafeStorageItem('localStorage', WEATHER_CACHE_KEY, JSON.stringify(safe));
  return safe;
};

const getTrackFromMetadata = (data) => {
  const directArtist =
    data.artist || data.songartist || data.track_artist || data.now_playing?.song?.artist ||
    data.currenttrack?.artist || data.current?.artist;

  const directTitle =
    data.title || data.songtitle || data.track_title || data.now_playing?.song?.title ||
    data.currenttrack?.title || data.current?.title;

  if (directArtist && directTitle) {
    return { artist: String(directArtist).trim(), title: String(directTitle).trim() };
  }

  const combined =
    data.nowplaying || data.now_playing_text || data.current_song || data.currenttrack?.text || data.song ||
    findFirstString(data, /now.?playing|current.?song|song.?title|track/i);

  return parseArtistTitleString(combined);
};

const getDabSlideFromMetadata = (data, apiUrl) => {
  const direct =
    data.dab_slide || data.dabslide || data.dab_plus_slide || data.dabplus_slide || data.slide || data.image ||
    data.cover || data.artwork || data.currenttrack?.image || data.now_playing?.song?.art;
  const deep = direct || findFirstString(data, /dab|slide|cover|image|artwork|album.?art/i);
  return resolveMediaUrl(deep, apiUrl);
};

const collectArrays = (value, bucket = []) => {
  if (!value || typeof value !== 'object') return bucket;
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object') bucket.push(value);
    value.forEach((item) => collectArrays(item, bucket));
    return bucket;
  }
  Object.values(value).forEach((nested) => collectArrays(nested, bucket));
  return bucket;
};

const pickLastPlayedArray = (data) => {
  const direct =
    data.last_played || data.lastplayed || data.recent || data.history || data.played ||
    data.recent_tracks || data.songhistory || data.now_played;
  if (Array.isArray(direct) && direct.length) return direct;

  const arrays = collectArrays(data, []);
  const scored = arrays
    .map((arr) => {
      const sample = arr[0] || {};
      const keys = Object.keys(sample).join(' ').toLowerCase();
      let score = 0;
      if (/artist/.test(keys)) score += 2;
      if (/title|song|track/.test(keys)) score += 2;
      if (/time|played|date/.test(keys)) score += 1;
      if (/image|cover|art/.test(keys)) score += 1;
      return { arr, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.arr || [];
};

const normalizeLastPlayedItem = (item, apiUrl) => {
  if (!item || typeof item !== 'object') return null;

  const artist = item.artist || item.songartist || item.track_artist || item.performer || item.band || '';
  const title = item.title || item.songtitle || item.track_title || item.song || item.track || '';

  let parsed = { artist: String(artist || '').trim(), title: String(title || '').trim() };
  if (!parsed.artist || !parsed.title) {
    parsed = parseArtistTitleString(item.text || item.label || item.nowplaying || item.name || item.value || '');
  }
  if (!parsed.artist && !parsed.title) return null;

  return {
    artist: parsed.artist || config.stationName || 'Radio Accent',
    title: parsed.title || 'Track',
    time: String(item.time || item.played_at || item.playtime || item.timestamp || item.datetime || '').trim(),
    image: resolveMediaUrl(item.image || item.cover || item.artwork || item.art || item.thumbnail || '', apiUrl)
  };
};

const normalizeNowPlayingPayload = (payload) => {
  const data = payload?.ok && payload?.data
    ? payload.data
    : (payload?.track ? payload : (payload?.data && payload.data.track ? payload.data : null));
  if (!data || typeof data !== 'object') return null;

  const trackData = data.track && typeof data.track === 'object' ? data.track : null;
  const historyData = Array.isArray(data.history) ? data.history : [];
  const trackArtist = String(trackData?.artist || '').trim();
  const trackTitle = String(trackData?.title || '').trim();
  const normalizedTrack = trackData ? {
    artist: trackArtist,
    title: trackTitle,
    time: getTrackTimeLabel(trackData.startedAt || trackData.updatedAt, getClockLabel()),
    image: resolveTrackImage({ artist: trackArtist, title: trackTitle, image: trackData.cover || '' }),
    duration: Number(trackData.duration || 0),
    startedAt: String(trackData.startedAt || ''),
    endsAt: String(trackData.endsAt || ''),
    updatedAt: String(trackData.updatedAt || '')
  } : null;

  const lastPlayed = historyData
    .map((item) => sanitizeHistoryTrack({
      artist: item.artist,
      title: item.title,
      time: getTrackTimeLabel(item.startedAt || item.updatedAt),
      image: item.cover || item.image || ''
    }))
    .filter(Boolean);

  if (!normalizedTrack) return null;

  return {
    track: normalizedTrack,
    slideUrl: normalizedTrack?.image || '',
    lastPlayed: lastPlayed.length ? lastPlayed : [normalizedTrack],
    version: String(payload?.version || trackData?.updatedAt || trackData?.startedAt || trackData?.id || '').trim()
  };
};

const fetchJsonMetadata = async () => {
  if (!config.nowPlayingApi) return null;
  const response = await fetch(`${config.nowPlayingApi}?_=${Date.now()}`, { method: 'GET', cache: 'no-store' });
  if (!response.ok) return null;

  const payload = await response.json().catch(() => null);
  return normalizeNowPlayingPayload(payload);
};

const decodeHtmlEntities = (value) => {
  if (typeof value !== 'string' || !value) return '';
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
};

const fetchSongInfoData = async () => {
  const endpoint = String(config.songInfoEndpoint || 'api/songinfo.html').trim();
  if (!endpoint) return null;
  const response = await fetch(`${endpoint}?_=${Date.now()}`, { method: 'GET', cache: 'no-store' });
  if (!response.ok) return null;

  const html = await response.text().catch(() => '');
  if (!html) return null;

  const nextMatch = html.match(/<p>\s*Next:\s*([\s\S]*?)<\/p>/i);
  const durationMatch = html.match(/<p>\s*Duration:\s*([\s\S]*?)<\/p>/i);

  return {
    nextTitle: decodeHtmlEntities(String(nextMatch?.[1] || '').trim()),
    nextDuration: decodeHtmlEntities(String(durationMatch?.[1] || '').trim())
  };
};

const fetchTextMetadata = async () => {
  return null;
};

const fetchLiveWeather = async () => {
  const endpoint = String(config.weather?.apiEndpoint || '').trim();
  if (!endpoint) return null;
  const response = await fetch(`${endpoint}?_=${Date.now()}`, { method: 'GET', cache: 'no-store' });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  if (!payload?.ok || !payload.data) return null;
  return {
    icon: payload.data.icon || '',
    temperature: payload.data.temperature || '',
    location: payload.data.location || '',
    condition: payload.data.condition || '',
    forecast: Array.isArray(payload.data.forecast) ? payload.data.forecast : []
  };
};

const setMetadataUpdated = (text) => {
  const el = document.getElementById('metadata-updated');
  if (el) el.textContent = text;
};

const setPlaylistUpdated = (text) => {
  const el = document.getElementById('playlist-updated');
  if (el) el.textContent = text;
};

const setPlaylistStatus = (state, text = '') => {
  const el = document.getElementById('playlist-status');
  if (!el) return;
  const safeState = ['live', 'fallback', 'loading'].includes(String(state || '').trim()) ? String(state).trim() : 'loading';
  const fallbackText = safeState === 'live'
    ? 'Archief live'
    : (safeState === 'fallback' ? 'Lokale fallback' : 'Synchroniseren...');
  el.dataset.state = safeState;
  el.textContent = String(text || '').trim() || fallbackText;
};

const setPlaylistShareFeedback = (text = '') => {
  const el = document.getElementById('playlist-share-feedback');
  if (!el) return;
  el.textContent = String(text || '').trim();
};

const sanitizePlaylistDays = (value) => {
  const allowed = [1, 3, 7, 14, 30];
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return playlistDefaultDays;
  const rounded = Math.round(parsed);
  return allowed.includes(rounded) ? rounded : playlistDefaultDays;
};

const sanitizePlaylistKind = (value) => {
  const safe = String(value || '').trim().toLowerCase();
  return PLAYLIST_ALLOWED_KINDS.includes(safe) ? safe : playlistDefaultKind;
};

const buildPlaylistUrl = () => {
  const next = new URL(window.location.href);
  if (playlistState.days !== playlistDefaultDays) {
    next.searchParams.set('days', String(playlistState.days));
  } else {
    next.searchParams.delete('days');
  }
  if (playlistState.kind) {
    next.searchParams.set('kind', playlistState.kind);
  } else {
    next.searchParams.delete('kind');
  }
  if (playlistState.query) {
    next.searchParams.set('q', playlistState.query);
  } else {
    next.searchParams.delete('q');
  }
  return next;
};

const syncPlaylistUrl = () => {
  if (!window.history?.replaceState) return;
  const next = buildPlaylistUrl();
  window.history.replaceState({}, '', `${next.pathname}${next.search}${next.hash}`);
};

const renderTrack = (artist, title) => {
  const hasArtist = Boolean(String(artist || '').trim());
  const hasTitle = Boolean(String(title || '').trim());
  const safeArtist = hasArtist
    ? String(artist).trim()
    : (hasTitle ? (config.stationName || 'Radio Accent') : (config.defaultNowPlaying?.artist || 'Radio Accent'));
  const safeTitle = hasTitle
    ? String(title).trim()
    : (hasArtist ? 'Live' : (config.defaultNowPlaying?.title || 'Live'));
  const text = `${safeArtist} - ${safeTitle}`;
  const trackElement = document.getElementById('now-playing-track');
  if (trackElement && trackElement.textContent !== text) trackElement.textContent = text;
  const liveTrackTitle = document.getElementById('live-track-title');
  if (liveTrackTitle && liveTrackTitle.textContent !== safeTitle) liveTrackTitle.textContent = safeTitle;
  const liveCoverCaption = document.getElementById('live-cover-caption');
  if (liveCoverCaption && liveCoverCaption.textContent !== safeArtist) liveCoverCaption.textContent = safeArtist;
  livePlayerMeta.artist = safeArtist;
  livePlayerMeta.title = safeTitle;
  renderLiveMediaCycle();
  if (playerState.mode !== 'mix') syncPlayerPresentation();
};

const renderDabSlide = (slideUrl) => {
  const dabImage = document.getElementById('dab-slide-image');
  const fallback = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
  const imageUrl = sanitizeMediaUrl(slideUrl, { fallback });
  if (dabImage) {
    wireImageFallback(dabImage, fallback);
    const nextImage = imageUrl || fallback;
    if (dabImage.getAttribute('src') !== nextImage) {
      dabImage.src = nextImage;
    }
  }
  if (livePlayerMeta.cover !== imageUrl) {
    livePlayerMeta.cover = imageUrl;
  }
  const liveCoverKicker = document.getElementById('live-cover-kicker');
  if (liveCoverKicker && liveCoverKicker.textContent !== 'Now playing') {
    liveCoverKicker.textContent = 'Now playing';
  }
  renderLiveMediaCycle();
  if (playerState.mode !== 'mix') syncPlayerPresentation();
  renderHomePromoStrip();
};

const updateLiveUpdatedLabel = () => {
  const target = document.getElementById('live-updated-label');
  if (!target) return;
  const updatedAt = String(livePlayerMeta.updatedAt || '').trim();
  if (!updatedAt) {
    target.textContent = 'Live metadata wordt bijgewerkt';
    return;
  }
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) {
    target.textContent = `Laatste update: ${updatedAt}`;
    return;
  }
  target.textContent = `Laatste update om ${getClockLabel(parsed)}`;
};

const renderLiveWeather = (weatherData = {}) => {
  const safeWeatherData = sanitizeLiveWeatherData(weatherData) || getStoredWeatherData() || {};
  const weatherWrap = document.querySelector('.live-weather');
  const weatherIcon = document.getElementById('live-weather-icon');
  const weatherTemp = document.getElementById('live-weather-temp');
  const weatherForecast = document.getElementById('live-weather-forecast');
  const fallbackIcon = sanitizeMediaUrl(config.weather?.icon || 'assets/weather-cloud.svg', { fallback: 'assets/weather-cloud.svg' });
  const icon = sanitizeMediaUrl(safeWeatherData.icon || '', { fallback: fallbackIcon });
  const temperature = String(safeWeatherData.temperature || config.weather?.temperature || '9\u00B0C').trim() || '9\u00B0C';
  const location = String(safeWeatherData.location || config.weather?.location || 'Wetteren').trim();
  const condition = String(safeWeatherData.condition || '').trim();
  const forecast = Array.isArray(safeWeatherData.forecast) ? safeWeatherData.forecast.slice(0, 3) : [];

  if (sanitizeLiveWeatherData(safeWeatherData)) {
    setStoredWeatherData(safeWeatherData);
  }

  if (weatherIcon) {
    weatherIcon.src = icon;
    weatherIcon.alt = condition ? `Weericoon: ${condition}` : `Weericoon voor ${location}`;
    weatherIcon.title = condition ? `${location}: ${condition}` : location;
  }
  if (weatherTemp) {
    weatherTemp.textContent = temperature;
    weatherTemp.hidden = true;
  }
  if (weatherForecast) {
    const baseForecast = forecast.length ? forecast : [
      { time: '08u', temperature: temperature, icon },
      { time: '09u', temperature: temperature, icon },
      { time: '10u', temperature: temperature, icon }
    ];
    const safeForecast = [
      { time: 'Nu', temperature, icon },
      ...baseForecast.slice(0, 2)
    ];
    const forecastItems = safeForecast.map((item) => {
      const rawTime = String(item.time || '').trim();
      const compactTime = rawTime === 'Nu' ? rawTime : rawTime.replace(/u00$/i, 'u');
      const time = escapeHtml(compactTime);
      const temp = escapeHtml(String(item.temperature || '').trim());
      const forecastIcon = escapeHtml(sanitizeMediaUrl(item.icon || '', { fallback: fallbackIcon }));
      return `
        <div class="live-weather-hour">
          <span class="live-weather-hour-time">${time}</span>
          <img class="live-weather-hour-icon" src="${forecastIcon}" alt="" aria-hidden="true" />
          <span class="live-weather-hour-temp">${temp}</span>
        </div>
      `;
    }).join('');
    weatherForecast.innerHTML = `<div class="live-weather-forecast-list">${forecastItems}</div>`;
  }
  if (weatherWrap) {
    weatherWrap.setAttribute('aria-label', condition ? `Weerinfo ${location}: ${condition}, ${temperature}` : `Weerinfo ${location}: ${temperature}`);
    weatherWrap.title = condition ? `${location}: ${condition}` : location;
  }
};

const buildLiveMediaPhases = () => {
  const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
  const currentLabel = [String(livePlayerMeta.artist || '').trim(), String(livePlayerMeta.title || '').trim()].filter(Boolean).join(' - ') || (config.stationName || 'Radio Accent');
  const nextLabel = String(livePlayerMeta.nextTitle || '').trim();
  const currentImage = sanitizeMediaUrl(livePlayerMeta.cover || '', { fallback: fallbackImage }) || fallbackImage;
  const nextImage = sanitizeMediaUrl(livePlayerMeta.nextImage || '', { fallback: fallbackImage }) || fallbackImage;
  const phases = [
    {
      kicker: 'Nu op antenne',
      caption: currentLabel,
      image: currentImage,
      weatherFirst: false
    }
  ];

  if (nextLabel) {
    phases.push({
      kicker: 'Zometeen',
      caption: nextLabel,
      image: nextImage,
      weatherFirst: true
    });
  }

  return phases;
};

const renderLiveMediaCycle = ({ reset = false, animate = false } = {}) => {
  const mediaWrap = document.querySelector('.live-card-media');
  const coverPanel = document.getElementById('live-cover-panel');
  const coverImage = document.getElementById('dab-slide-image');
  const coverKicker = document.getElementById('live-cover-kicker');
  const coverCaption = document.getElementById('live-cover-caption');
  if (!mediaWrap || !coverPanel || !coverImage || !coverKicker || !coverCaption) return;

  const phases = buildLiveMediaPhases();
  if (reset || !Number.isInteger(window.__RADIO_ACCENT_LIVE_MEDIA_INDEX)) {
    window.__RADIO_ACCENT_LIVE_MEDIA_INDEX = 0;
  }
  if (window.__RADIO_ACCENT_LIVE_MEDIA_INDEX >= phases.length) {
    window.__RADIO_ACCENT_LIVE_MEDIA_INDEX = 0;
  }

  const activePhase = phases[window.__RADIO_ACCENT_LIVE_MEDIA_INDEX] || phases[0];
  const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
  const nextImage = sanitizeMediaUrl(activePhase?.image || '', { fallback: fallbackImage }) || fallbackImage;

  mediaWrap.classList.toggle('is-weather-first', Boolean(activePhase?.weatherFirst));
  coverKicker.textContent = String(activePhase?.kicker || 'Nu op antenne');
  coverCaption.textContent = String(activePhase?.caption || config.stationName || 'Radio Accent');
  wireImageFallback(coverImage, fallbackImage);
  if (coverImage.getAttribute('src') !== nextImage) {
    coverImage.src = nextImage;
  }

  if (animate) {
    if (window.__RADIO_ACCENT_LIVE_MEDIA_ANIM_TIMER) {
      window.clearTimeout(window.__RADIO_ACCENT_LIVE_MEDIA_ANIM_TIMER);
      window.__RADIO_ACCENT_LIVE_MEDIA_ANIM_TIMER = null;
    }
    mediaWrap.classList.remove('is-fading-in');
    void mediaWrap.offsetWidth;
    mediaWrap.classList.add('is-fading-in');
    window.__RADIO_ACCENT_LIVE_MEDIA_ANIM_TIMER = window.setTimeout(() => {
      mediaWrap.classList.remove('is-fading-in');
      window.__RADIO_ACCENT_LIVE_MEDIA_ANIM_TIMER = null;
    }, 520);
  }
};

const startLiveMediaRotation = () => {
  if (window.__RADIO_ACCENT_LIVE_MEDIA_TIMER) {
    window.clearInterval(window.__RADIO_ACCENT_LIVE_MEDIA_TIMER);
    window.__RADIO_ACCENT_LIVE_MEDIA_TIMER = null;
  }

  renderLiveMediaCycle({ reset: true });

  const phases = buildLiveMediaPhases();
  if (phases.length <= 1) return;

  window.__RADIO_ACCENT_LIVE_MEDIA_TIMER = window.setInterval(() => {
    const nextIndex = Number(window.__RADIO_ACCENT_LIVE_MEDIA_INDEX || 0) + 1;
    window.__RADIO_ACCENT_LIVE_MEDIA_INDEX = nextIndex % Math.max(1, buildLiveMediaPhases().length);
    renderLiveMediaCycle({ animate: true });
  }, 30000);
};

const renderLastPlayed = (tracks) => {
  const list = document.getElementById('last-played-list');
  if (!list) return;
  const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
  const safeTracks = tracks && tracks.length ? tracks : [
    { artist: 'EDWARD MAYA X PAVLO VICCI FEAT. ELIANNE', title: 'Just Like A Song', time: '13:18', image: fallbackImage },
    { artist: 'EDWYN COLLINS', title: 'A Girl Like You', time: '13:14', image: fallbackImage },
    { artist: 'FRANCISCO', title: 'Dance Away', time: '13:11', image: fallbackImage },
    { artist: 'MO-DO', title: 'Eins, Zwei, Polizei', time: '13:08', image: fallbackImage }
  ];

  list.innerHTML = safeTracks.slice(0, 20).map((track) => `
    <article class="last-played-item">
      <img class="last-played-art" src="${escapeHtml(sanitizeMediaUrl(track.image, { fallback: fallbackImage }))}" alt="${escapeHtml(`${track.artist} - ${track.title}`)}" loading="lazy" />
      <span class="last-played-badge">${escapeHtml(track.time || '--:--')}</span>
      <div class="last-played-content">
        <h3>${escapeHtml(track.artist)}</h3>
        <p>${escapeHtml(track.title)}</p>
      </div>
    </article>
  `).join('');

  list.querySelectorAll('.last-played-art').forEach((img) => {
    wireImageFallback(img, fallbackImage);
  });
};


const renderPlaylistHistory = (tracks, {
  append = false,
  emptyTitle = 'History laadt...',
  emptyMessage = 'Nog even, de playlist wordt opgehaald.',
  emptyTone = 'info',
  force = false
} = {}) => {
  const target = document.getElementById('playlist-history');
  if (!target) return;
  if (target.dataset.playlistMode === 'archive' && !append && !force) return;

  const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
  const safeTracks = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
  if (!safeTracks.length) {
    target.innerHTML = renderEmptyStateCard({
      title: emptyTitle,
      text: emptyMessage,
      tone: emptyTone
    });
    return;
  }

  const markup = safeTracks.map((track) => `
    <article class="history-row">
      <img class="history-art" src="${escapeHtml(sanitizeMediaUrl(track.image, { fallback: fallbackImage }))}" alt="${escapeHtml(`${track.artist} - ${track.title}`)}" loading="lazy" />
      <div class="history-copy">
        <h3>${escapeHtml(track.artist)}</h3>
        <p>${escapeHtml(track.title)}</p>
      </div>
      <div class="history-meta">
        <span class="history-time">${escapeHtml(track.time || '--:--')}</span>
        ${track.date ? `<span class="history-date">${escapeHtml(track.date)}</span>` : ''}
        ${track.kindLabel ? `<span class="history-kind">${escapeHtml(track.kindLabel)}</span>` : ''}
      </div>
    </article>
  `).join('');

  if (append) {
    const batch = document.createElement('div');
    batch.innerHTML = markup;
    const images = [...batch.querySelectorAll('.history-art')];
    const rows = [...batch.children];
    target.append(...rows);
    images.forEach((img) => {
      wireImageFallback(img, fallbackImage);
    });
    return;
  }

  target.innerHTML = markup;
  target.querySelectorAll('.history-art').forEach((img) => {
    wireImageFallback(img, fallbackImage);
  });
};

const getPlaylistHistoryApiUrl = () => {
  if (playlistHistoryApi) return playlistHistoryApi;
  if (config.nowPlayingApi && config.nowPlayingApi.includes('now-playing.php')) {
    return config.nowPlayingApi.replace('now-playing.php', 'playlist-history.php');
  }
  return 'api/playlist-history.php';
};

const setPlaylistSummary = (text) => {
  const el = document.getElementById('playlist-summary');
  if (el) el.textContent = text;
};

const setPlaylistLoading = (loading) => {
  playlistState.loading = Boolean(loading);
  const loadMore = document.getElementById('playlist-load-more');
  const search = document.getElementById('playlist-search');
  const days = document.getElementById('playlist-days');
  const share = document.getElementById('playlist-share');
  const quickToday = document.getElementById('playlist-quick-today');
  const quickReset = document.getElementById('playlist-quick-reset');
  if (search) search.disabled = playlistState.loading;
  if (days) days.disabled = playlistState.loading;
  if (share) share.disabled = playlistState.loading;
  if (quickToday) quickToday.disabled = playlistState.loading;
  if (quickReset) quickReset.disabled = playlistState.loading;
  if (loadMore) {
    loadMore.disabled = playlistState.loading;
    loadMore.textContent = playlistState.loading ? 'Laden...' : 'Laad meer';
  }
  if (playlistState.loading) {
    setPlaylistStatus('loading');
  }
};

const updatePlaylistFilterUi = () => {
  document.querySelectorAll('.playlist-filter').forEach((button) => {
    const active = String(button.dataset.kind || '') === playlistState.kind;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const loadMore = document.getElementById('playlist-load-more');
  if (loadMore) {
    loadMore.hidden = !playlistState.hasMore;
  }
};

const buildPlaylistSummary = () => {
  if (playlistState.loading) {
    return 'Playlist laden...';
  }

  const parts = [];
  parts.push(playlistState.total === 1 ? '1 track gevonden' : `${playlistState.total} tracks gevonden`);
  parts.push(`laatste ${playlistState.days} dag${playlistState.days === 1 ? '' : 'en'}`);

  const kindLabel = getTrackKindLabel(playlistState.kind);
  if (playlistState.kind) {
    parts.push(`filter: ${kindLabel}`);
  }
  if (playlistState.query) {
    parts.push(`zoekterm: "${playlistState.query}"`);
  }

  return parts.join(' | ');
};

const fetchPlaylistArchive = async ({ append = false } = {}) => {
  const target = document.getElementById('playlist-history');
  if (!target) return;

  playlistState.active = true;
  target.dataset.playlistMode = 'archive';
  target.dataset.playlistFallback = 'false';
  if (!append) {
    playlistState.offset = 0;
    playlistState.total = 0;
    playlistState.hasMore = false;
  }
  syncPlaylistUrl();
  setPlaylistLoading(true);
  updatePlaylistFilterUi();
  setPlaylistSummary(buildPlaylistSummary());
  if (!append) {
    renderPlaylistHistory([], {
      force: true,
      emptyTitle: 'Playlist laden',
      emptyMessage: 'History en filters worden opgehaald.',
      emptyTone: 'info'
    });
  }

  const requestId = (window.__RADIO_ACCENT_PLAYLIST_REQUEST_ID || 0) + 1;
  window.__RADIO_ACCENT_PLAYLIST_REQUEST_ID = requestId;

  try {
    const params = new URLSearchParams({
      days: String(playlistState.days),
      limit: String(playlistPageSize),
      offset: String(append ? playlistState.offset : 0)
    });
    if (playlistState.query) params.set('q', playlistState.query);
    if (playlistState.kind) params.set('kind', playlistState.kind);

    const response = await fetch(`${getPlaylistHistoryApiUrl()}?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Playlist archive request failed with ${response.status}`);

    const payload = await response.json().catch(() => null);
    const items = Array.isArray(payload?.data?.items)
      ? payload.data.items.map((item) => sanitizeHistoryTrack(item)).filter(Boolean)
      : [];

    if (window.__RADIO_ACCENT_PLAYLIST_REQUEST_ID !== requestId) return;

    target.dataset.playlistFallback = 'false';
    playlistState.offset = Number(payload?.data?.offset || 0) + items.length;
    playlistState.total = Number(payload?.data?.total || items.length || 0);
    playlistState.hasMore = Boolean(payload?.data?.hasMore);
    playlistState.source = 'live';

    if (append && !items.length) {
      playlistState.hasMore = false;
    } else {
      renderPlaylistHistory(items, {
        append,
        emptyTitle: 'Geen tracks gevonden',
        emptyMessage: 'Pas je filters of zoekterm aan en probeer opnieuw.',
        emptyTone: 'info',
        force: true
      });
    }
    setPlaylistUpdated(`Playlist bijgewerkt om ${getClockLabel(new Date())}`);
    setPlaylistStatus('live');
    setPlaylistSummary(items.length || append ? buildPlaylistSummary() : 'Geen tracks gevonden voor deze filter.');
  } catch (error) {
    console.error('Playlist archive refresh failed.', error);
    if (!append) {
      const fallbackTracks = getStoredMetadataHistory();
      target.dataset.playlistFallback = 'true';
      playlistState.offset = fallbackTracks.length;
      playlistState.total = fallbackTracks.length;
      playlistState.hasMore = false;
      playlistState.source = 'fallback';
      renderPlaylistHistory(fallbackTracks, {
        force: true,
        emptyTitle: 'Archief tijdelijk niet beschikbaar',
        emptyMessage: 'Er is ook geen lokale recente history beschikbaar.',
        emptyTone: 'warning'
      });
      setPlaylistSummary(
        fallbackTracks.length
          ? 'Archief tijdelijk niet beschikbaar. Lokale recente history getoond.'
          : 'Archief tijdelijk niet beschikbaar.'
      );
      setPlaylistStatus('fallback');
    }
    setPlaylistUpdated('Playlist update tijdelijk niet beschikbaar.');
  } finally {
    if (window.__RADIO_ACCENT_PLAYLIST_REQUEST_ID === requestId) {
      setPlaylistLoading(false);
      updatePlaylistFilterUi();
      if (target.dataset.playlistFallback === 'true') {
        setPlaylistStatus('fallback');
      } else if (playlistState.source === 'live') {
        setPlaylistStatus('live');
      }
      if (target.dataset.playlistFallback !== 'true' && playlistState.total > 0) {
        setPlaylistSummary(buildPlaylistSummary());
      }
    }
  }
};

const bindPlaylistPage = () => {
  const target = document.getElementById('playlist-history');
  const search = document.getElementById('playlist-search');
  const days = document.getElementById('playlist-days');
  const loadMore = document.getElementById('playlist-load-more');
  const share = document.getElementById('playlist-share');
  const quickToday = document.getElementById('playlist-quick-today');
  const quickReset = document.getElementById('playlist-quick-reset');
  if (!target || !search || !days || !loadMore || !share || !quickToday || !quickReset) return;

  playlistState.active = true;
  const params = new URL(window.location.href).searchParams;
  playlistState.days = sanitizePlaylistDays(params.get('days') || days.value || playlistDefaultDays);
  playlistState.kind = sanitizePlaylistKind(params.get('kind') || playlistDefaultKind);
  playlistState.query = String(params.get('q') || '').trim();
  playlistState.offset = 0;
  playlistState.total = 0;
  playlistState.hasMore = false;
  playlistState.source = 'loading';
  target.dataset.playlistMode = 'archive';
  search.value = playlistState.query;
  days.value = String(playlistState.days);
  setPlaylistStatus('loading');

  let searchTimer = null;
  search.oninput = () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      playlistState.query = String(search.value || '').trim();
      playlistState.offset = 0;
      void fetchPlaylistArchive();
    }, 220);
  };

  days.onchange = () => {
    playlistState.days = Number(days.value || playlistDefaultDays) || playlistDefaultDays;
    playlistState.offset = 0;
    void fetchPlaylistArchive();
  };

  document.querySelectorAll('.playlist-filter').forEach((button) => {
    button.onclick = () => {
      const nextKind = String(button.dataset.kind || '');
      if (playlistState.kind === nextKind) return;
      playlistState.kind = nextKind;
      playlistState.offset = 0;
      void fetchPlaylistArchive();
    };
  });

  loadMore.onclick = () => {
    if (!playlistState.hasMore || playlistState.loading) return;
    void fetchPlaylistArchive({ append: true });
  };

  share.onclick = async () => {
    const shareUrl = buildPlaylistUrl().toString();
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(shareUrl);
      setPlaylistShareFeedback('Link gekopieerd.');
    } catch {
      setPlaylistShareFeedback('Kopieren mislukt. Gebruik de adresbalk voor deze filter.');
    }
    if (window.__RADIO_ACCENT_PLAYLIST_SHARE_TIMER) {
      window.clearTimeout(window.__RADIO_ACCENT_PLAYLIST_SHARE_TIMER);
    }
    window.__RADIO_ACCENT_PLAYLIST_SHARE_TIMER = window.setTimeout(() => {
      setPlaylistShareFeedback('');
    }, 2400);
  };

  quickToday.onclick = () => {
    playlistState.days = 1;
    days.value = '1';
    playlistState.offset = 0;
    void fetchPlaylistArchive();
  };

  quickReset.onclick = () => {
    playlistState.days = playlistDefaultDays;
    playlistState.kind = playlistDefaultKind;
    playlistState.query = '';
    playlistState.offset = 0;
    search.value = '';
    days.value = String(playlistDefaultDays);
    setPlaylistShareFeedback('');
    updatePlaylistFilterUi();
    void fetchPlaylistArchive();
  };

  updatePlaylistFilterUi();
  setPlaylistSummary('Playlist laden...');
  void fetchPlaylistArchive();
};

const bindLastPlayedCarousel = () => {
  const list = document.getElementById('last-played-list');
  const prev = document.getElementById('last-played-prev');
  const next = document.getElementById('last-played-next');
  if (!list || !prev || !next) return;

  prev.onclick = () => list.scrollBy({ left: -Math.max(280, list.clientWidth * 0.75), behavior: 'smooth' });
  next.onclick = () => list.scrollBy({ left: Math.max(280, list.clientWidth * 0.75), behavior: 'smooth' });
};

const applyNowPlayingData = (nowPlayingData, stamp = `Laatst geupdatet om ${getClockLabel(new Date())}`) => {
  if (!nowPlayingData?.track) return false;

  livePlayerMeta.duration = Number(nowPlayingData.track.duration || 0);
  livePlayerMeta.startedAt = String(nowPlayingData.track.startedAt || '');
  livePlayerMeta.endsAt = String(nowPlayingData.track.endsAt || '');
  livePlayerMeta.updatedAt = String(nowPlayingData.track.updatedAt || '');

  const history = nowPlayingData.lastPlayed?.length
    ? persistMetadataHistory(nowPlayingData.lastPlayed)
    : rememberCurrentTrack(nowPlayingData.track);
  const version = nowPlayingData.version || `${nowPlayingData.track.artist}::${nowPlayingData.track.title}`;

  window.__RADIO_ACCENT_NOW_PLAYING_VERSION = version;

  renderTrack(nowPlayingData.track.artist, nowPlayingData.track.title);
  renderDabSlide(nowPlayingData.track.image || nowPlayingData.slideUrl || config.defaultDabSlide || 'assets/logo_dab.png');
  renderLastPlayed(history);
  renderPlaylistHistory(history);
  setMetadataUpdated(stamp);
  setPlaylistUpdated(stamp);
  return true;
};

const applySongInfoData = (songInfoData) => {
  livePlayerMeta.nextTitle = String(songInfoData?.nextTitle || '').trim();
  livePlayerMeta.nextDuration = String(songInfoData?.nextDuration || '').trim();
  const nextTrackLabel = String(songInfoData?.nextTitle || '').trim();
  const [nextArtist = '', ...titleParts] = nextTrackLabel.split(' - ');
  const nextTitle = titleParts.join(' - ').trim();
  livePlayerMeta.nextImage = nextTrackLabel
    ? resolveTrackImage({
      artist: nextTitle ? nextArtist.trim() : '',
      title: nextTitle || nextTrackLabel
    })
    : '';
  updateProgramNowNextUi();
  startLiveMediaRotation();
};

const renderCachedMetadata = () => {
  const cachedHistory = getStoredMetadataHistory();
  const cachedCurrent = cachedHistory[0];
  renderTrack(cachedCurrent?.artist || config.defaultNowPlaying?.artist, cachedCurrent?.title || config.defaultNowPlaying?.title);
  renderDabSlide(cachedCurrent?.image || config.defaultDabSlide || 'assets/logo_dab.png');
  renderLiveWeather(getStoredWeatherData());
  renderLastPlayed(cachedHistory);
  renderPlaylistHistory(cachedHistory);
};

const refreshMetadata = async ({ renderCached = true } = {}) => {
  if (renderCached) {
    renderCachedMetadata();
  }
  setMetadataUpdated('Live-update wacht op data...');
  setPlaylistUpdated('Live-update wacht op data...');

  if (!config.nowPlayingApi) return;

  try {
    const shouldFetchWeather = Boolean(document.querySelector('.live-weather'));
    const [nowPlayingData, weatherApiData, songInfoData] = await Promise.all([
      fetchJsonMetadata().catch(() => null),
      shouldFetchWeather ? fetchLiveWeather().catch(() => null) : Promise.resolve(null),
      fetchSongInfoData().catch(() => null)
    ]);

    renderLiveWeather(weatherApiData || getStoredWeatherData());
    applySongInfoData(songInfoData);

    if (!nowPlayingData?.track) {
      return;
    }
    applyNowPlayingData(nowPlayingData);
  } catch (error) {
    console.error('Metadata refresh failed.', error);
    setMetadataUpdated('Live-update tijdelijk niet beschikbaar.');
    setPlaylistUpdated('Live-update tijdelijk niet beschikbaar.');
  }
};

const stopMetadataPolling = () => {
  if (window.__RADIO_ACCENT_METADATA_TIMER) {
    window.clearInterval(window.__RADIO_ACCENT_METADATA_TIMER);
    window.__RADIO_ACCENT_METADATA_TIMER = null;
  }
};

const startMetadataPolling = ({ immediate = true } = {}) => {
  if (immediate) {
    void refreshMetadata({ renderCached: false });
  }
  stopMetadataPolling();
  window.__RADIO_ACCENT_METADATA_TIMER = window.setInterval(() => {
    void refreshMetadata({ renderCached: false });
  }, nowPlayingPollInterval);
};

const stopNowPlayingStream = () => {
  if (window.__RADIO_ACCENT_METADATA_SSE) {
    window.__RADIO_ACCENT_METADATA_SSE.close();
    window.__RADIO_ACCENT_METADATA_SSE = null;
  }
  window.__RADIO_ACCENT_METADATA_SSE_URL = '';
};

const startNowPlayingStream = () => {
  if (!nowPlayingStreamApi || typeof window.EventSource !== 'function') {
    return false;
  }

  const streamUrl = sanitizeMediaUrl(nowPlayingStreamApi, { fallback: '' });
  if (!streamUrl) {
    return false;
  }

  const activeSource = window.__RADIO_ACCENT_METADATA_SSE;
  if (activeSource && window.__RADIO_ACCENT_METADATA_SSE_URL === streamUrl && activeSource.readyState !== 2) {
    return true;
  }

  stopNowPlayingStream();

  const source = new window.EventSource(streamUrl);
  const handleMessage = (event) => {
    try {
      const payload = JSON.parse(String(event?.data || '{}'));
      const nowPlayingData = normalizeNowPlayingPayload(payload);
      if (!nowPlayingData?.track) return;
      applyNowPlayingData(nowPlayingData, `Live-update ontvangen om ${getClockLabel(new Date())}`);
    } catch (error) {
      console.error('Invalid SSE now-playing payload.', error);
    }
  };

  source.addEventListener('nowplaying', handleMessage);
  source.onmessage = handleMessage;
  source.onopen = () => {};
  source.onerror = () => {};

  window.__RADIO_ACCENT_METADATA_SSE = source;
  window.__RADIO_ACCENT_METADATA_SSE_URL = streamUrl;
  return true;
};

const startMetadataTransport = () => {
  renderCachedMetadata();
  void refreshMetadata({ renderCached: false });
  startMetadataPolling({ immediate: false });
  startNowPlayingStream();
};

const getPlayerDock = () => {
  let dock = document.getElementById('player-dock');
  if (dock) return dock;

  dock = document.createElement('div');
  dock.id = 'player-dock';
  dock.className = 'player-dock';
  dock.innerHTML = `
    <button id="player-mobile-toggle" class="player-mobile-toggle" type="button" aria-label="Verberg de player" aria-expanded="true">
      <span class="player-mobile-toggle-icon" aria-hidden="true"></span>
      <span class="player-mobile-toggle-handle" aria-hidden="true"></span>
      <span class="player-mobile-toggle-icon" aria-hidden="true"></span>
    </button>
    <div id="player-dock-content" class="player-dock-content" aria-hidden="false">
      <div class="player-dock-inner container">
        <div class="player-track-panel">
          <img id="player-cover" class="player-cover" src="${escapeHtml(sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' }))}" alt="Cover van de huidige track" />
          <div class="player-track-copy">
            <p class="player-kicker">Nu live op ${escapeHtml(config.stationName || 'Radio Accent')}</p>
            <h2 id="player-track-artist">${escapeHtml(config.defaultNowPlaying?.artist || 'Radio Accent')}</h2>
            <p id="player-track-title">${escapeHtml(config.defaultNowPlaying?.title || 'Live')}</p>
            <div id="player-mix-progress" class="player-mix-progress" hidden>
              <span id="player-progress-current">0:00</span>
              <input id="player-progress" type="range" min="0" max="1" step="1" value="0" />
              <span id="player-progress-duration">0:00</span>
            </div>
          </div>
        </div>
        <div class="player-main-controls">
          <button id="player-toggle" class="player-main-toggle" type="button" aria-label="Start of pauzeer afspelen">Play</button>
        </div>
        <div class="player-side-panel">
          <div class="player-controls">
            <label class="volume-wrap" for="player-volume">Volume</label>
            <input id="player-volume" type="range" min="0" max="100" step="1" value="85" />
          </div>
          <button id="player-share" class="btn btn-small btn-ghost player-share" type="button" data-default-label="Deel track">Deel track</button>
          <p id="player-status"></p>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dock);
  syncMobilePlayerCollapseUi();
  return dock;
};

const updatePlayerUi = () => {
  const toggle = document.getElementById('player-toggle');
  const volume = document.getElementById('player-volume');
  const status = document.getElementById('player-status');
  if (!toggle || !status) return;

  if (volume) {
    volume.value = String(Math.round(playerAudio.volume * 100));
  }

  if (playerState.playing) {
    toggle.textContent = 'Pause';
  } else {
    toggle.textContent = 'Play';
  }

  status.textContent = playerState.isBuffering ? 'Aan het bufferen...' : '';
  updatePlaybackProgressUi();
  updateMediaSessionPlayback();
};

const applyLowQualityFallback = async (reason) => {
  if (autoFallbackApplied || playerState.quality === 'low' || !streamOptions.low) return;
  autoFallbackApplied = true;
  await setStreamQuality('low', { silent: true });
};

const playStream = async ({ isResume = false } = {}) => {
  const streamUrl = getActiveStreamUrl();
  if (!streamUrl) return;

  playerState.isBuffering = true;
  updatePlayerUi();

  if (playerAudio.src !== streamUrl) {
    playerAudio.src = streamUrl;
    playerAudio.load();
  }

  try {
    await playerAudio.play();
    playerState.playing = true;
    savePlaybackSnapshot();
  } catch {
    playerState.playing = false;
    playerState.isBuffering = false;
  }

  updatePlayerUi();
};

const pauseStream = () => {
  playerAudio.pause();
  playerState.playing = false;
  playerState.isBuffering = false;
  savePlaybackSnapshot();
  updatePlayerUi();
};

const setStreamQuality = async (quality, { silent = false } = {}) => {
  if (!streamOptions[quality]) return;
  playerState.quality = quality;
  savePlaybackSnapshot();
  setBranding();
  if (playerState.playing) {
    await playStream();
  } else {
    updatePlayerUi();
  }
  if (!silent) {
    const status = document.getElementById('player-status');
    if (status) status.textContent = '';
  }
};

const toggleStream = async () => {
  if (playerState.playing) {
    pauseStream();
    return;
  }
  await playStream();
};

const switchToLivePlayback = async ({ toggleIfAlreadyLive = false } = {}) => {
  const wasLiveMode = playerState.mode === 'live';
  setPlayerModeLive();
  if (toggleIfAlreadyLive && wasLiveMode) {
    await toggleStream();
    return;
  }
  await playStream();
};

const bindPlayer = () => {
  getPlayerDock();
  const toggle = document.getElementById('player-toggle');
  const volume = document.getElementById('player-volume');
  const progress = document.getElementById('player-progress');
  const mobileToggle = document.getElementById('player-mobile-toggle');
  const share = document.getElementById('player-share');

  if (toggle) toggle.onclick = () => toggleStream();
  if (mobileToggle) {
    mobileToggle.onclick = () => setMobilePlayerCollapsed(!mobilePlayerCollapsed);
  }
  if (share) {
    share.hidden = shouldHidePlayerShare();
    share.setAttribute('aria-hidden', share.hidden ? 'true' : 'false');
    share.onclick = () => {
      void shareCurrentTrack();
    };
  }

  if (volume) {
    volume.disabled = isAppleMobileDevice;
    volume.oninput = (event) => {
      const next = Number(event.target.value) / 100;
      playerAudio.volume = next;
      setSafeStorageItem('localStorage', PLAYER_VOLUME_KEY, String(next));
      updatePlayerUi();
    };
  }

  if (progress) {
    progress.oninput = (event) => {
      if (playerState.mode !== 'mix' || !Number.isFinite(playerAudio.duration) || playerAudio.duration <= 0) return;
      playerAudio.currentTime = Number(event.target.value);
      updatePlaybackProgressUi();
    };
  }

  playerAudio.onplaying = () => {
    if (waitingFallbackTimer) {
      window.clearTimeout(waitingFallbackTimer);
      waitingFallbackTimer = null;
    }
    playerState.playing = true;
    playerState.isBuffering = false;
    savePlaybackSnapshot();
    updatePlayerUi();
  };

  playerAudio.onpause = () => {
    if (!playerAudio.ended) {
      if (waitingFallbackTimer) {
        window.clearTimeout(waitingFallbackTimer);
        waitingFallbackTimer = null;
      }
      playerState.playing = false;
      playerState.isBuffering = false;
      savePlaybackSnapshot();
      updatePlayerUi();
    }
  };

  playerAudio.onwaiting = () => {
    playerState.isBuffering = true;
    updatePlayerUi();
    if (playerState.playing && playerState.quality === 'high') {
      if (waitingFallbackTimer) window.clearTimeout(waitingFallbackTimer);
      waitingFallbackTimer = window.setTimeout(() => {
        if (playerState.playing) applyLowQualityFallback('buffer');
      }, 8000);
    }
  };

  playerAudio.onerror = async () => {
    await applyLowQualityFallback('error');
    playerState.isBuffering = false;
    updatePlayerUi();
  };

  playerAudio.ontimeupdate = () => {
    updatePlaybackProgressUi();
  };

  if (!window.__RADIO_ACCENT_PROGRESS_TIMER) {
    window.__RADIO_ACCENT_PROGRESS_TIMER = window.setInterval(updatePlaybackProgressUi, 1000);
  }

  playerAudio.onloadedmetadata = () => {
    updatePlaybackProgressUi();
    updateMediaSessionPlayback();
  };

  playerAudio.ondurationchange = () => {
    updatePlaybackProgressUi();
    updateMediaSessionPlayback();
  };

  playerAudio.onended = () => {
    playerState.playing = false;
    playerState.isBuffering = false;
    updatePlayerUi();
    updatePlaybackProgressUi();
  };

  updatePlayerUi();
  syncPlayerPresentation();

  if ('mediaSession' in navigator) {
    const registerHandler = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Unsupported action handlers can be ignored safely.
      }
    };

    registerHandler('play', () => {
      void playStream();
    });
    registerHandler('pause', () => {
      pauseStream();
    });
    registerHandler('stop', () => {
      pauseStream();
    });
    registerHandler('seekbackward', (details) => {
      if (playerState.mode !== 'mix' || !Number.isFinite(playerAudio.duration)) return;
      playerAudio.currentTime = Math.max(0, (playerAudio.currentTime || 0) - (details.seekOffset || 10));
      updatePlaybackProgressUi();
    });
    registerHandler('seekforward', (details) => {
      if (playerState.mode !== 'mix' || !Number.isFinite(playerAudio.duration)) return;
      playerAudio.currentTime = Math.min(playerAudio.duration, (playerAudio.currentTime || 0) + (details.seekOffset || 10));
      updatePlaybackProgressUi();
    });
    registerHandler('seekto', (details) => {
      if (playerState.mode !== 'mix' || !Number.isFinite(playerAudio.duration) || !Number.isFinite(details.seekTime)) return;
      playerAudio.currentTime = Math.min(Math.max(0, details.seekTime), playerAudio.duration);
      updatePlaybackProgressUi();
    });
  }
};

const bindStreamLinks = () => {
  document.querySelectorAll('[data-stream-link]').forEach((link) => {
    link.onclick = async (event) => {
      event.preventDefault();
      await switchToLivePlayback({ toggleIfAlreadyLive: true });
    };
  });
};

const bindContactForm = () => {
  const form = document.getElementById('contact-form');
  const feedback = document.getElementById('contact-feedback');
  if (!form || !feedback) return;

  const endpoint = String(form.getAttribute('action') || config.contact?.apiEndpoint || 'api/contact.php').trim();
  const params = new URLSearchParams(window.location.search);
  const messageField = document.getElementById('bericht');
  if (messageField instanceof HTMLTextAreaElement && !messageField.value.trim() && params.get('topic') === 'request-tip') {
    const source = String(params.get('source') || '').trim();
    const context = String(params.get('context') || '').trim();
    const sourceLabels = {
      homepage: 'via de homepage',
      mixen: 'via de mixpagina',
      player: 'via de player'
    };
    const readableSource = sourceLabels[source] || '';
    messageField.value = [
      'Hallo Radio Accent,',
      '',
      'Ik heb een request of tip voor de uitzending:',
      '',
      context ? `Context: ${context}` : '',
      readableSource ? `Ik stuur dit door ${readableSource}.` : '',
      '',
      'Mijn bericht:'
    ].filter(Boolean).join('\n');
  }
  if (params.get('submitted') === '1') {
    feedback.textContent = 'Bedankt, je bericht werd goed ontvangen.';
    feedback.dataset.state = 'success';
    if (window.history?.replaceState) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('submitted');
      nextUrl.searchParams.delete('error');
      window.history.replaceState({}, '', nextUrl.toString());
    }
  } else if (params.get('error') === '1') {
    feedback.textContent = 'Je bericht kon niet verstuurd worden. Probeer het opnieuw of mail rechtstreeks.';
    feedback.dataset.state = 'error';
    if (window.history?.replaceState) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('submitted');
      nextUrl.searchParams.delete('error');
      window.history.replaceState({}, '', nextUrl.toString());
    }
  }

  form.onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const name = String(formData.get('naam') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const message = String(formData.get('bericht') || '').trim();

    if (!name || !email || !message) {
      feedback.textContent = 'Vul alle velden in om je bericht te versturen.';
      feedback.dataset.state = 'error';
      return;
    }

    feedback.textContent = 'Bericht wordt verstuurd...';
    feedback.dataset.state = 'loading';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json'
        },
        body: formData,
        credentials: 'same-origin'
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }

      form.reset();
      feedback.textContent = 'Bedankt, je bericht werd goed ontvangen.';
      feedback.dataset.state = 'success';
      trackAnalyticsEvent('contact_submit', 'Contactformulier', {});
    } catch {
      feedback.textContent = 'Je bericht kon niet verstuurd worden. Probeer het opnieuw of mail rechtstreeks.';
      feedback.dataset.state = 'error';
    }
  };
};


const CMS_STORAGE_KEY = config.cms?.storageKey || 'radioAccentCmsV1';
const cmsDefaults = {
  schedule: Array.isArray(config.defaults?.schedule) ? config.defaults.schedule : [],
  mixes: Array.isArray(config.defaults?.mixes) ? config.defaults.mixes : [],
  news: Array.isArray(config.defaults?.news) ? config.defaults.news : [],
  newsFeed: config.defaults?.newsFeed && typeof config.defaults.newsFeed === 'object'
    ? config.defaults.newsFeed
    : {},
  siteStatus: config.defaults?.siteStatus && typeof config.defaults.siteStatus === 'object'
    ? config.defaults.siteStatus
    : {},
  historyKinds: Array.isArray(config.historyKinds) ? config.historyKinds : [],
  keywordCovers: Array.isArray(config.keywordCovers) ? config.keywordCovers : []
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const normalizeScheduleItem = (item) => ({
  time: String(item?.time || '').trim(),
  title: String(item?.title || '').trim(),
  description: String(item?.description || '').trim(),
  host: String(item?.host || '').trim(),
  image: String(item?.image || '').trim()
});

const normalizeMixReplays = (value) => {
  const rawItems = Array.isArray(value)
    ? value
    : (() => {
      if (typeof value !== 'string' || !value.trim()) return [];
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();

  return rawItems.map((replay) => ({
    label: String(replay?.label || replay?.title || '').trim(),
    url: String(replay?.url || replay?.streamUrl || replay?.audio_url || '').trim(),
    updatedAt: String(replay?.updatedAt || replay?.updated_at || '').trim(),
    duration: Number(replay?.duration || 0),
    note: String(replay?.note || '').trim()
  })).filter((replay) => replay.url);
};

const normalizeMixItem = (item) => ({
  title: String(item?.title || item?.show_name || item?.page_title || item?.album || '').trim(),
  dj: String(item?.dj || item?.artist || '').trim(),
  schedule: String(item?.schedule || '').trim(),
  description: String(item?.description || '').trim(),
  streamUrl: String(item?.streamUrl || item?.audio_url || '').trim(),
  cover: String(item?.cover || item?.cover_url || '').trim(),
  updatedAt: String(item?.updatedAt || item?.updated_at || '').trim(),
  slug: String(item?.slug || '').trim(),
  replays: normalizeMixReplays(item?.replays)
});

const normalizeNewsItem = (item) => ({
  date: String(item?.date || '').trim(),
  title: String(item?.title || '').trim(),
  excerpt: String(item?.excerpt || item?.description || '').trim(),
  linkLabel: String(item?.linkLabel || '').trim(),
  linkUrl: String(item?.linkUrl || '').trim(),
  image: String(item?.image || '').trim(),
  pinned: Boolean(item?.pinned)
});

const normalizeNewsFeedSettings = (item) => {
  const url = String(item?.url || '').trim();
  const limit = Math.min(20, Math.max(1, Number.parseInt(String(item?.limit ?? 6), 10) || 6));
  const cacheMinutes = Math.min(1440, Math.max(1, Number.parseInt(String(item?.cacheMinutes ?? 15), 10) || 15));
  return {
    enabled: Boolean(item?.enabled) && Boolean(url),
    url,
    limit,
    cacheMinutes
  };
};

const normalizeSiteStatus = (item) => {
  const tone = ['info', 'success', 'warning'].includes(String(item?.tone || '').trim())
    ? String(item?.tone || '').trim()
    : 'info';
  return {
    enabled: Boolean(item?.enabled),
    tone,
    title: String(item?.title || '').trim(),
    message: String(item?.message || '').trim(),
    ctaLabel: String(item?.ctaLabel || '').trim(),
    ctaLink: String(item?.ctaLink || '').trim()
  };
};

const normalizeKeywordCoverItem = (item) => {
  const keywords = Array.isArray(item?.keywords)
    ? item.keywords
    : String(item?.keywords || '')
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean);
  const cover = String(item?.cover || '').trim();
  if (!keywords.length || !cover) return null;
  return { keywords, cover };
};

const sanitizeCmsData = (data) => {
  const safe = data && typeof data === 'object' ? data : {};
  const schedule = Array.isArray(safe.schedule) ? safe.schedule.map(normalizeScheduleItem).filter((x) => x.time && x.title) : [];
  const mixes = Array.isArray(safe.mixes) ? safe.mixes.map(normalizeMixItem).filter((x) => x.title && x.streamUrl) : [];
  const news = Array.isArray(safe.news) ? safe.news.map(normalizeNewsItem).filter((x) => x.title && x.excerpt) : [];
  const newsFeed = normalizeNewsFeedSettings(safe.newsFeed || cmsDefaults.newsFeed);
  const siteStatus = normalizeSiteStatus(safe.siteStatus || cmsDefaults.siteStatus);
  const historyKinds = Array.isArray(safe.historyKinds)
    ? safe.historyKinds.map(normalizeHistoryKindRule).filter(Boolean)
    : [];
  const keywordCovers = Array.isArray(safe.keywordCovers)
    ? safe.keywordCovers.map(normalizeKeywordCoverItem).filter(Boolean)
    : [];
  const sanitized = {
    schedule: schedule.length ? schedule : clone(cmsDefaults.schedule),
    mixes: mixes.length ? mixes : clone(cmsDefaults.mixes),
    news: news.length ? news : clone(cmsDefaults.news),
    newsFeed,
    siteStatus,
    historyKinds: historyKinds.length ? historyKinds : clone(cmsDefaults.historyKinds),
    keywordCovers: keywordCovers.length ? keywordCovers : clone(cmsDefaults.keywordCovers)
  };
  setHistoryKindRules(sanitized.historyKinds);
  return sanitized;
};

const getCmsData = () => {
  try {
    const raw = getSafeStorageItem('localStorage', CMS_STORAGE_KEY);
    if (!raw) return sanitizeCmsData(cmsDefaults);
    return sanitizeCmsData(JSON.parse(raw));
  } catch {
    return sanitizeCmsData(cmsDefaults);
  }
};

const setCmsData = (data) => {
  const safe = sanitizeCmsData(data);
  setSafeStorageItem('localStorage', CMS_STORAGE_KEY, JSON.stringify(safe));
  return safe;
};

const CMS_API_ENABLED = Boolean(config.cms?.apiEnabled && config.cms?.apiEndpoint);
const CMS_API_ENDPOINT = String(config.cms?.apiEndpoint || '').trim();
const CMS_NEWS_FEED_ENDPOINT = String(config.cms?.newsFeedEndpoint || 'api/news-feed.php').trim();
const CMS_INBOX_ENDPOINT = String(config.cms?.inboxEndpoint || 'api/contact-inbox.php').trim();
const CMS_UPLOAD_ENDPOINT = String(config.cms?.uploadEndpoint || 'api/upload.php').trim();
const CMS_ANALYTICS_ENDPOINT = String(config.cms?.analyticsEndpoint || config.analytics?.endpoint || 'api/analytics.php').trim();
const MIXES_FEED_URL = String(config.cms?.mixesFeedUrl || '').trim();
const LOCAL_ADMIN_MODE = !CMS_API_ENABLED
  && (window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname));
let cmsRemoteHydrated = false;
let cmsRemoteHydrating = false;
let adminSessionPasscode = '';
window.__RADIO_ACCENT_NEWS_FEED = window.__RADIO_ACCENT_NEWS_FEED || { items: [], source: 'cms', enabled: false };

const findCmsMixMatch = (mix) => {
  const cmsData = getCmsData();
  const cmsMixes = Array.isArray(cmsData.mixes) ? cmsData.mixes : [];
  const targetSlug = String(mix?.slug || '').trim().toLowerCase();
  const targetTitle = String(mix?.title || '').trim().toLowerCase();
  const targetStream = String(mix?.streamUrl || '').trim().toLowerCase();

  return cmsMixes.find((item) => {
    const itemSlug = String(item?.slug || '').trim().toLowerCase();
    const itemTitle = String(item?.title || '').trim().toLowerCase();
    const itemStream = String(item?.streamUrl || '').trim().toLowerCase();
    return (targetSlug && itemSlug && itemSlug === targetSlug)
      || (targetTitle && itemTitle && itemTitle === targetTitle)
      || (targetStream && itemStream && itemStream === targetStream);
  }) || null;
};

const getFeedMixes = () => {
  const feed = window.__RADIO_ACCENT_MIXES_FEED;
  return Array.isArray(feed?.mixes)
    ? feed.mixes
      .map(normalizeMixItem)
      .filter((item) => item.title && item.streamUrl)
      .map((item) => {
        const cmsMatch = findCmsMixMatch(item);
        return {
          ...item,
          cover: item.cover || cmsMatch?.cover || '',
          description: item.description || cmsMatch?.description || '',
          schedule: item.schedule || cmsMatch?.schedule || '',
          dj: item.dj || cmsMatch?.dj || ''
        };
      })
    : [];
};

const fetchMixesFeed = async () => {
  if (!MIXES_FEED_URL) return [];
  try {
    const response = await fetch(`${MIXES_FEED_URL}?_=${Date.now()}`, { method: 'GET', cache: 'no-store' });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => null);
    const mixes = Array.isArray(payload?.mixes) ? payload.mixes : [];
    window.__RADIO_ACCENT_MIXES_FEED = { mixes };
    return getFeedMixes();
  } catch {
    return [];
  }
};

const getFeedNewsItems = () => {
  const feed = window.__RADIO_ACCENT_NEWS_FEED;
  return Array.isArray(feed?.items)
    ? feed.items.map(normalizeNewsItem).filter((item) => item.title && item.excerpt)
    : [];
};

const fetchNewsFeed = async () => {
  const settings = normalizeNewsFeedSettings(getCmsData().newsFeed || cmsDefaults.newsFeed);
  if (!settings.enabled || !settings.url || !CMS_NEWS_FEED_ENDPOINT || window.location.protocol === 'file:') {
    window.__RADIO_ACCENT_NEWS_FEED = { items: [], source: 'cms', enabled: false };
    return [];
  }

  try {
    const response = await fetch(`${CMS_NEWS_FEED_ENDPOINT}?_=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin'
    });
    const payload = await response.json().catch(() => null);
    window.__RADIO_ACCENT_NEWS_FEED = {
      items: Array.isArray(payload?.data?.items) ? payload.data.items : [],
      source: String(payload?.data?.source || 'rss').trim() || 'rss',
      enabled: Boolean(payload?.data?.enabled ?? true)
    };
    return getFeedNewsItems();
  } catch {
    window.__RADIO_ACCENT_NEWS_FEED = { items: [], source: 'cms', enabled: settings.enabled };
    return [];
  }
};

const refreshNewsFeedRender = (contextLabel = 'news feed refresh') => {
  void fetchNewsFeed()
    .then(() => {
      runSafely(`renderCmsContent after ${contextLabel}`, () => renderCmsContent());
    })
    .catch((error) => {
      console.error(`News feed refresh failed during ${contextLabel}.`, error);
    });
};

const fetchCmsFromApi = async () => {
  if (!CMS_API_ENABLED || !CMS_API_ENDPOINT) return null;
  try {
    const response = await fetch(`${CMS_API_ENDPOINT}?_=${Date.now()}`, { method: 'GET', cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload?.ok || !payload?.data) return null;
    return setCmsData(payload.data);
  } catch {
    return null;
  }
};

const postCmsApi = async (body) => {
  if (!CMS_API_ENABLED || !CMS_API_ENDPOINT) {
    return { ok: false, error: 'CMS API is not enabled', status: 0 };
  }
  try {
    const response = await fetch(CMS_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);
    return {
      ok: Boolean(response.ok && payload?.ok),
      data: payload?.data || null,
      authenticated: Boolean(payload?.authenticated),
      error: payload?.error || (!response.ok ? `HTTP ${response.status}` : ''),
      status: response.status
    };
  } catch {
    return { ok: false, error: 'Netwerkfout bij CMS API', status: 0 };
  }
};

const getAdminSessionStatusRemote = async () => {
  if (!CMS_API_ENABLED) return { ok: false, authenticated: false };
  return postCmsApi({ action: 'status' });
};

const verifyAdminPasscodeRemote = async (passcode) => {
  if (!CMS_API_ENABLED) return { ok: true };
  return postCmsApi({ action: 'auth', passcode });
};

const saveCmsRemote = async (data) => {
  const payload = await postCmsApi({ action: 'save', data });
  if (payload?.ok && payload.data) {
    setCmsData(payload.data);
  }
  return payload;
};

const resetCmsRemote = async () => {
  const payload = await postCmsApi({ action: 'reset' });
  if (payload?.ok && payload.data) {
    setCmsData(payload.data);
  }
  return payload;
};

const logoutCmsRemote = async () => {
  if (!CMS_API_ENABLED) return { ok: true };
  return postCmsApi({ action: 'logout' });
};

const hydrateCmsFromApi = async () => {
  if (cmsRemoteHydrated || cmsRemoteHydrating) return;
  cmsRemoteHydrating = true;
  try {
    const remote = await fetchCmsFromApi();
    if (remote) {
      cmsRemoteHydrated = true;
      renderCmsContent();
      refreshNewsFeedRender('cms hydrate');
    }
  } finally {
    cmsRemoteHydrating = false;
  }
};

const parseNewsSortStamp = (value) => {
  const parsed = new Date(String(value || '').trim()).getTime();
  if (Number.isFinite(parsed)) return parsed;
  const normalized = String(value || '').trim()
    .replace(/maart/gi, 'March')
    .replace(/april/gi, 'April')
    .replace(/mei/gi, 'May')
    .replace(/juni/gi, 'June')
    .replace(/juli/gi, 'July')
    .replace(/augustus/gi, 'August')
    .replace(/oktober/gi, 'October');
  const fallback = new Date(normalized).getTime();
  return Number.isFinite(fallback) ? fallback : 0;
};

const getSortedManualNewsItems = () => getCmsData().news.slice().sort((left, right) => {
  const leftPinned = left?.pinned ? 1 : 0;
  const rightPinned = right?.pinned ? 1 : 0;
  if (leftPinned !== rightPinned) return rightPinned - leftPinned;
  return parseNewsSortStamp(right?.date || '') - parseNewsSortStamp(left?.date || '');
});

const getSortedNewsItems = () => {
  const settings = normalizeNewsFeedSettings(getCmsData().newsFeed || cmsDefaults.newsFeed);
  const feedItems = getFeedNewsItems().slice().sort((left, right) => parseNewsSortStamp(right?.date || '') - parseNewsSortStamp(left?.date || ''));
  if (settings.enabled && feedItems.length) {
    return feedItems;
  }
  return getSortedManualNewsItems();
};

const formatNewsDateLabel = (value) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) return 'Update';
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return rawValue;
  return parsed.toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

const parseMixUpdatedStamp = (value) => {
  const parsed = new Date(String(value || '').trim()).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMixUpdatedLabel = (value) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return rawValue;
  return `Laatst geupdate: ${parsed.toLocaleDateString('nl-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })} om ${getClockLabel(parsed)}`;
};

const isRecentMixUpload = (mix, thresholdDays = 14) => {
  const stamp = parseMixUpdatedStamp(mix?.updatedAt);
  if (!stamp) return false;
  return stamp >= Date.now() - thresholdDays * 24 * 60 * 60 * 1000;
};

const getMixReplayItems = (mix) => {
  const explicitReplays = Array.isArray(mix?.replays) ? mix.replays.filter((item) => item?.url) : [];
  if (explicitReplays.length) {
    return explicitReplays.slice().sort((left, right) => parseMixUpdatedStamp(right.updatedAt) - parseMixUpdatedStamp(left.updatedAt));
  }
  if (!mix?.streamUrl) return [];
  return [{
    label: 'Huidige replay',
    url: String(mix.streamUrl || '').trim(),
    updatedAt: String(mix.updatedAt || '').trim(),
    duration: 0,
    note: 'Nieuwe en oudere replays verschijnen hier zodra ze in de feed beschikbaar zijn.'
  }];
};

const formatMixDurationLabel = (seconds) => {
  const safeSeconds = Number(seconds || 0);
  if (!Number.isFinite(safeSeconds) || safeSeconds <= 0) return 'Duur onbekend';
  const totalMinutes = Math.round(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}u ${minutes}m` : `${minutes} min`;
};

const loadMixDuration = (url) => new Promise((resolve) => {
  const safeUrl = String(url || '').trim();
  if (!safeUrl) {
    resolve(0);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(mixDurationCache, safeUrl)) {
    resolve(Number(mixDurationCache[safeUrl] || 0));
    return;
  }

  const audio = new Audio();
  const finish = (value) => {
    mixDurationCache[safeUrl] = value;
    audio.src = '';
    resolve(value);
  };

  audio.preload = 'metadata';
  audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? Number(audio.duration) : 0);
  audio.onerror = () => finish(0);
  audio.src = safeUrl;
});

const ensureNewsNavLink = () => {
  // Nieuws blijft tijdelijk verborgen in de publieke navigatie.
};

const ensurePerformanceHints = () => {
  const head = document.head;
  if (!head) return;
  const hints = [
    { rel: 'preload', as: 'image', href: 'assets/logo_dab.png' },
    { rel: 'preload', as: 'image', href: 'assets/600x600.png' }
  ];

  hints.forEach((hint) => {
    const selector = `link[rel="${hint.rel}"][href="${hint.href}"]`;
    if (head.querySelector(selector)) return;
    const node = document.createElement('link');
    node.rel = hint.rel;
    node.as = hint.as;
    node.href = hint.href;
    head.appendChild(node);
  });
};

const renderSiteStatusBanner = () => {
  const headerElement = document.querySelector('.site-header');
  if (!headerElement) return;
  const existing = document.getElementById('site-status-banner');
  const status = normalizeSiteStatus(getCmsData().siteStatus);

  if (!status.enabled || !status.message) {
    if (existing) existing.remove();
    return;
  }

  const banner = existing || document.createElement('section');
  banner.id = 'site-status-banner';
  banner.className = 'site-status-banner';
  banner.setAttribute('data-tone', status.tone || 'info');
  banner.innerHTML = `
    <div class="container site-status-inner">
      <div class="site-status-copy">
        <strong>${escapeHtml(status.title || 'Live update')}</strong>
        <p>${escapeHtml(status.message)}</p>
      </div>
      ${status.ctaLabel && status.ctaLink ? `<a class="btn btn-small btn-ghost" href="${escapeHtml(sanitizeLinkUrl(status.ctaLink))}">${escapeHtml(status.ctaLabel)}</a>` : ''}
    </div>
  `;

  if (!existing) {
    headerElement.insertAdjacentElement('afterend', banner);
  }
};

const renderNewsPage = () => {
  const target = document.getElementById('news-list');
  if (!target) return;
  const items = getSortedNewsItems();
  const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });

  if (!items.length) {
    target.innerHTML = renderEmptyStateCard({
      title: 'Nog geen nieuwsitems',
      text: 'Voeg in de beheerconsole nieuws toe om deze pagina automatisch te vullen.',
      tone: 'info'
    });
    return;
  }

  target.innerHTML = items.map((item) => `
    <article class="news-card${item.pinned ? ' is-pinned' : ''}">
      ${item.image ? `<img class="news-card-image" src="${escapeHtml(sanitizeMediaUrl(item.image, { fallback: fallbackImage }))}" alt="${escapeHtml(item.title)}" loading="lazy" />` : ''}
      <div class="news-card-copy">
        <p class="news-meta">${escapeHtml(formatNewsDateLabel(item.date || ''))}</p>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.excerpt || '')}</p>
        ${item.linkLabel && item.linkUrl ? `<a href="${escapeHtml(sanitizeLinkUrl(item.linkUrl))}">${escapeHtml(item.linkLabel)}</a>` : ''}
      </div>
    </article>
  `).join('');

  target.querySelectorAll('.news-card-image').forEach((image) => {
    wireImageFallback(image, fallbackImage);
  });
};

const renderStructuredData = () => {
  const existing = document.getElementById('radioaccent-structured-data');
  if (existing) existing.remove();

  const pagePath = new URL(window.location.href).pathname.replace(/^\//, '') || 'index.html';
  const baseUrl = String(config.siteUrl || window.location.origin).replace(/\/+$/, '/');
  const items = [
    {
      '@context': 'https://schema.org',
      '@type': 'RadioStation',
      name: config.stationName || 'Radio Accent',
      url: baseUrl,
      logo: new URL('assets/600x600.png', baseUrl).toString()
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: config.stationName || 'Radio Accent',
      url: baseUrl
    }
  ];

  if (pagePath === 'nieuws.html') {
    items.push({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${config.stationName || 'Radio Accent'} nieuws`,
      url: new URL('nieuws.html', baseUrl).toString()
    });
  }

  const node = document.createElement('script');
  node.id = 'radioaccent-structured-data';
  node.type = 'application/ld+json';
  node.textContent = JSON.stringify(items);
  document.head.appendChild(node);
};

const trackAnalyticsEvent = (name, label, meta = {}) => {
  const analytics = config.analytics || {};
  const consent = getConsent();
  if (!analytics.enabled || !consent?.analytics || !analytics.endpoint) {
    return;
  }

  const payload = JSON.stringify({
    type: 'event',
    name,
    label,
    meta,
    ts: new Date().toISOString()
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon(analytics.endpoint, payload);
    return;
  }

  fetch(analytics.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true
  }).catch(() => {});
};

const renderHomeSchedule = () => {
  const target = document.getElementById('home-schedule-grid');
  if (!target) return;
  const schedule = getCmsData().schedule.slice(0, 4);
  target.innerHTML = schedule.map((item) => `
    <article class="program-card">
      <p>${escapeHtml(item.time)}</p>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description || '')}</p>
    </article>
  `).join('');
};

const parseScheduleMinutes = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, startHour, startMinute, endHour, endMinute] = match;
  const start = Number(startHour) * 60 + Number(startMinute);
  let end = Number(endHour) * 60 + Number(endMinute);
  if (end <= start) end += 24 * 60;
  return { start, end };
};

const getScheduleSnapshot = (items = [], now = new Date()) => {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const normalized = items
    .map((item, index) => ({ item, index, range: parseScheduleMinutes(item?.time || '') }))
    .filter((entry) => entry.range);

  if (!normalized.length) {
    return { current: null, next: null, currentIndex: -1, nextIndex: -1 };
  }

  const currentEntry = normalized.find((entry) => {
    const current = minutesNow < entry.range.start ? minutesNow + 24 * 60 : minutesNow;
    return current >= entry.range.start && current < entry.range.end;
  }) || null;

  if (currentEntry) {
    const currentPosition = normalized.findIndex((entry) => entry.index === currentEntry.index);
    const nextEntry = normalized[(currentPosition + 1) % normalized.length] || null;
    return {
      current: currentEntry.item,
      next: nextEntry?.item || null,
      currentIndex: currentEntry.index,
      nextIndex: nextEntry?.index ?? -1
    };
  }

  const nextEntry = normalized.find((entry) => entry.range.start > minutesNow) || normalized[0] || null;
  return {
    current: null,
    next: nextEntry?.item || null,
    currentIndex: -1,
    nextIndex: nextEntry?.index ?? -1
  };
};

const getCurrentScheduleItem = (items = [], now = new Date()) => getScheduleSnapshot(items, now).current;

const getLatestMixItem = () => {
  const feedMixes = getFeedMixes();
  const mixes = (feedMixes.length ? feedMixes : getCmsData().mixes).slice();
  return mixes.sort((left, right) => parseMixUpdatedStamp(right.updatedAt) - parseMixUpdatedStamp(left.updatedAt))[0] || null;
};

const getHomePromoItems = () => {
  const cmsData = getCmsData();
  const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
  const newsItems = getSortedNewsItems().slice(0, 5).map((item, index) => ({
    id: item.id || `news-${index}`,
    kicker: item.pinned ? 'Belangrijk nieuws' : 'Laatste nieuws',
    title: item.title || 'Nieuwsbericht',
    text: item.excerpt || 'Lees het laatste nieuws en updates van Radio Accent.',
    meta: formatNewsDateLabel(item.date || '') || 'Actuele update',
    image: sanitizeMediaUrl(item.image || livePlayerMeta.cover || '', { fallback: fallbackImage }),
    ctaLabel: item.linkLabel || 'Lees meer',
    ctaLink: item.linkUrl || 'nieuws.html'
  }));

  if (newsItems.length) {
    return newsItems;
  }

  const fallbackItems = [];
  const latestMix = getLatestMixItem();
  if (latestMix) {
    fallbackItems.push({
      id: `mix-${latestMix.slug || latestMix.title}`,
      kicker: 'Mix highlight',
      title: latestMix.title,
      text: latestMix.description || latestMix.dj || 'Herbeluister de nieuwste mix van Radio Accent.',
      meta: latestMix.updatedAt ? formatMixUpdatedLabel(latestMix.updatedAt) : (latestMix.schedule || 'Nu beschikbaar'),
      image: sanitizeMediaUrl(latestMix.cover || '', { fallback: fallbackImage }),
      ctaLabel: 'Open mixen',
      ctaLink: 'mixen.html'
    });
  }

  if (cmsData.siteStatus?.enabled && cmsData.siteStatus?.message) {
    fallbackItems.unshift({
      id: 'status-banner',
      kicker: 'Live update',
      title: cmsData.siteStatus.title || 'Belangrijke melding',
      text: cmsData.siteStatus.message,
      meta: cmsData.siteStatus.tone === 'warning' ? 'Waarschuwing' : 'Actuele info',
      image: fallbackImage,
      ctaLabel: cmsData.siteStatus.ctaLabel || 'Meer info',
      ctaLink: cmsData.siteStatus.ctaLink || 'status.html'
    });
  }

  return fallbackItems;
};

const bindHomePromoDots = (items) => {
  const nav = document.getElementById('home-promo-nav');
  if (!nav || items.length <= 1) return;
  nav.querySelectorAll('[data-promo-index]').forEach((button) => {
    button.onclick = () => {
      const nextIndex = Number(button.dataset.promoIndex || 0);
      window.__RADIO_ACCENT_HOME_PROMO_INDEX = nextIndex;
      renderHomePromoStrip();
    };
  });
};

const startHomePromoRotation = (items) => {
  if (window.__RADIO_ACCENT_HOME_PROMO_TIMER) {
    window.clearInterval(window.__RADIO_ACCENT_HOME_PROMO_TIMER);
    window.__RADIO_ACCENT_HOME_PROMO_TIMER = null;
  }
  if (items.length <= 1) return;
  window.__RADIO_ACCENT_HOME_PROMO_TIMER = window.setInterval(() => {
    const currentIndex = Number(window.__RADIO_ACCENT_HOME_PROMO_INDEX || 0);
    window.__RADIO_ACCENT_HOME_PROMO_INDEX = (currentIndex + 1) % items.length;
    renderHomePromoStrip();
  }, 8000);
};

const startHomePromoRefresh = () => {
  if (window.__RADIO_ACCENT_HOME_PROMO_REFRESH_TIMER) return;
  window.__RADIO_ACCENT_HOME_PROMO_REFRESH_TIMER = window.setInterval(() => {
    renderHomePromoStrip();
  }, 60000);
};

const renderHomePromoStrip = () => {
  const target = document.getElementById('home-promo-strip');
  if (!target) return;

  const items = getHomePromoItems();
  if (!items.length) {
    target.innerHTML = `
      <div class="home-promo-shell">
        <div class="home-promo-copy">
          <p class="section-label">Laatste nieuws</p>
          <h2>Nieuws en highlights laden...</h2>
          <p class="home-promo-text">We vullen dit blok automatisch zodra er items beschikbaar zijn.</p>
          <p class="meta-updated">Actuele updates van Radio Accent</p>
        </div>
        <div class="home-promo-actions">
          <a class="btn home-promo-cta" href="contact.html?topic=request-tip&source=homepage">Stuur een tip</a>
        </div>
      </div>
    `;
    target.classList.remove('has-image');
    return;
  }

  const currentIndex = Math.min(Number(window.__RADIO_ACCENT_HOME_PROMO_INDEX || 0), items.length - 1);
  const activeItem = items[currentIndex];
  const safeLink = escapeHtml(sanitizeLinkUrl(activeItem.ctaLink));
  const hasImage = Boolean(String(activeItem.image || '').trim());

  target.innerHTML = `
    ${hasImage ? `<img class="home-promo-image" src="${escapeHtml(activeItem.image)}" alt="${escapeHtml(activeItem.title)}" loading="lazy" />` : ''}
    <div class="home-promo-shell">
      <div class="home-promo-copy">
        <p class="section-label">${escapeHtml(activeItem.kicker)}</p>
        <h2>${escapeHtml(activeItem.title)}</h2>
        <p class="home-promo-text">${escapeHtml(activeItem.text)}</p>
        <p class="meta-updated">${escapeHtml(activeItem.meta)}</p>
      </div>
      <div class="home-promo-actions">
        <a class="btn home-promo-cta" href="${safeLink}">${escapeHtml(activeItem.ctaLabel)}</a>
        ${items.length > 1 ? `
          <div id="home-promo-nav" class="home-promo-nav" aria-label="Highlight navigatie">
            ${items.map((item, index) => `
              <button
                class="home-promo-dot${index === currentIndex ? ' is-active' : ''}"
                type="button"
                aria-label="Toon highlight ${index + 1}"
                data-promo-index="${index}"
              ></button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;

  target.classList.toggle('has-image', hasImage);
  const image = target.querySelector('.home-promo-image');
  const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
  if (image) wireImageFallback(image, fallbackImage);
  target.classList.remove('is-animating');
  void target.offsetWidth;
  target.classList.add('is-animating');
  window.clearTimeout(window.__RADIO_ACCENT_HOME_PROMO_ANIM_TIMER);
  window.__RADIO_ACCENT_HOME_PROMO_ANIM_TIMER = window.setTimeout(() => {
    target.classList.remove('is-animating');
  }, 520);
  bindHomePromoDots(items);
  startHomePromoRotation(items);
  startHomePromoRefresh();
};

const updateProgramNowNextUi = () => {
  const schedule = Array.isArray(getCmsData().schedule) ? getCmsData().schedule : [];
  const snapshot = getScheduleSnapshot(schedule);
  const current = snapshot.current;
  const next = snapshot.next;
  const nextTrackTitle = String(livePlayerMeta.nextTitle || '').trim();
  const [nextTrackArtist = '', ...nextTrackTitleParts] = nextTrackTitle.split(' - ');
  const nextTrackSong = nextTrackTitleParts.join(' - ').trim();
  const resolvedNextTrackTitle = nextTrackSong || nextTrackTitle || 'Info volgt.';
  const resolvedNextTrackArtist = nextTrackSong ? nextTrackArtist.trim() : '';
  const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
  const resolvedNextTrackImage = sanitizeMediaUrl(livePlayerMeta.nextImage || '', { fallback: fallbackImage }) || fallbackImage;

  const currentLabel = current?.title || (config.stationName || 'Radio Accent');
  const currentSlot = current?.time || '';
  const currentMeta = current?.host ? `Met ${current.host}` : '';
  const nextLabel = next
    ? `${next.title}${next.time ? ` | ${next.time}` : ''}`
    : 'Programma-info volgt.';

  const liveSlot = document.getElementById('live-program-slot');
  if (liveSlot) {
    liveSlot.textContent = currentSlot;
    liveSlot.hidden = !currentSlot;
  }

  const liveCurrent = document.getElementById('live-program-current');
  if (liveCurrent) {
    liveCurrent.textContent = currentLabel;
  }

  const liveMeta = document.getElementById('live-program-meta');
  if (liveMeta) {
    liveMeta.textContent = currentMeta;
    liveMeta.hidden = !currentMeta;
  }

  const liveNext = document.getElementById('live-program-next');
  if (liveNext) {
    liveNext.textContent = nextLabel;
  }

  const liveNextTrack = document.getElementById('live-track-next');
  if (liveNextTrack) {
    liveNextTrack.textContent = resolvedNextTrackTitle;
  }

  const liveNextTrackArtistElement = document.getElementById('live-track-next-artist');
  if (liveNextTrackArtistElement) {
    liveNextTrackArtistElement.textContent = resolvedNextTrackArtist;
    liveNextTrackArtistElement.hidden = !resolvedNextTrackArtist;
  }

  const liveNextCover = document.getElementById('live-next-cover');
  if (liveNextCover) {
    wireImageFallback(liveNextCover, fallbackImage);
    if (liveNextCover.getAttribute('src') !== resolvedNextTrackImage) {
      liveNextCover.src = resolvedNextTrackImage;
    }
    liveNextCover.alt = resolvedNextTrackTitle
      ? `Cover van de volgende plaat: ${resolvedNextTrackTitle}`
      : 'Cover van de volgende plaat op Radio Accent';
  }

  updateLiveUpdatedLabel();
};

const renderSchedulePage = () => {
  const target = document.getElementById('schedule-list');
  if (!target) return;
  const schedule = getCmsData().schedule;
  const snapshot = getScheduleSnapshot(schedule);
  if (!schedule.length) {
    target.innerHTML = renderEmptyStateCard({
      title: 'Nog geen programma\'s',
      text: 'Voeg in de beheerconsole programma-items toe om deze pagina te vullen.',
      tone: 'info'
    });
    return;
  }
  target.innerHTML = schedule.map((item, actualIndex) => {
    return `
    <article class="schedule-row${snapshot.currentIndex === actualIndex ? ' is-live' : ''}${snapshot.nextIndex === actualIndex ? ' is-next' : ''}">
      <p>${escapeHtml(item.time)}</p>
      <div class="schedule-copy">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description || '')}</p>
        ${item.host ? `<p class="schedule-host">Met ${escapeHtml(item.host)}</p>` : ''}
        ${(snapshot.currentIndex === actualIndex || snapshot.nextIndex === actualIndex) ? `
          <div class="schedule-badges">
            ${snapshot.currentIndex === actualIndex ? '<span class="schedule-badge schedule-badge-live">Nu op antenne</span>' : ''}
            ${snapshot.nextIndex === actualIndex ? '<span class="schedule-badge schedule-badge-next">Hierna</span>' : ''}
          </div>
        ` : ''}
      </div>
    </article>
  `;
  }).join('');
};

const getSortedMixes = () => {
  const feedMixes = getFeedMixes();
  const mixes = (feedMixes.length ? feedMixes : getCmsData().mixes).slice();
  return mixes.sort((left, right) => parseMixUpdatedStamp(right.updatedAt) - parseMixUpdatedStamp(left.updatedAt));
};

const renderMixArchivePanel = async (mix) => {
  const panel = document.getElementById('mix-archive-panel');
  if (!panel || !mix) return;

  const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
  const replayItems = getMixReplayItems(mix);
  const token = ++activeMixArchiveRequestToken;
  const currentReplayUrl = String(replayItems[0]?.url || mix.streamUrl || '').trim();

  panel.innerHTML = `
    <article class="mix-archive-card">
      <div class="mix-archive-grid">
        <img class="mix-archive-cover" src="${escapeHtml(sanitizeMediaUrl(mix.cover || '', { fallback: fallbackImage }))}" alt="${escapeHtml(mix.title || 'Mix cover')}" loading="lazy" />
        <div class="mix-archive-copy">
          <div class="mix-archive-head">
            <div>
              <p class="mix-slot">${escapeHtml(mix.schedule || 'Archief')}</p>
              <h2>${escapeHtml(mix.title || 'Mix')}</h2>
            </div>
            ${isRecentMixUpload(mix) ? '<span class="mix-badge mix-badge-new">Nieuw</span>' : ''}
          </div>
          <p class="mix-dj">${escapeHtml(mix.dj || 'Radio Accent')}</p>
          <p class="mix-description">${escapeHtml(mix.description || 'Beluister deze replay in het mix-archief van Radio Accent.')}</p>
          <div class="mix-archive-meta">
            <span class="admin-stats-chip" data-mix-archive-duration>${escapeHtml(replayItems[0]?.duration > 0 ? formatMixDurationLabel(replayItems[0].duration) : 'Duur wordt geladen...')}</span>
            ${mix.updatedAt ? `<span class="admin-stats-chip">${escapeHtml(formatMixUpdatedLabel(mix.updatedAt))}</span>` : ''}
            <span class="admin-stats-chip">${escapeHtml(`${replayItems.length} replay${replayItems.length === 1 ? '' : 's'}`)}</span>
          </div>
          <div class="mix-archive-actions">
            <button class="btn" type="button" id="mix-archive-play">Speel deze mix</button>
            <a class="btn btn-ghost" href="contact.html?topic=request-tip&source=mixen&context=${encodeURIComponent(mix.title || 'Mix')}">Stuur request/tip</a>
          </div>
        </div>
      </div>
      <div class="mix-replay-section">
        <div class="section-head section-head-inline">
          <div>
            <p class="section-label">Replay-archief</p>
            <h3>Eerdere versies en replays</h3>
          </div>
        </div>
        <div class="mix-replay-list">
          ${replayItems.map((replay, index) => `
            <article class="mix-replay-item">
              <div>
                <strong>${escapeHtml(replay.label || `Replay ${index + 1}`)}</strong>
                <p>${escapeHtml(replay.updatedAt ? formatMixUpdatedLabel(replay.updatedAt) : 'Replay zonder update-info')}</p>
                ${replay.note ? `<p class="mix-replay-note">${escapeHtml(replay.note)}</p>` : ''}
              </div>
              <div class="mix-replay-actions">
                ${replay.duration > 0 ? `<span class="admin-stats-chip">${escapeHtml(formatMixDurationLabel(replay.duration))}</span>` : ''}
                <button class="btn btn-small btn-ghost mix-replay-play" type="button" data-replay-index="${index}">Speel</button>
              </div>
            </article>
          `).join('')}
        </div>
      </div>
    </article>
  `;

  const cover = panel.querySelector('.mix-archive-cover');
  if (cover) wireImageFallback(cover, fallbackImage);
  const durationBadge = panel.querySelector('[data-mix-archive-duration]');

  const playButton = document.getElementById('mix-archive-play');
  if (playButton) {
    playButton.onclick = () => {
      void playMixSelection(mix);
    };
  }

  panel.querySelectorAll('.mix-replay-play').forEach((button) => {
    button.onclick = () => {
      const replayIndex = Number(button.getAttribute('data-replay-index') || 0);
      const replay = replayItems[replayIndex];
      if (!replay?.url) return;
      void playMixSelection({
        ...mix,
        streamUrl: replay.url,
        updatedAt: replay.updatedAt || mix.updatedAt,
        description: replay.note || mix.description
      });
    };
  });

  if (replayItems[0]?.duration > 0 || !currentReplayUrl) {
    return;
  }

  const durationSeconds = await loadMixDuration(currentReplayUrl);
  if (token !== activeMixArchiveRequestToken || !durationBadge) return;
  durationBadge.textContent = formatMixDurationLabel(durationSeconds);
};

const renderMixGrid = (targetId, limit = null) => {
  const target = document.getElementById(targetId);
  if (!target) return;
  const mixes = getSortedMixes();
  const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
  if (!mixes.length) {
    target.innerHTML = renderEmptyStateCard({
      title: 'Nog geen mixen beschikbaar',
      text: 'Voeg in de beheerconsole mixen toe om deze pagina te vullen.',
      tone: 'info'
    });
    return;
  }

  const safeMixes = typeof limit === 'number' ? mixes.slice(0, limit) : mixes;

  target.innerHTML = safeMixes.map((mix) => `
    <article
      class="mix-card mix-card-playable"
      data-mix-stream="${escapeHtml(sanitizeMediaUrl(mix.streamUrl))}"
      data-mix-cover="${escapeHtml(sanitizeMediaUrl(mix.cover, { fallback: fallbackImage }))}"
      data-mix-title="${escapeHtml(mix.title)}"
      data-mix-dj="${escapeHtml(mix.dj || '')}"
      data-mix-schedule="${escapeHtml(mix.schedule || '')}"
      data-mix-description="${escapeHtml(mix.description || '')}"
      data-mix-updated="${escapeHtml(mix.updatedAt || '')}"
      data-mix-slug="${escapeHtml(mix.slug || '')}"
      data-mix-replays="${escapeHtml(JSON.stringify(Array.isArray(mix.replays) ? mix.replays : []))}"
      tabindex="0"
      role="button"
      aria-label="Speel ${escapeHtml(mix.title)} in de player"
    >
      <img class="mix-cover" src="${escapeHtml(sanitizeMediaUrl(mix.cover, { fallback: fallbackImage }))}" alt="${escapeHtml(mix.title)}" loading="lazy" />
      <div class="mix-content">
        <p class="mix-slot">${escapeHtml(mix.schedule || 'Schema volgt')}</p>
        ${isRecentMixUpload(mix) ? '<span class="mix-badge mix-badge-new">Nieuw</span>' : ''}
        <h3>${escapeHtml(mix.title)}</h3>
        <p class="mix-dj">${escapeHtml(mix.dj || 'Radio Accent')}</p>
        ${mix.updatedAt ? `<p class="mix-updated">${escapeHtml(formatMixUpdatedLabel(mix.updatedAt))}</p>` : ''}
        <p class="mix-description">${escapeHtml(mix.description || '')}</p>
        <div class="mix-card-actions">
          <span class="mix-cta">Speel in player</span>
          ${targetId === 'mixes-library' ? '<button class="btn btn-small btn-ghost mix-details-trigger" type="button">Details & archief</button>' : ''}
        </div>
      </div>
    </article>
  `).join('');
};

const renderMixLibrary = () => {
  renderMixGrid('mixes-library');
  const latestMix = getSortedMixes()[0] || null;
  if (latestMix) {
    void renderMixArchivePanel(latestMix);
  }
};

const renderCmsContent = () => {
  ensureNewsNavLink();
  ensurePerformanceHints();
  renderSiteStatusBanner();
  renderNewsPage();
  renderStructuredData();
  renderHomeSchedule();
  renderHomePromoStrip();
  renderSchedulePage();
  updateProgramNowNextUi();
  renderMixGrid('home-mixes-list', Number(config.cms?.mixesPageSizeHome || 3));
  renderMixGrid('program-mixes-list', 3);
  renderMixLibrary();
  void renderPublicStatusPage();
  startLiveMediaRotation();
  bindMixCards();
  updateCurrentNav(window.location.href);
};

const startProgramClock = () => {
  if (window.__RADIO_ACCENT_PROGRAM_TIMER) return;
  window.__RADIO_ACCENT_PROGRAM_TIMER = window.setInterval(() => {
    updateProgramNowNextUi();
    renderSchedulePage();
    renderHomePromoStrip();
  }, 60000);
};

const playMixSelection = async (mix) => {
  if (!mix?.streamUrl) return;
  setPlayerModeMix(mix);
  trackAnalyticsEvent('mix_play', mix.title || 'Mix', { dj: mix.dj || '' });
  await playStream();
};

const bindMixCards = () => {
  document.querySelectorAll('.mix-card-playable').forEach((card) => {
    const cover = card.querySelector('.mix-cover');
    const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
    if (cover) wireImageFallback(cover, fallbackImage);

    const mixData = {
      title: card.dataset.mixTitle || '',
      dj: card.dataset.mixDj || '',
      schedule: card.dataset.mixSchedule || '',
      description: card.dataset.mixDescription || '',
      streamUrl: card.dataset.mixStream || '',
      cover: card.dataset.mixCover || '',
      updatedAt: card.dataset.mixUpdated || '',
      slug: card.dataset.mixSlug || '',
      replays: normalizeMixReplays(card.dataset.mixReplays || '[]')
    };

    const activateCard = async () => {
      await playMixSelection(mixData);
    };

    card.onclick = () => {
      void activateCard();
    };

    card.onkeydown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      void activateCard();
    };

    const detailsButton = card.querySelector('.mix-details-trigger');
    if (detailsButton) {
      detailsButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        void renderMixArchivePanel(mixData);
        document.getElementById('mix-archive-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    }
  });
};

const createScheduleEditorRow = (item = {}) => {
  const row = document.createElement('div');
  row.className = 'admin-row';
  row.innerHTML = `
    <label>Tijdslot<input data-field="time" type="text" value="${escapeHtml(item.time || '')}" placeholder="bv. 20:00 - 22:00" /></label>
    <label>Titel<input data-field="title" type="text" value="${escapeHtml(item.title || '')}" placeholder="Programmanaam" /></label>
    <label>Host / Presentator<input data-field="host" type="text" value="${escapeHtml(item.host || '')}" placeholder="bv. DJ Accent" /></label>
    <label>Beschrijving<textarea data-field="description" rows="2" placeholder="Korte omschrijving">${escapeHtml(item.description || '')}</textarea></label>
    <label>Programmaslide URL<input data-field="image" type="text" value="${escapeHtml(item.image || '')}" placeholder="assets/promo-cover.jpg" /></label>
    <button class="btn btn-small btn-ghost" type="button" data-action="remove">Verwijder</button>
  `;
  return row;
};

const createMixEditorRow = (item = {}) => {
  const row = document.createElement('div');
  row.className = 'admin-row';
  row.innerHTML = `
    <label>Titel<input data-field="title" type="text" value="${escapeHtml(item.title || '')}" placeholder="Naam van de mix" /></label>
    <label>DJ / Host<input data-field="dj" type="text" value="${escapeHtml(item.dj || '')}" placeholder="DJ of team" /></label>
    <label>Uitzendmoment<input data-field="schedule" type="text" value="${escapeHtml(item.schedule || '')}" placeholder="bv. Vrijdag 21:00 - 23:00" /></label>
    <label>Beschrijving<textarea data-field="description" rows="2" placeholder="Korte omschrijving">${escapeHtml(item.description || '')}</textarea></label>
    <label>Stream URL<input data-field="streamUrl" type="url" value="${escapeHtml(item.streamUrl || '')}" placeholder="https://...mp3" /></label>
    <label>Cover URL<input data-field="cover" type="text" value="${escapeHtml(item.cover || '')}" placeholder="assets/logo_dab.png" /></label>
    <input data-field="updatedAt" type="hidden" value="${escapeHtml(item.updatedAt || '')}" />
    <input data-field="slug" type="hidden" value="${escapeHtml(item.slug || '')}" />
    <input data-field="replays" type="hidden" value="${escapeHtml(JSON.stringify(Array.isArray(item.replays) ? item.replays : []))}" />
    <button class="btn btn-small btn-ghost" type="button" data-action="remove">Verwijder</button>
  `;
  return row;
};

const createNewsEditorRow = (item = {}) => {
  const row = document.createElement('div');
  row.className = 'admin-row';
  row.innerHTML = `
    <label>Datum<input data-field="date" type="text" value="${escapeHtml(item.date || '')}" placeholder="bv. 18 maart 2026" /></label>
    <label>Titel<input data-field="title" type="text" value="${escapeHtml(item.title || '')}" placeholder="Titel van het nieuwsitem" /></label>
    <label class="admin-checkbox">
      <input data-field="pinned" type="checkbox"${item.pinned ? ' checked' : ''} />
      <span>Uitgelicht item</span>
    </label>
    <label>Afbeelding URL<input data-field="image" type="text" value="${escapeHtml(item.image || '')}" placeholder="assets/uploads/...jpg" /></label>
    <label class="admin-row-span-2">Samenvatting<textarea data-field="excerpt" rows="3" placeholder="Korte samenvatting">${escapeHtml(item.excerpt || '')}</textarea></label>
    <label>CTA label<input data-field="linkLabel" type="text" value="${escapeHtml(item.linkLabel || '')}" placeholder="Lees meer" /></label>
    <label>CTA link<input data-field="linkUrl" type="text" value="${escapeHtml(item.linkUrl || '')}" placeholder="nieuws.html of https://..." /></label>
    <button class="btn btn-small btn-ghost" type="button" data-action="remove">Verwijder</button>
  `;
  return row;
};

const createHistoryKindEditorRow = (item = {}) => {
  const row = document.createElement('div');
  row.className = 'admin-row';
  row.innerHTML = `
    <label>Type
      <select data-field="kind">
        <option value="news"${String(item.kind || '') === 'news' ? ' selected' : ''}>Nieuws</option>
        <option value="weather"${String(item.kind || '') === 'weather' ? ' selected' : ''}>Weer</option>
        <option value="traffic"${String(item.kind || '') === 'traffic' ? ' selected' : ''}>Verkeer</option>
        <option value="promo"${String(item.kind || '') === 'promo' ? ' selected' : ''}>Promo</option>
      </select>
    </label>
    <label>Keywords<input data-field="keywords" type="text" value="${escapeHtml(Array.isArray(item.keywords) ? item.keywords.join(', ') : '')}" placeholder="nieuws, regionieuws" /></label>
    <button class="btn btn-small btn-ghost" type="button" data-action="remove">Verwijder</button>
  `;
  return row;
};

const createKeywordCoverEditorRow = (item = {}) => {
  const row = document.createElement('div');
  row.className = 'admin-row';
  row.innerHTML = `
    <label>Keywords<input data-field="keywords" type="text" value="${escapeHtml(Array.isArray(item.keywords) ? item.keywords.join(', ') : '')}" placeholder="nieuws, regionieuws" /></label>
    <label>Cover URL<input data-field="cover" type="text" value="${escapeHtml(item.cover || '')}" placeholder="assets/logo_dab.png" /></label>
    <button class="btn btn-small btn-ghost" type="button" data-action="remove">Verwijder</button>
  `;
  return row;
};

const renderAdminHistoryKindPreview = ({
  historyKindsList,
  artistInput,
  titleInput,
  previewWrap,
  previewMatch,
  previewKeywords
}) => {
  if (!historyKindsList || !artistInput || !titleInput || !previewWrap || !previewMatch || !previewKeywords) {
    return;
  }

  const rules = collectEditorRows(historyKindsList, normalizeHistoryKindRule).filter(Boolean);
  const artist = String(artistInput.value || '').trim();
  const title = String(titleInput.value || '').trim();
  const haystack = normalizeNeedle(`${artist} ${title}`);
  const matchedRule = rules.find((rule) => rule.keywords.some((keyword) => keyword && haystack.includes(keyword))) || null;
  const detectedKind = detectHistoryKindFromRules({ artist, title, rules });

  if (!artist && !title) {
    setPreviewTone(previewWrap, 'info');
    previewMatch.textContent = 'Vul artiest of titel in om een history rule te testen.';
    previewKeywords.textContent = '';
    return;
  }

  setPreviewTone(previewWrap, matchedRule ? 'success' : 'warning');
  previewMatch.textContent = `Gedetecteerde filter: ${getTrackKindLabel(detectedKind)}.`;
  previewKeywords.textContent = matchedRule
    ? `Rule match: ${matchedRule.kind} | Keywords: ${matchedRule.keywords.join(', ')}`
    : 'Geen specifieke rule-match. Deze track blijft Muziek.';
};

const formatCount = (value) => new Intl.NumberFormat('nl-BE').format(Math.max(0, Number(value) || 0));

const getAdminHealthStatusLabel = (status) => {
  if (status === 'error') return 'Fout';
  if (status === 'warning') return 'Let op';
  return 'OK';
};

const setPreviewTone = (element, tone = 'info') => {
  if (!element) return;
  element.dataset.tone = ['info', 'success', 'warning', 'error'].includes(String(tone || '').trim())
    ? String(tone).trim()
    : 'info';
};

const renderAdminHealthReport = ({ summaryEl, listEl, updatedEl }, payload) => {
  if (!summaryEl || !listEl || !updatedEl) return;
  const data = payload?.data || {};
  const checks = Array.isArray(data.checks) ? data.checks : [];
  const okCount = checks.filter((item) => item?.status === 'ok').length;
  const warningCount = checks.filter((item) => item?.status === 'warning').length;
  const errorCount = checks.filter((item) => item?.status === 'error').length;
  const checkedAt = String(data.checkedAt || '').trim();
  updatedEl.textContent = checkedAt
    ? `Laatste controle om ${getClockLabel(new Date(checkedAt))}`
    : 'Controle uitgevoerd.';
  summaryEl.textContent = checks.length
    ? `${okCount} OK | ${warningCount} waarschuwingen | ${errorCount} fouten`
    : 'Geen checks beschikbaar.';
  listEl.innerHTML = checks.length
    ? checks.map((item) => `
      <article class="admin-health-item" data-status="${escapeHtml(item.status || 'ok')}">
        <div class="admin-health-topline">
          <strong>${escapeHtml(item.label || 'Check')}</strong>
          <span class="admin-health-badge" data-status="${escapeHtml(item.status || 'ok')}">${escapeHtml(getAdminHealthStatusLabel(item.status || 'ok'))}</span>
        </div>
        <div>${escapeHtml(item.summary || '')}</div>
        ${item.detail ? `<div class="admin-health-detail">${escapeHtml(item.detail)}</div>` : ''}
      </article>
    `).join('')
    : renderEmptyStateCard({
      title: 'Nog geen checks beschikbaar',
      text: 'De monitor kreeg nog geen bruikbare healthdata terug.',
      tone: 'info',
      compact: true
    });
};

const renderAdminStatsReport = ({ summaryEl, kindsEl, topArtistsEl }, payload) => {
  if (!summaryEl || !kindsEl || !topArtistsEl) return;
  const data = payload?.data || {};
  const recent = data.recent || {};
  const today = data.today || {};
  const archive = data.archive || {};
  const topArtists = Array.isArray(data.topArtists) ? data.topArtists : [];
  const kinds = recent.kinds && typeof recent.kinds === 'object' ? recent.kinds : {};

  summaryEl.textContent = recent.total
    ? `Vandaag ${formatCount(today.total)} tracks | laatste ${formatCount(recent.days || 7)} dagen ${formatCount(recent.total)} tracks uit ${formatCount(archive.fileCount)} dagbestand(en).`
    : 'Nog geen playliststatistieken beschikbaar.';

  kindsEl.innerHTML = Object.entries(kinds)
    .filter(([, value]) => Number(value) > 0)
    .map(([kind, value]) => `<span class="admin-stats-chip">${escapeHtml(getTrackKindLabel(kind))}: ${escapeHtml(formatCount(value))}</span>`)
    .join('');

  topArtistsEl.innerHTML = topArtists.length
    ? topArtists.map((item, index) => `
      <article class="admin-top-artist">
        <div class="admin-top-artist-topline">
          <strong>${index + 1}. ${escapeHtml(item.artist || 'Onbekend')}</strong>
          <span class="admin-stats-chip">${escapeHtml(formatCount(item.plays))} plays</span>
        </div>
        <p>${escapeHtml(item.title || 'Muziek in de gekozen periode')}</p>
      </article>
    `).join('')
    : renderEmptyStateCard({
      title: 'Nog geen topartiesten',
      text: 'Zodra er genoeg muziektracks in de gekozen periode staan, zie je ze hier.',
      tone: 'info',
      compact: true
    });
};

const fetchAdminMonitorPayload = async (endpoint) => {
  const separator = String(endpoint || '').includes('?') ? '&' : '?';
  const response = await fetch(`${endpoint}${separator}_=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin'
  });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return response.json();
};

const collectEditorRows = (container, normalizer) => {
  return [...container.querySelectorAll('.admin-row')].map((row) => {
    const raw = {};
    row.querySelectorAll('[data-field]').forEach((input) => {
      raw[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value;
    });
    return normalizer(raw);
  });
};

const collectFields = (elements, normalizer = (value) => value) => {
  const raw = {};
  Object.entries(elements).forEach(([key, input]) => {
    if (!input) return;
    raw[key] = input.type === 'checkbox' ? input.checked : input.value;
  });
  return normalizer(raw);
};

const renderAdminSiteStatusPreview = ({ wrap, titleEl, messageEl }, status) => {
  if (!wrap || !titleEl || !messageEl) return;
  setPreviewTone(wrap, status.enabled ? status.tone || 'info' : 'info');
  titleEl.textContent = status.enabled
    ? status.title || 'Actieve statusbanner'
    : 'Nog geen actieve statusbanner.';
  messageEl.textContent = status.enabled && status.message
    ? status.message
    : 'Zodra je de status inschakelt, verschijnt hier een live preview.';
};

const getInboxStatusLabel = (value) => {
  if (value === 'in_progress') return 'In behandeling';
  if (value === 'done') return 'Afgerond';
  if (value === 'archived') return 'Gearchiveerd';
  return 'Nieuw';
};

const renderAdminInboxReport = ({ summaryEl, monthSelect, listEl }, payload) => {
  if (!summaryEl || !monthSelect || !listEl) return;
  const data = payload?.data || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const summary = data.summary || {};
  const counts = summary.counts || {};
  const months = Array.isArray(summary.months) ? summary.months : [];

  summaryEl.textContent = `${formatCount(counts.total || 0)} berichten | ${formatCount(counts.new || 0)} nieuw | ${formatCount(counts.in_progress || 0)} in behandeling | ${formatCount(counts.done || 0)} afgerond`;

  const previousValue = monthSelect.value;
  monthSelect.innerHTML = `<option value="">Alle maanden</option>${months.map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`).join('')}`;
  monthSelect.value = months.includes(previousValue) ? previousValue : '';

  listEl.innerHTML = items.length
    ? items.map((item) => `
      <article class="admin-inbox-item" data-status="${escapeHtml(item.status || 'new')}">
        <div class="admin-inbox-topline">
          <div>
            <strong>${escapeHtml(item.name || 'Onbekende afzender')}</strong>
            <p>${escapeHtml(item.email || '')}</p>
          </div>
          <div class="admin-inline-actions">
            <span class="admin-stats-chip">${escapeHtml(getInboxStatusLabel(item.status || 'new'))}</span>
            <select data-inbox-status data-id="${escapeHtml(item.id || '')}">
              <option value="new"${item.status === 'new' ? ' selected' : ''}>Nieuw</option>
              <option value="in_progress"${item.status === 'in_progress' ? ' selected' : ''}>In behandeling</option>
              <option value="done"${item.status === 'done' ? ' selected' : ''}>Afgerond</option>
              <option value="archived"${item.status === 'archived' ? ' selected' : ''}>Gearchiveerd</option>
            </select>
          </div>
        </div>
        <p class="admin-inbox-time">${escapeHtml(formatDateLabel(item.submittedAt || ''))}</p>
        <p>${escapeHtml(item.message || '')}</p>
      </article>
    `).join('')
    : renderEmptyStateCard({
      title: 'Geen berichten gevonden',
      text: 'Pas je filters aan of wacht op nieuwe inzendingen.',
      tone: 'info',
      compact: true
    });
};

const renderAdminBackupsReport = ({ summaryEl, listEl }, payload) => {
  if (!summaryEl || !listEl) return;
  const items = Array.isArray(payload?.data) ? payload.data : [];
  summaryEl.textContent = items.length
    ? `${items.length} backup${items.length === 1 ? '' : 's'} beschikbaar`
    : 'Nog geen backups beschikbaar.';

  listEl.innerHTML = items.length
    ? items.map((item) => `
      <article class="admin-backup-item">
        <div class="admin-backup-topline">
          <strong>${escapeHtml(formatDateLabel(item.createdAt || ''))}</strong>
          <span class="admin-stats-chip">${escapeHtml(item.reason || 'save')}</span>
        </div>
        <p>${escapeHtml(`${item.counts?.schedule || 0} programma's | ${item.counts?.mixes || 0} mixen | ${item.counts?.news || 0} nieuwsitems`)}</p>
        <div class="admin-inline-actions">
          <button class="btn btn-small btn-ghost" type="button" data-restore-backup="${escapeHtml(item.id || '')}">Zet terug</button>
        </div>
      </article>
    `).join('')
    : renderEmptyStateCard({
      title: 'Geen backuphistoriek',
      text: 'Na save en reset verschijnen hier automatisch versies.',
      tone: 'info',
      compact: true
    });
};

const renderAdminAnalyticsReport = ({ summaryEl, pagesEl, eventsEl }, analyticsPayload, inboxPayload) => {
  if (!summaryEl || !pagesEl || !eventsEl) return;
  const analytics = analyticsPayload?.data || {};
  const totals = analytics.totals || {};
  const topPages = Array.isArray(analytics.topPages) ? analytics.topPages : [];
  const mixPlays = Array.isArray(analytics.mixPlays) ? analytics.mixPlays : [];
  const contactTotal = Number(inboxPayload?.data?.summary?.counts?.total || 0);

  summaryEl.textContent = `${formatCount(totals.pageviews || 0)} pageviews | ${formatCount(totals.mixPlays || 0)} mixplays | ${formatCount(contactTotal)} contactberichten`;

  pagesEl.innerHTML = topPages.length
    ? topPages.map((item, index) => `
      <article class="admin-top-artist">
        <div class="admin-top-artist-topline">
          <strong>${index + 1}. ${escapeHtml(item.title || item.path || 'Pagina')}</strong>
          <span class="admin-stats-chip">${escapeHtml(formatCount(item.count || 0))} views</span>
        </div>
        <p>${escapeHtml(item.path || '/')}</p>
      </article>
    `).join('')
    : renderEmptyStateCard({
      title: 'Nog geen pageviews',
      text: 'Zodra bezoekers analytics toestaan, verschijnen top-pagina\'s hier.',
      tone: 'info',
      compact: true
    });

  eventsEl.innerHTML = mixPlays.length
    ? mixPlays.map((item, index) => `
      <article class="admin-top-artist">
        <div class="admin-top-artist-topline">
          <strong>${index + 1}. ${escapeHtml(item.label || 'Mix')}</strong>
          <span class="admin-stats-chip">${escapeHtml(formatCount(item.count || 0))} plays</span>
        </div>
        <p>${escapeHtml(item.meta?.dj || 'Mix-play event')}</p>
      </article>
    `).join('')
    : renderEmptyStateCard({
      title: 'Nog geen mixplays',
      text: 'Mixplay-events worden zichtbaar zodra bezoekers mixen starten met analytics-toestemming.',
      tone: 'info',
      compact: true
    });
};

const setAdminKpiCardState = (card, valueEl, detailEl, { status = 'info', value = 'Niet beschikbaar', detail = '' } = {}) => {
  if (card) card.dataset.status = status;
  if (valueEl) valueEl.textContent = value;
  if (detailEl) detailEl.textContent = detail;
};

const fetchOptionalJson = async (endpoint) => {
  try {
    const separator = String(endpoint || '').includes('?') ? '&' : '?';
    const response = await fetch(`${endpoint}${separator}_=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
};

const fetchOptionalMixFeedPayload = async () => {
  if (!MIXES_FEED_URL) return null;
  try {
    const response = await fetch(`${MIXES_FEED_URL}?_=${Date.now()}`, { method: 'GET', cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
};

const renderAdminMonitorKpis = ({
  mixFeedCard,
  mixFeedValue,
  mixFeedDetail,
  nowPlayingCard,
  nowPlayingValue,
  nowPlayingDetail,
  inboxCard,
  inboxValue,
  inboxDetail
}, mixFeedPayload, nowPlayingPayload, inboxPayload) => {
  const mixGeneratedAt = String(mixFeedPayload?.generated_at || '').trim();
  const mixCount = Array.isArray(mixFeedPayload?.mixes) ? mixFeedPayload.mixes.length : 0;
  setAdminKpiCardState(mixFeedCard, mixFeedValue, mixFeedDetail, mixGeneratedAt
    ? {
      status: 'success',
      value: formatDateLabel(mixGeneratedAt),
      detail: `${mixCount} mix${mixCount === 1 ? '' : 'en'} in de feed.`
    }
    : {
      status: 'warning',
      value: 'Niet beschikbaar',
      detail: 'De mix-feed gaf geen geldige refreshinformatie terug.'
    });

  const track = nowPlayingPayload?.data?.track || {};
  const nowPlayingUpdatedAt = String(track.updatedAt || '').trim();
  const nowPlayingLabel = [String(track.artist || '').trim(), String(track.title || '').trim()].filter(Boolean).join(' - ');
  setAdminKpiCardState(nowPlayingCard, nowPlayingValue, nowPlayingDetail, nowPlayingUpdatedAt
    ? {
      status: 'success',
      value: formatDateLabel(nowPlayingUpdatedAt),
      detail: nowPlayingLabel || 'Laatste metadata-update ontvangen.'
    }
    : {
      status: 'warning',
      value: 'Niet beschikbaar',
      detail: 'De now-playing endpoint gaf geen recente update terug.'
    });

  const counts = inboxPayload?.data?.summary?.counts || {};
  const openCount = Number(counts.new || 0) + Number(counts.in_progress || 0);
  setAdminKpiCardState(inboxCard, inboxValue, inboxDetail, {
    status: openCount > 0 ? 'warning' : 'success',
    value: `${openCount} open`,
    detail: `${formatCount(counts.new || 0)} nieuw | ${formatCount(counts.in_progress || 0)} in behandeling`
  });
};

const getStatusCheckLabel = (status) => {
  if (status === 'error') return 'Fout';
  if (status === 'warning') return 'Let op';
  return 'Online';
};

const renderPublicStatusPage = async () => {
  const checksWrap = document.getElementById('status-checks');
  const summaryEl = document.getElementById('status-summary');
  const checkedAtEl = document.getElementById('status-checked-at');
  if (!checksWrap || !summaryEl || !checkedAtEl) return;

  summaryEl.textContent = 'Statuscontroles laden...';
  checkedAtEl.textContent = 'Laatste controle volgt.';
  checksWrap.innerHTML = renderEmptyStateCard({
    title: 'Status laden',
    text: 'De status van stream, metadata en weerfeed wordt opgehaald.',
    tone: 'info'
  });

  const payload = await fetchOptionalJson('api/status.php');
  const data = payload?.data || {};
  const checks = Array.isArray(data.checks) ? data.checks : [];
  if (!checks.length) {
    summaryEl.textContent = 'Statuspagina tijdelijk niet beschikbaar.';
    checkedAtEl.textContent = 'Geen recente controle gevonden.';
    checksWrap.innerHTML = renderEmptyStateCard({
      title: 'Status niet beschikbaar',
      text: 'De publieke status-endpoint gaf geen bruikbare gegevens terug.',
      tone: 'warning'
    });
    return;
  }

  const okCount = checks.filter((item) => item?.status === 'ok').length;
  const warningCount = checks.filter((item) => item?.status === 'warning').length;
  const errorCount = checks.filter((item) => item?.status === 'error').length;
  summaryEl.textContent = `${okCount} online | ${warningCount} waarschuwingen | ${errorCount} fouten`;
  checkedAtEl.textContent = data.checkedAt
    ? `Laatste controle: ${formatDateLabel(data.checkedAt)}`
    : 'Laatste controle onbekend.';
  checksWrap.innerHTML = checks.map((item) => `
    <article class="status-card" data-status="${escapeHtml(item.status || 'ok')}">
      <div class="admin-health-topline">
        <strong>${escapeHtml(item.label || 'Controle')}</strong>
        <span class="admin-health-badge" data-status="${escapeHtml(item.status || 'ok')}">${escapeHtml(getStatusCheckLabel(item.status || 'ok'))}</span>
      </div>
      <p>${escapeHtml(item.summary || '')}</p>
      ${item.detail ? `<p class="status-card-detail">${escapeHtml(item.detail)}</p>` : ''}
    </article>
  `).join('');
};

const postAdminJson = async (endpoint, body) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    credentials: 'same-origin',
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  return {
    ok: Boolean(response.ok && payload?.ok),
    status: response.status,
    data: payload?.data || null,
    error: payload?.error || (!response.ok ? `HTTP ${response.status}` : '')
  };
};

const formatDateLabel = (value) => {
  const parsed = new Date(String(value || '').trim());
  if (Number.isNaN(parsed.getTime())) return String(value || '').trim();
  return parsed.toLocaleString('nl-BE');
};

const renderAdminKeywordPreview = ({
  keywordCoversList,
  artistInput,
  titleInput,
  previewWrap,
  previewImage,
  previewMatch,
  previewKeywords
}) => {
  if (!keywordCoversList || !artistInput || !titleInput || !previewWrap || !previewImage || !previewMatch || !previewKeywords) {
    return;
  }

  const rules = collectEditorRows(keywordCoversList, normalizeKeywordCoverItem).filter(Boolean);
  const artist = String(artistInput.value || '').trim();
  const title = String(titleInput.value || '').trim();
  const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });
  const match = findKeywordCoverMatch({ artist, title, rules });
  const resolvedCover = sanitizeMediaUrl(String(match?.cover || ''), { fallback: fallbackImage });

  previewImage.src = resolvedCover || fallbackImage;
  wireImageFallback(previewImage, fallbackImage);

  if (!artist && !title) {
    setPreviewTone(previewWrap, 'info');
    previewMatch.textContent = 'Vul artiest of titel in om een rule te testen.';
    previewKeywords.textContent = '';
    return;
  }

  if (match?.cover) {
    setPreviewTone(previewWrap, 'success');
    previewMatch.textContent = `Match gevonden voor "${artist || 'Onbekende artiest'} - ${title || 'Onbekende titel'}".`;
    previewKeywords.textContent = `Keywords: ${match.keywords.join(', ')} | Cover: ${match.cover}`;
    return;
  }

  setPreviewTone(previewWrap, 'warning');
  previewMatch.textContent = 'Geen keyword-match. Standaard cover blijft actief.';
  previewKeywords.textContent = rules.length
    ? `${rules.length} actieve keyword rules gecontroleerd.`
    : 'Er zijn nog geen keyword rules toegevoegd.';
};

const bindAdminConsole = () => {
  const loginWrap = document.getElementById('admin-login');
  const loginForm = document.getElementById('admin-login-form');
  const loginFeedback = document.getElementById('admin-login-feedback');
  const passInput = document.getElementById('admin-passcode');
  const panel = document.getElementById('admin-console');
  const scheduleList = document.getElementById('admin-schedule-list');
  const mixesList = document.getElementById('admin-mixes-list');
  const newsList = document.getElementById('admin-news-list');
  const newsFeedEnabled = document.getElementById('admin-news-feed-enabled');
  const newsFeedUrl = document.getElementById('admin-news-feed-url');
  const newsFeedLimit = document.getElementById('admin-news-feed-limit');
  const newsFeedCache = document.getElementById('admin-news-feed-cache');
  const siteStatusEnabled = document.getElementById('admin-site-status-enabled');
  const siteStatusTone = document.getElementById('admin-site-status-tone');
  const siteStatusTitle = document.getElementById('admin-site-status-title');
  const siteStatusMessage = document.getElementById('admin-site-status-message');
  const siteStatusCtaLabel = document.getElementById('admin-site-status-cta-label');
  const siteStatusCtaLink = document.getElementById('admin-site-status-cta-link');
  const siteStatusPreview = document.getElementById('admin-site-status-preview');
  const siteStatusPreviewTitle = document.getElementById('admin-site-status-preview-title');
  const siteStatusPreviewMessage = document.getElementById('admin-site-status-preview-message');
  const historyKindsList = document.getElementById('admin-history-kinds-list');
  const keywordCoversList = document.getElementById('admin-keyword-covers-list');
  const addScheduleBtn = document.getElementById('admin-add-schedule');
  const addMixBtn = document.getElementById('admin-add-mix');
  const addNewsBtn = document.getElementById('admin-add-news');
  const addHistoryKindBtn = document.getElementById('admin-add-history-kind');
  const addKeywordCoverBtn = document.getElementById('admin-add-keyword-cover');
  const saveBtn = document.getElementById('admin-save');
  const resetBtn = document.getElementById('admin-reset');
  const logoutBtn = document.getElementById('admin-logout');
  const exportBtn = document.getElementById('admin-export');
  const importInput = document.getElementById('admin-import-file');
  const feedback = document.getElementById('admin-feedback');
  const dabPreviewImage = document.getElementById('admin-dab-preview-image');
  const dabPreviewMeta = document.getElementById('admin-dab-preview-meta');
  const dabPreviewTitle = document.getElementById('admin-dab-preview-title');
  const dabPreviewTime = document.getElementById('admin-dab-preview-time');
  const dabPreviewRefreshBtn = document.getElementById('admin-dab-preview-refresh');
  const historyPreviewArtist = document.getElementById('admin-history-preview-artist');
  const historyPreviewTitle = document.getElementById('admin-history-preview-title');
  const historyPreviewResult = document.getElementById('admin-history-preview-result');
  const historyPreviewMatch = document.getElementById('admin-history-preview-match');
  const historyPreviewKeywords = document.getElementById('admin-history-preview-keywords');
  const keywordPreviewArtist = document.getElementById('admin-keyword-preview-artist');
  const keywordPreviewTitle = document.getElementById('admin-keyword-preview-title');
  const keywordPreviewImage = document.getElementById('admin-keyword-preview-image');
  const keywordPreviewCopy = document.getElementById('admin-keyword-preview-copy');
  const keywordPreviewMatch = document.getElementById('admin-keyword-preview-match');
  const keywordPreviewKeywords = document.getElementById('admin-keyword-preview-keywords');
  const healthRefreshBtn = document.getElementById('admin-health-refresh');
  const healthUpdated = document.getElementById('admin-health-updated');
  const healthSummary = document.getElementById('admin-health-summary');
  const healthList = document.getElementById('admin-health-list');
  const adminKpiMixFeed = document.getElementById('admin-kpi-mix-feed');
  const adminKpiMixFeedValue = document.getElementById('admin-kpi-mix-feed-value');
  const adminKpiMixFeedDetail = document.getElementById('admin-kpi-mix-feed-detail');
  const adminKpiNowPlaying = document.getElementById('admin-kpi-now-playing');
  const adminKpiNowPlayingValue = document.getElementById('admin-kpi-now-playing-value');
  const adminKpiNowPlayingDetail = document.getElementById('admin-kpi-now-playing-detail');
  const adminKpiInboxOpen = document.getElementById('admin-kpi-inbox-open');
  const adminKpiInboxOpenValue = document.getElementById('admin-kpi-inbox-open-value');
  const adminKpiInboxOpenDetail = document.getElementById('admin-kpi-inbox-open-detail');
  const statsSummary = document.getElementById('admin-stats-summary');
  const statsKinds = document.getElementById('admin-stats-kinds');
  const statsTopArtists = document.getElementById('admin-stats-top-artists');
  const analyticsSummary = document.getElementById('admin-analytics-summary');
  const analyticsPages = document.getElementById('admin-analytics-pages');
  const analyticsEvents = document.getElementById('admin-analytics-events');
  const inboxSummary = document.getElementById('admin-inbox-summary');
  const inboxRefreshBtn = document.getElementById('admin-inbox-refresh');
  const inboxExport = document.getElementById('admin-inbox-export');
  const inboxSearch = document.getElementById('admin-inbox-search');
  const inboxStatusFilter = document.getElementById('admin-inbox-status-filter');
  const inboxMonthFilter = document.getElementById('admin-inbox-month-filter');
  const inboxList = document.getElementById('admin-inbox-list');
  const backupsSummary = document.getElementById('admin-backups-summary');
  const backupsRefreshBtn = document.getElementById('admin-backups-refresh');
  const backupsList = document.getElementById('admin-backups-list');
  const uploadFile = document.getElementById('admin-upload-file');
  const uploadButton = document.getElementById('admin-upload-button');
  const uploadFeedback = document.getElementById('admin-upload-feedback');
  const uploadResult = document.getElementById('admin-upload-result');
  const adminTabs = [...document.querySelectorAll('.admin-tab')];
  const adminPanels = [...document.querySelectorAll('.admin-panel')];
  let dabPreviewIntervalId = null;
  let adminMonitorLoading = false;
  let adminInboxLoading = false;
  let adminBackupsLoading = false;

  if (!loginForm || !panel || !scheduleList || !mixesList || !newsList || !historyKindsList || !keywordCoversList) return;

  if (passInput && LOCAL_ADMIN_MODE) {
    passInput.required = false;
    passInput.placeholder = 'Lokale modus op dit toestel';
  }

  if (!CMS_API_ENABLED && !LOCAL_ADMIN_MODE && loginFeedback) {
    loginFeedback.textContent = 'Beheer vereist een actieve server-API.';
  }

  const hideAdminRuntimeState = () => {
    if (dabPreviewIntervalId) {
      window.clearInterval(dabPreviewIntervalId);
      dabPreviewIntervalId = null;
    }
  };

  const showAdminLogin = (message = '') => {
    hideAdminRuntimeState();
    adminSessionPasscode = '';
    if (loginWrap) loginWrap.hidden = false;
    panel.hidden = true;
    if (passInput) passInput.value = '';
    if (loginFeedback) loginFeedback.textContent = message;
  };

  const openAdminConsole = (message = '') => {
    if (loginFeedback) loginFeedback.textContent = '';
    if (loginWrap) loginWrap.hidden = true;
    panel.hidden = false;
    renderEditor();
    setActiveAdminTab('admin-panel-schedule');
    startAdminDabPreviewPolling();
    void refreshAdminMonitor();
    void refreshBackups();
    if (feedback) feedback.textContent = message;
  };

  const readSiteStatusForm = () => collectFields({
    enabled: siteStatusEnabled,
    tone: siteStatusTone,
    title: siteStatusTitle,
    message: siteStatusMessage,
    ctaLabel: siteStatusCtaLabel,
    ctaLink: siteStatusCtaLink
  }, normalizeSiteStatus);

  const readNewsFeedForm = () => collectFields({
    enabled: newsFeedEnabled,
    url: newsFeedUrl,
    limit: newsFeedLimit,
    cacheMinutes: newsFeedCache
  }, normalizeNewsFeedSettings);

  const renderEditor = () => {
    const data = getCmsData();
    scheduleList.innerHTML = '';
    mixesList.innerHTML = '';
    newsList.innerHTML = '';
    historyKindsList.innerHTML = '';
    keywordCoversList.innerHTML = '';
    data.schedule.forEach((item) => scheduleList.appendChild(createScheduleEditorRow(item)));
    data.mixes.forEach((item) => mixesList.appendChild(createMixEditorRow(item)));
    data.news.forEach((item) => newsList.appendChild(createNewsEditorRow(item)));
    data.historyKinds.forEach((item) => historyKindsList.appendChild(createHistoryKindEditorRow(item)));
    data.keywordCovers.forEach((item) => keywordCoversList.appendChild(createKeywordCoverEditorRow(item)));
    if (newsFeedEnabled) newsFeedEnabled.checked = Boolean(data.newsFeed?.enabled);
    if (newsFeedUrl) newsFeedUrl.value = data.newsFeed?.url || '';
    if (newsFeedLimit) newsFeedLimit.value = String(data.newsFeed?.limit || 6);
    if (newsFeedCache) newsFeedCache.value = String(data.newsFeed?.cacheMinutes || 15);
    if (siteStatusEnabled) siteStatusEnabled.checked = Boolean(data.siteStatus?.enabled);
    if (siteStatusTone) siteStatusTone.value = data.siteStatus?.tone || 'info';
    if (siteStatusTitle) siteStatusTitle.value = data.siteStatus?.title || '';
    if (siteStatusMessage) siteStatusMessage.value = data.siteStatus?.message || '';
    if (siteStatusCtaLabel) siteStatusCtaLabel.value = data.siteStatus?.ctaLabel || '';
    if (siteStatusCtaLink) siteStatusCtaLink.value = data.siteStatus?.ctaLink || '';
    renderAdminSiteStatusPreview({
      wrap: siteStatusPreview,
      titleEl: siteStatusPreviewTitle,
      messageEl: siteStatusPreviewMessage
    }, readSiteStatusForm());
    if (historyPreviewArtist && !historyPreviewArtist.value) {
      historyPreviewArtist.value = 'RADIO ACCENT';
    }
    if (historyPreviewTitle && !historyPreviewTitle.value) {
      historyPreviewTitle.value = 'NIEUWS - 12.03.2026';
    }
    renderAdminHistoryKindPreview({
      historyKindsList,
      artistInput: historyPreviewArtist,
      titleInput: historyPreviewTitle,
      previewWrap: historyPreviewResult,
      previewMatch: historyPreviewMatch,
      previewKeywords: historyPreviewKeywords
    });
    if (keywordPreviewArtist && !keywordPreviewArtist.value) {
      keywordPreviewArtist.value = 'RADIO ACCENT';
    }
    if (keywordPreviewTitle && !keywordPreviewTitle.value) {
      keywordPreviewTitle.value = 'NIEUWS - 12.03.2026';
    }
    renderAdminKeywordPreview({
      keywordCoversList,
      artistInput: keywordPreviewArtist,
      titleInput: keywordPreviewTitle,
      previewWrap: keywordPreviewCopy,
      previewImage: keywordPreviewImage,
      previewMatch: keywordPreviewMatch,
      previewKeywords: keywordPreviewKeywords
    });
  };

  const setActiveAdminTab = (targetPanelId) => {
    adminTabs.forEach((tab) => {
      const isActive = tab.getAttribute('aria-controls') === targetPanelId;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    adminPanels.forEach((panelElement) => {
      const isActive = panelElement.id === targetPanelId;
      panelElement.classList.toggle('is-active', isActive);
      panelElement.hidden = !isActive;
    });
  };

  const resolveAdminDabMetadataUrl = () => {
    const pathname = (window.location.pathname || '').toLowerCase();
    const relativePath = pathname.includes('/v2/') || pathname.endsWith('/v2') ? '../metadata/json.php' : 'metadata/json.php';
    return new URL(relativePath, window.location.href).toString();
  };

  const updateAdminDabPreview = async () => {
    if (!dabPreviewImage || !dabPreviewTitle || !dabPreviewTime) return;

    const fallbackImage = sanitizeMediaUrl(config.defaultDabSlide || 'assets/logo_dab.png', { fallback: 'assets/logo_dab.png' });

    try {
      const endpoint = resolveAdminDabMetadataUrl();
      const response = await fetch(`${endpoint}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`DAB preview request failed with status ${response.status}`);
      }

      const payload = await response.json();
      const nextCover = sanitizeMediaUrl(payload.cover || '', { fallback: fallbackImage });
      const nextTitle = typeof payload.title === 'string' && payload.title.trim() !== ''
        ? payload.title.trim()
        : 'Onbekende track';

      if (dabPreviewImage.getAttribute('src') !== nextCover) {
        dabPreviewImage.src = nextCover;
      }
      setPreviewTone(dabPreviewMeta, 'success');
      dabPreviewImage.alt = nextTitle;
      wireImageFallback(dabPreviewImage, fallbackImage);
      dabPreviewTitle.textContent = nextTitle;

      const pubDate = typeof payload.pubDate === 'string' ? payload.pubDate.trim() : '';
      const parsedDate = pubDate ? new Date(pubDate) : null;
      dabPreviewTime.textContent = parsedDate && !Number.isNaN(parsedDate.getTime())
        ? `Laatst ververst: ${parsedDate.toLocaleString('nl-BE')}`
        : '';
    } catch {
      setPreviewTone(dabPreviewMeta, 'warning');
      dabPreviewTitle.textContent = 'DAB-slide kon niet geladen worden.';
      dabPreviewTime.textContent = '';
      dabPreviewImage.src = fallbackImage;
      wireImageFallback(dabPreviewImage, fallbackImage);
    }
  };

  const startAdminDabPreviewPolling = () => {
    if (dabPreviewIntervalId) {
      window.clearInterval(dabPreviewIntervalId);
    }
    void updateAdminDabPreview();
    dabPreviewIntervalId = window.setInterval(() => {
      void updateAdminDabPreview();
    }, 15000);
  };

  const refreshAdminMonitor = async () => {
    if (adminMonitorLoading || !healthSummary || !healthList || !statsSummary || !statsKinds || !statsTopArtists || !healthUpdated || !analyticsSummary || !analyticsPages || !analyticsEvents) {
      return;
    }

    adminMonitorLoading = true;
    healthSummary.textContent = 'Checks laden...';
    statsSummary.textContent = 'Statistieken laden...';
    analyticsSummary.textContent = 'Analytics laden...';
    healthList.innerHTML = renderEmptyStateCard({
      title: 'Checks laden',
      text: 'Servercontroles worden opgehaald.',
      tone: 'info',
      compact: true
    });
    statsTopArtists.innerHTML = renderEmptyStateCard({
      title: 'Statistieken laden',
      text: 'Playlistcijfers worden berekend.',
      tone: 'info',
      compact: true
    });
    analyticsPages.innerHTML = '';
    analyticsEvents.innerHTML = '';
    setAdminKpiCardState(adminKpiMixFeed, adminKpiMixFeedValue, adminKpiMixFeedDetail, {
      status: 'info',
      value: 'Laden...',
      detail: 'We halen de laatste mix-feed refresh op.'
    });
    setAdminKpiCardState(adminKpiNowPlaying, adminKpiNowPlayingValue, adminKpiNowPlayingDetail, {
      status: 'info',
      value: 'Laden...',
      detail: 'We halen de laatste metadata-update op.'
    });
    setAdminKpiCardState(adminKpiInboxOpen, adminKpiInboxOpenValue, adminKpiInboxOpenDetail, {
      status: 'info',
      value: 'Laden...',
      detail: 'We tellen de open inboxberichten.'
    });
    try {
      const [healthPayload, statsPayload, analyticsPayload, inboxPayload, mixFeedPayload, nowPlayingPayload] = await Promise.all([
        fetchAdminMonitorPayload('api/health.php'),
        fetchAdminMonitorPayload('api/playlist-stats.php?days=7'),
        fetchAdminMonitorPayload(`${CMS_ANALYTICS_ENDPOINT}?days=7`),
        fetchAdminMonitorPayload(`${CMS_INBOX_ENDPOINT}?limit=1`),
        fetchOptionalMixFeedPayload(),
        fetchOptionalJson(config.nowPlayingApi || 'api/now-playing.php')
      ]);
      renderAdminHealthReport({
        summaryEl: healthSummary,
        listEl: healthList,
        updatedEl: healthUpdated
      }, healthPayload);
      renderAdminStatsReport({
        summaryEl: statsSummary,
        kindsEl: statsKinds,
        topArtistsEl: statsTopArtists
      }, statsPayload);
      renderAdminAnalyticsReport({
        summaryEl: analyticsSummary,
        pagesEl: analyticsPages,
        eventsEl: analyticsEvents
      }, analyticsPayload, inboxPayload);
      renderAdminMonitorKpis({
        mixFeedCard: adminKpiMixFeed,
        mixFeedValue: adminKpiMixFeedValue,
        mixFeedDetail: adminKpiMixFeedDetail,
        nowPlayingCard: adminKpiNowPlaying,
        nowPlayingValue: adminKpiNowPlayingValue,
        nowPlayingDetail: adminKpiNowPlayingDetail,
        inboxCard: adminKpiInboxOpen,
        inboxValue: adminKpiInboxOpenValue,
        inboxDetail: adminKpiInboxOpenDetail
      }, mixFeedPayload, nowPlayingPayload, inboxPayload);
    } catch {
      healthUpdated.textContent = 'Monitor tijdelijk niet beschikbaar.';
      healthSummary.textContent = 'Checks konden niet geladen worden.';
      healthList.innerHTML = renderEmptyStateCard({
        title: 'Checks niet beschikbaar',
        text: 'Controleer of de monitor-endpoints bereikbaar zijn.',
        tone: 'warning',
        compact: true
      });
      statsSummary.textContent = 'Statistieken konden niet geladen worden.';
      statsKinds.innerHTML = '';
      statsTopArtists.innerHTML = renderEmptyStateCard({
        title: 'Statistieken niet beschikbaar',
        text: 'De playlistmonitor kon geen cijfers laden.',
        tone: 'warning',
        compact: true
      });
      analyticsSummary.textContent = 'Analytics konden niet geladen worden.';
      analyticsPages.innerHTML = renderEmptyStateCard({
        title: 'Analytics niet beschikbaar',
        text: 'De analytische endpoint kon geen cijfers teruggeven.',
        tone: 'warning',
        compact: true
      });
      analyticsEvents.innerHTML = '';
      setAdminKpiCardState(adminKpiMixFeed, adminKpiMixFeedValue, adminKpiMixFeedDetail, {
        status: 'warning',
        value: 'Niet beschikbaar',
        detail: 'De mix-feed KPI kon niet geladen worden.'
      });
      setAdminKpiCardState(adminKpiNowPlaying, adminKpiNowPlayingValue, adminKpiNowPlayingDetail, {
        status: 'warning',
        value: 'Niet beschikbaar',
        detail: 'De now-playing KPI kon niet geladen worden.'
      });
      setAdminKpiCardState(adminKpiInboxOpen, adminKpiInboxOpenValue, adminKpiInboxOpenDetail, {
        status: 'warning',
        value: 'Niet beschikbaar',
        detail: 'De inbox KPI kon niet geladen worden.'
      });
    } finally {
      adminMonitorLoading = false;
    }
  };

  const refreshInbox = async () => {
    if (adminInboxLoading || !inboxSummary || !inboxList || !inboxStatusFilter || !inboxMonthFilter) return;
    adminInboxLoading = true;
    inboxSummary.textContent = 'Inbox laden...';
    inboxList.innerHTML = renderEmptyStateCard({
      title: 'Inbox laden',
      text: 'Contactberichten worden opgehaald.',
      tone: 'info',
      compact: true
    });
    try {
      const params = new URLSearchParams();
      const query = String(inboxSearch?.value || '').trim();
      const status = String(inboxStatusFilter.value || 'all').trim();
      const month = String(inboxMonthFilter.value || '').trim();
      if (query) params.set('q', query);
      if (status) params.set('status', status);
      if (month) params.set('month', month);
      params.set('limit', '100');

      if (inboxExport) {
        inboxExport.href = `${CMS_INBOX_ENDPOINT}?${params.toString() ? `${params.toString()}&` : ''}format=csv`;
      }

      const payload = await fetchAdminMonitorPayload(`${CMS_INBOX_ENDPOINT}?${params.toString()}`);
      renderAdminInboxReport({
        summaryEl: inboxSummary,
        monthSelect: inboxMonthFilter,
        listEl: inboxList
      }, payload);
    } catch {
      inboxSummary.textContent = 'Inbox niet beschikbaar.';
      inboxList.innerHTML = renderEmptyStateCard({
        title: 'Inbox niet beschikbaar',
        text: 'De contactinbox kon niet geladen worden.',
        tone: 'warning',
        compact: true
      });
    } finally {
      adminInboxLoading = false;
    }
  };

  const refreshBackups = async () => {
    if (adminBackupsLoading || !backupsSummary || !backupsList) return;
    adminBackupsLoading = true;
    backupsSummary.textContent = 'Backups laden...';
    backupsList.innerHTML = renderEmptyStateCard({
      title: 'Backups laden',
      text: 'Versiehistoriek wordt opgehaald.',
      tone: 'info',
      compact: true
    });
    try {
      const payload = await postCmsApi({ action: 'backups' });
      if (!payload?.ok) {
        throw new Error(payload?.error || 'Backups unavailable');
      }
      renderAdminBackupsReport({
        summaryEl: backupsSummary,
        listEl: backupsList
      }, payload);
    } catch {
      backupsSummary.textContent = 'Backups niet beschikbaar.';
      backupsList.innerHTML = renderEmptyStateCard({
        title: 'Backups niet beschikbaar',
        text: 'De backuphistoriek kon niet geladen worden.',
        tone: 'warning',
        compact: true
      });
    } finally {
      adminBackupsLoading = false;
    }
  };

  const removeRowHandler = (event) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest('[data-action="remove"]');
    if (!trigger) return;
    const row = trigger.closest('.admin-row');
    if (row) row.remove();
  };

  scheduleList.addEventListener('click', removeRowHandler);
  mixesList.addEventListener('click', removeRowHandler);
  newsList.addEventListener('click', removeRowHandler);
  historyKindsList.addEventListener('click', (event) => {
    removeRowHandler(event);
    window.setTimeout(() => {
      renderAdminHistoryKindPreview({
        historyKindsList,
        artistInput: historyPreviewArtist,
        titleInput: historyPreviewTitle,
        previewWrap: historyPreviewResult,
        previewMatch: historyPreviewMatch,
        previewKeywords: historyPreviewKeywords
      });
    }, 0);
  });
  keywordCoversList.addEventListener('click', (event) => {
    removeRowHandler(event);
    window.setTimeout(() => {
      renderAdminKeywordPreview({
        keywordCoversList,
        artistInput: keywordPreviewArtist,
        titleInput: keywordPreviewTitle,
        previewWrap: keywordPreviewCopy,
        previewImage: keywordPreviewImage,
        previewMatch: keywordPreviewMatch,
        previewKeywords: keywordPreviewKeywords
      });
    }, 0);
  });

  if (addScheduleBtn) addScheduleBtn.onclick = () => scheduleList.appendChild(createScheduleEditorRow());
  if (addMixBtn) addMixBtn.onclick = () => mixesList.appendChild(createMixEditorRow());
  if (addNewsBtn) addNewsBtn.onclick = () => newsList.appendChild(createNewsEditorRow());
  if (addHistoryKindBtn) {
    addHistoryKindBtn.onclick = () => {
      historyKindsList.appendChild(createHistoryKindEditorRow());
      renderAdminHistoryKindPreview({
        historyKindsList,
        artistInput: historyPreviewArtist,
        titleInput: historyPreviewTitle,
        previewWrap: historyPreviewResult,
        previewMatch: historyPreviewMatch,
        previewKeywords: historyPreviewKeywords
      });
    };
  }
  if (addKeywordCoverBtn) {
    addKeywordCoverBtn.onclick = () => {
      keywordCoversList.appendChild(createKeywordCoverEditorRow());
      renderAdminKeywordPreview({
        keywordCoversList,
        artistInput: keywordPreviewArtist,
        titleInput: keywordPreviewTitle,
        previewWrap: keywordPreviewCopy,
        previewImage: keywordPreviewImage,
        previewMatch: keywordPreviewMatch,
        previewKeywords: keywordPreviewKeywords
      });
    };
  }

  const syncKeywordPreview = () => {
    renderAdminKeywordPreview({
      keywordCoversList,
      artistInput: keywordPreviewArtist,
      titleInput: keywordPreviewTitle,
      previewWrap: keywordPreviewCopy,
      previewImage: keywordPreviewImage,
      previewMatch: keywordPreviewMatch,
      previewKeywords: keywordPreviewKeywords
    });
  };

  const syncHistoryKindPreview = () => {
    renderAdminHistoryKindPreview({
      historyKindsList,
      artistInput: historyPreviewArtist,
      titleInput: historyPreviewTitle,
      previewWrap: historyPreviewResult,
      previewMatch: historyPreviewMatch,
      previewKeywords: historyPreviewKeywords
    });
  };

  historyKindsList.addEventListener('input', syncHistoryKindPreview);
  historyKindsList.addEventListener('change', syncHistoryKindPreview);
  [siteStatusEnabled, siteStatusTone, siteStatusTitle, siteStatusMessage, siteStatusCtaLabel, siteStatusCtaLink]
    .filter(Boolean)
    .forEach((input) => {
      input.addEventListener('input', () => {
        renderAdminSiteStatusPreview({
          wrap: siteStatusPreview,
          titleEl: siteStatusPreviewTitle,
          messageEl: siteStatusPreviewMessage
        }, readSiteStatusForm());
      });
      input.addEventListener('change', () => {
        renderAdminSiteStatusPreview({
          wrap: siteStatusPreview,
          titleEl: siteStatusPreviewTitle,
          messageEl: siteStatusPreviewMessage
        }, readSiteStatusForm());
      });
    });
  if (historyPreviewArtist) historyPreviewArtist.addEventListener('input', syncHistoryKindPreview);
  if (historyPreviewTitle) historyPreviewTitle.addEventListener('input', syncHistoryKindPreview);
  keywordCoversList.addEventListener('input', syncKeywordPreview);
  if (keywordPreviewArtist) keywordPreviewArtist.addEventListener('input', syncKeywordPreview);
  if (keywordPreviewTitle) keywordPreviewTitle.addEventListener('input', syncKeywordPreview);

  if (saveBtn) {
    saveBtn.onclick = async () => {
      const next = {
        schedule: collectEditorRows(scheduleList, normalizeScheduleItem),
        mixes: collectEditorRows(mixesList, normalizeMixItem),
        news: collectEditorRows(newsList, normalizeNewsItem),
        newsFeed: readNewsFeedForm(),
        siteStatus: readSiteStatusForm(),
        historyKinds: collectEditorRows(historyKindsList, normalizeHistoryKindRule),
        keywordCovers: collectEditorRows(keywordCoversList, normalizeKeywordCoverItem)
      };

      setCmsData(next);

      if (CMS_API_ENABLED) {
        const remoteSaved = await saveCmsRemote(next);
        if (!remoteSaved?.ok) {
          if (remoteSaved?.status === 401) {
            showAdminLogin('Je beheersessie is verlopen. Log opnieuw in.');
          }
          feedback.textContent = remoteSaved?.status === 401
            ? 'Server-update geweigerd omdat de sessie verlopen is.'
            : 'Lokaal opgeslagen, maar server-update mislukte.';
          renderCmsContent();
          return;
        }
      }

      renderEditor();
      renderCmsContent();
      refreshNewsFeedRender('admin save');
      void refreshBackups();
      feedback.textContent = 'Wijzigingen opgeslagen.';
    };
  }

  if (resetBtn) {
    resetBtn.onclick = async () => {
      if (CMS_API_ENABLED) {
        const remoteReset = await resetCmsRemote();
        if (!remoteReset?.ok) {
          if (remoteReset?.status === 401) {
            showAdminLogin('Je beheersessie is verlopen. Log opnieuw in.');
          }
          feedback.textContent = remoteReset?.status === 401
            ? 'Reset geweigerd omdat de sessie verlopen is.'
            : 'Reset op server mislukt.';
          return;
        }
      } else {
        setCmsData(cmsDefaults);
      }
      renderEditor();
      renderCmsContent();
      refreshNewsFeedRender('admin reset');
      void refreshBackups();
      feedback.textContent = 'Teruggezet naar standaardinhoud.';
    };
  }

  if (exportBtn) {
    exportBtn.onclick = () => {
      const data = getCmsData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'radio-accent-content.json';
      a.click();
      URL.revokeObjectURL(url);
      feedback.textContent = 'JSON export aangemaakt.';
    };
  }

  if (importInput) {
    importInput.onchange = async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        setCmsData(parsed);
        renderEditor();
        renderCmsContent();
        refreshNewsFeedRender('admin import');
        void refreshBackups();
        feedback.textContent = 'Import succesvol verwerkt.';
      } catch {
        feedback.textContent = 'Import mislukt: geen geldig JSON-bestand.';
      }
      event.target.value = '';
    };
  }

  if (dabPreviewRefreshBtn) {
    dabPreviewRefreshBtn.onclick = () => {
      void updateAdminDabPreview();
    };
  }

  adminTabs.forEach((tab) => {
    tab.onclick = () => {
      const targetPanelId = tab.getAttribute('aria-controls');
      if (targetPanelId) {
        setActiveAdminTab(targetPanelId);
        if (targetPanelId === 'admin-panel-monitor') {
          void refreshAdminMonitor();
        }
        if (targetPanelId === 'admin-panel-inbox') {
          void refreshInbox();
        }
        if (targetPanelId === 'admin-panel-backups') {
          void refreshBackups();
        }
      }
    };
  });

  if (healthRefreshBtn) {
    healthRefreshBtn.onclick = () => {
      void refreshAdminMonitor();
    };
  }

  if (inboxRefreshBtn) {
    inboxRefreshBtn.onclick = () => {
      void refreshInbox();
    };
  }

  if (backupsRefreshBtn) {
    backupsRefreshBtn.onclick = () => {
      void refreshBackups();
    };
  }

  [inboxSearch, inboxStatusFilter, inboxMonthFilter].filter(Boolean).forEach((input) => {
    input.addEventListener('input', () => {
      void refreshInbox();
    });
    input.addEventListener('change', () => {
      void refreshInbox();
    });
  });

  if (inboxList) {
    inboxList.addEventListener('change', async (event) => {
      if (!(event.target instanceof HTMLSelectElement) || event.target.dataset.inboxStatus === undefined) return;
      const id = String(event.target.dataset.id || '').trim();
      const status = String(event.target.value || '').trim();
      const result = await postAdminJson(CMS_INBOX_ENDPOINT, { action: 'status', id, status });
      if (!result.ok) {
        if (feedback) feedback.textContent = result.error || 'Inboxstatus kon niet opgeslagen worden.';
        return;
      }
      if (feedback) feedback.textContent = 'Inboxstatus bijgewerkt.';
      void refreshInbox();
    });
  }

  if (backupsList) {
    backupsList.addEventListener('click', async (event) => {
      if (!(event.target instanceof Element)) return;
      const trigger = event.target.closest('[data-restore-backup]');
      if (!trigger) return;
      const backupId = String(trigger.getAttribute('data-restore-backup') || '').trim();
      if (!backupId) return;
      const result = await postCmsApi({ action: 'restoreBackup', id: backupId });
      if (!result?.ok || !result.data) {
        if (feedback) feedback.textContent = result?.error || 'Backup kon niet teruggezet worden.';
        return;
      }
      setCmsData(result.data);
      renderEditor();
      renderCmsContent();
      void refreshBackups();
      if (feedback) feedback.textContent = 'Backup teruggezet.';
    });
  }

  if (uploadButton) {
    uploadButton.onclick = async () => {
      if (!uploadFile?.files?.[0]) {
        if (uploadFeedback) uploadFeedback.textContent = 'Kies eerst een beeldbestand.';
        return;
      }
      if (!CMS_API_ENABLED) {
        if (uploadFeedback) uploadFeedback.textContent = 'Uploads vereisen de server-API.';
        return;
      }

      const formData = new FormData();
      formData.append('file', uploadFile.files[0]);
      if (uploadFeedback) uploadFeedback.textContent = 'Upload bezig...';

      try {
        const response = await fetch(CMS_UPLOAD_ENDPOINT, {
          method: 'POST',
          body: formData,
          credentials: 'same-origin'
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || `HTTP ${response.status}`);
        }
        if (uploadResult) uploadResult.value = payload.data?.url || '';
        if (uploadFeedback) uploadFeedback.textContent = 'Upload gelukt. Gebruik de URL in je contentvelden.';
        if (uploadFile) uploadFile.value = '';
      } catch (error) {
        if (uploadFeedback) uploadFeedback.textContent = error?.message || 'Upload mislukt.';
      }
    };
  }

  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await logoutCmsRemote();
      showAdminLogin('Je bent uitgelogd.');
      if (feedback) feedback.textContent = '';
    };
  }

  loginForm.onsubmit = async (event) => {
    event.preventDefault();
    const entered = (passInput?.value || '').trim();
    if (!entered && !LOCAL_ADMIN_MODE) {
      if (loginFeedback) loginFeedback.textContent = 'Voer een toegangscode in.';
      return;
    }

    let authorized = false;
    if (CMS_API_ENABLED) {
      const authResult = await verifyAdminPasscodeRemote(entered);
      authorized = Boolean(authResult?.ok);
      if (!authorized) {
        if (loginFeedback) loginFeedback.textContent = authResult?.error || 'Onjuiste toegangscode.';
        return;
      }
    } else if (LOCAL_ADMIN_MODE) {
      authorized = true;
    } else {
      if (loginFeedback) loginFeedback.textContent = 'Beheer vereist een actieve server-API.';
      return;
    }

    adminSessionPasscode = entered;
    openAdminConsole(LOCAL_ADMIN_MODE ? 'Lokale modus actief. Wijzigingen blijven op dit toestel.' : '');
  };

  if (CMS_API_ENABLED) {
    void getAdminSessionStatusRemote().then((statusResult) => {
      if (statusResult?.authenticated) {
        openAdminConsole();
      }
    });
  }
};
const getConsent = () => {
  try {
    const raw = getSafeStorageItem('localStorage', CONSENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const setConsent = (analyticsAllowed) => {
  const value = {
    necessary: true,
    analytics: Boolean(analyticsAllowed),
    timestamp: new Date().toISOString()
  };
  setSafeStorageItem('localStorage', CONSENT_KEY, JSON.stringify(value));
  return value;
};

const hideConsentBanner = () => {
  const banner = document.getElementById('consent-banner');
  if (banner) {
    banner.remove();
  }
};

const initAnalytics = () => {
  const analytics = config.analytics || {};
  const consent = getConsent();
  if (analyticsInitialized || !analytics.enabled || !consent?.analytics) {
    return;
  }

  if (analytics.provider === 'plausible') {
    if (!document.getElementById('plausible-script')) {
      const script = document.createElement('script');
      script.id = 'plausible-script';
      script.defer = true;
      script.dataset.domain = analytics.domain || window.location.hostname;
      script.src = analytics.scriptSrc || 'https://plausible.io/js/script.js';
      document.head.appendChild(script);
    }
  }

  analyticsInitialized = true;
};

const trackPageView = (pathValue = window.location.pathname + window.location.search) => {
  const analytics = config.analytics || {};
  const consent = getConsent();
  if (!analytics.enabled || !consent?.analytics) {
    return;
  }

  if (analytics.provider === 'plausible' && typeof window.plausible === 'function') {
    window.plausible('pageview', {
      u: window.location.origin + pathValue
    });
    return;
  }

  if (analytics.endpoint) {
    const payload = JSON.stringify({
      path: pathValue,
      title: document.title,
      ts: new Date().toISOString()
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(analytics.endpoint, payload);
    } else {
      fetch(analytics.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
    }
  }
};

const renderConsentBanner = () => {
  if (document.getElementById('consent-banner') || getConsent()) {
    return;
  }

  const banner = document.createElement('div');
  banner.id = 'consent-banner';
  banner.className = 'consent-banner';
  banner.innerHTML = `
    <div class="container consent-inner">
      <p>
        We gebruiken essenti\u00eble opslag voor de player. Met jouw toestemming gebruiken we ook privacyvriendelijke analytics.
        <a href="privacy.html">Lees privacybeleid</a>
      </p>
      <div class="consent-actions">
        <button id="consent-accept" class="btn btn-small" type="button">Alles toestaan</button>
        <button id="consent-necessary" class="btn btn-small btn-ghost" type="button">Enkel noodzakelijk</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  const accept = document.getElementById('consent-accept');
  const necessary = document.getElementById('consent-necessary');

  if (accept) {
    accept.onclick = () => {
      setConsent(true);
      hideConsentBanner();
      initAnalytics();
      trackPageView();
    };
  }

  if (necessary) {
    necessary.onclick = () => {
      setConsent(false);
      hideConsentBanner();
    };
  }
};

const ensurePwaHeadTags = () => {
  const head = document.head;
  if (!head) return;

  const ensureNode = (selector, createNode) => {
    let node = head.querySelector(selector);
    if (!node) {
      node = createNode();
      head.appendChild(node);
    }
    return node;
  };

  const manifest = ensureNode('link[rel="manifest"]', () => {
    const node = document.createElement('link');
    node.rel = 'manifest';
    return node;
  });
  manifest.setAttribute('href', 'manifest.webmanifest');

  const themeColor = ensureNode('meta[name="theme-color"]', () => {
    const node = document.createElement('meta');
    node.name = 'theme-color';
    return node;
  });
  themeColor.setAttribute('content', '#17365b');

  const appleCapable = ensureNode('meta[name="apple-mobile-web-app-capable"]', () => {
    const node = document.createElement('meta');
    node.name = 'apple-mobile-web-app-capable';
    return node;
  });
  appleCapable.setAttribute('content', 'yes');

  const mobileCapable = ensureNode('meta[name="mobile-web-app-capable"]', () => {
    const node = document.createElement('meta');
    node.name = 'mobile-web-app-capable';
    return node;
  });
  mobileCapable.setAttribute('content', 'yes');

  const appleStatusBar = ensureNode('meta[name="apple-mobile-web-app-status-bar-style"]', () => {
    const node = document.createElement('meta');
    node.name = 'apple-mobile-web-app-status-bar-style';
    return node;
  });
  appleStatusBar.setAttribute('content', 'default');

  const appleTitle = ensureNode('meta[name="apple-mobile-web-app-title"]', () => {
    const node = document.createElement('meta');
    node.name = 'apple-mobile-web-app-title';
    return node;
  });
  appleTitle.setAttribute('content', config.stationName || 'Radio Accent');

  const appleTouchIcon = ensureNode('link[rel="apple-touch-icon"]', () => {
    const node = document.createElement('link');
    node.rel = 'apple-touch-icon';
    return node;
  });
  appleTouchIcon.setAttribute('href', 'assets/600x600.png');
};

const renderPwaInstallButton = () => {
  const heroActions = document.querySelector('.hero-actions');
  const existing = document.getElementById('pwa-install-btn');

  if (!heroActions || !pwaState.deferredPrompt || pwaState.installed) {
    if (existing) existing.remove();
    return;
  }

  if (existing) return;

  const button = document.createElement('button');
  button.id = 'pwa-install-btn';
  button.type = 'button';
  button.className = 'btn btn-ghost btn-install';
  button.textContent = 'Installeer app';
  button.onclick = async () => {
    if (!pwaState.deferredPrompt) return;
    try {
      await pwaState.deferredPrompt.prompt();
      await pwaState.deferredPrompt.userChoice.catch(() => null);
    } finally {
      pwaState.deferredPrompt = null;
      renderPwaInstallButton();
    }
  };
  heroActions.appendChild(button);
};

const bindPwaInstallSupport = () => {
  if (pwaState.listenersBound) {
    renderPwaInstallButton();
    return;
  }

  pwaState.listenersBound = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pwaState.deferredPrompt = event;
    renderPwaInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    pwaState.installed = true;
    pwaState.deferredPrompt = null;
    renderPwaInstallButton();
  });

  renderPwaInstallButton();
};

const registerServiceWorker = () => {
  if (pwaState.serviceWorkerRegistered || !('serviceWorker' in navigator)) return;

  const isSecureContextLike = window.location.protocol === 'https:'
    || window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1';
  if (!isSecureContextLike) return;

  pwaState.serviceWorkerRegistered = true;
  navigator.serviceWorker.register('sw.js').catch((error) => {
    pwaState.serviceWorkerRegistered = false;
    console.error('Service worker registration failed.', error);
  });
};

const PAGE_HEAD_SELECTORS = [
  'link[rel="canonical"]',
  'meta[name="description"]',
  'meta[name="robots"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[property="og:url"]',
  'meta[property="og:image"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
  'meta[name="twitter:image"]'
];

const syncPageHead = (nextDocument) => {
  PAGE_HEAD_SELECTORS.forEach((selector) => {
    const currentNode = document.head.querySelector(selector);
    const nextNode = nextDocument.head.querySelector(selector);
    if (nextNode && currentNode) {
      currentNode.replaceWith(nextNode.cloneNode(true));
      return;
    }
    if (nextNode && !currentNode) {
      document.head.appendChild(nextNode.cloneNode(true));
      return;
    }
    if (!nextNode && currentNode) {
      currentNode.remove();
    }
  });
};

const updateCurrentNav = (url) => {
  const currentPath = new URL(url, window.location.origin).pathname;
  document.querySelectorAll('.main-nav a').forEach((anchor) => {
    if (!anchor.href || anchor.hasAttribute('data-stream-link')) return;
    const path = new URL(anchor.href, window.location.origin).pathname;
    if (path === currentPath) anchor.setAttribute('aria-current', 'page');
    else anchor.removeAttribute('aria-current');
  });
};

const isInternalPageLink = (anchor) => {
  if (!anchor || anchor.hasAttribute('data-stream-link')) return false;
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  const url = new URL(anchor.href, window.location.origin);
  return url.origin === window.location.origin;
};

const rehydratePage = () => {
  runSafely('setBranding', () => setBranding());
  runSafely('setContact', () => setContact());
  runSafely('ensurePwaHeadTags', () => ensurePwaHeadTags());
  runSafely('bindStreamLinks', () => bindStreamLinks());
  runSafely('bindLastPlayedCarousel', () => bindLastPlayedCarousel());
  runSafely('bindContactForm', () => bindContactForm());
  runSafely('bindPlaylistPage', () => bindPlaylistPage());
  runSafely('bindPwaInstallSupport', () => bindPwaInstallSupport());
  runSafely('renderConsentBanner', () => renderConsentBanner());
  runSafely('initAnalytics', () => initAnalytics());
  runSafely('updateCurrentNav', () => updateCurrentNav(window.location.href));
  runSafely('startMetadataTransport', () => startMetadataTransport());
  runSafely('startProgramClock', () => startProgramClock());
  runSafely('renderCmsContent', () => renderCmsContent());
  void fetchMixesFeed()
    .then(() => {
      runSafely('renderCmsContent after mix feed', () => renderCmsContent());
    })
    .catch((error) => {
      console.error('Mix feed refresh failed during rehydrate.', error);
    });
  refreshNewsFeedRender('rehydrate');
  void hydrateCmsFromApi().catch((error) => {
    console.error('CMS hydrate failed during rehydrate.', error);
  });
  runSafely('bindAdminConsole', () => bindAdminConsole());
};

const navigateTo = async (url, pushState = true) => {
  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      savePlaybackSnapshot();
      window.location.href = url;
      return;
    }

    const html = await response.text();
    const parser = new DOMParser();
    const nextDocument = parser.parseFromString(html, 'text/html');
    const nextMain = nextDocument.querySelector('main');
    const currentMain = document.querySelector('main');
    const nextFooter = nextDocument.querySelector('footer');
    const currentFooter = document.querySelector('footer');
    if (!nextMain || !currentMain) {
      savePlaybackSnapshot();
      window.location.href = url;
      return;
    }

    currentMain.replaceWith(nextMain);
    if (nextFooter && currentFooter) {
      currentFooter.replaceWith(nextFooter);
    }
    syncPageHead(nextDocument);
    document.title = nextDocument.title || document.title;
    if (pushState) window.history.pushState({ url }, '', url);

    window.scrollTo({ top: 0, behavior: 'auto' });
    if (nav) nav.classList.remove('is-open');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    rehydratePage();

    const trackedPath = new URL(url, window.location.origin);
    trackPageView(trackedPath.pathname + trackedPath.search);
  } catch {
    savePlaybackSnapshot();
    window.location.href = url;
  }
};

const runSafely = (label, callback) => {
  try {
    return callback();
  } catch (error) {
    console.error(`Radio Accent init error in ${label}.`, error);
    return null;
  }
};

if (menuToggle && nav) {
  menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!expanded));
    nav.classList.toggle('is-open');
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const anchor = event.target.closest('a');
  if (!anchor || !isInternalPageLink(anchor)) return;
  if (!canSpaNavigate) {
    savePlaybackSnapshot();
    return;
  }
  event.preventDefault();
  navigateTo(anchor.href);
});

window.addEventListener('beforeunload', savePlaybackSnapshot);

window.addEventListener('popstate', () => {
  if (!canSpaNavigate) return;
  navigateTo(window.location.href, false);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    void refreshMetadata();
  }
});

window.addEventListener('scroll', () => {
  if (!header) return;
  header.style.boxShadow = window.scrollY > 8 ? '0 8px 22px rgba(12, 26, 42, 0.16)' : 'none';
});

runSafely('setBranding', () => setBranding());
runSafely('applyDeviceClasses', () => applyDeviceClasses());
runSafely('setContact', () => setContact());
runSafely('ensurePwaHeadTags', () => ensurePwaHeadTags());
runSafely('bindPlayer', () => bindPlayer());
runSafely('bindStreamLinks', () => bindStreamLinks());
runSafely('bindLastPlayedCarousel', () => bindLastPlayedCarousel());
runSafely('bindContactForm', () => bindContactForm());
runSafely('bindPlaylistPage', () => bindPlaylistPage());
runSafely('bindPwaInstallSupport', () => bindPwaInstallSupport());
runSafely('renderConsentBanner', () => renderConsentBanner());
runSafely('initAnalytics', () => initAnalytics());
runSafely('updateCurrentNav', () => updateCurrentNav(window.location.href));
runSafely('registerServiceWorker', () => registerServiceWorker());
runSafely('startMetadataTransport', () => startMetadataTransport());
runSafely('startProgramClock', () => startProgramClock());
runSafely('renderCmsContent', () => renderCmsContent());
void fetchMixesFeed()
  .then(() => {
    runSafely('renderCmsContent after mix feed', () => renderCmsContent());
  })
  .catch((error) => {
    console.error('Mix feed refresh failed during bootstrap.', error);
  });
refreshNewsFeedRender('bootstrap');
void hydrateCmsFromApi().catch((error) => {
  console.error('CMS hydrate failed during bootstrap.', error);
});
runSafely('bindAdminConsole', () => bindAdminConsole());
runSafely('trackPageView', () => trackPageView());

if (resumeWasPlaying) {
  playerState.quality = getSafeStorageItem('sessionStorage', 'radioAccentQuality') || playerState.quality;
  setBranding();
  playStream({ isResume: true });
}

window.addEventListener('resize', syncMobilePlayerCollapseUi);

















