import { firebaseConfig, firebaseVapidKey, isFirebaseConfigured } from './firebase-config.js';

const STORAGE = {
  settings: 'rutalista-settings-v1',
  history: 'rutalista-history-v1',
  mode: 'rutalista-mode-v1',
  frequent: 'rutalista-frequent-v1',
};

const SEARCH_REGIONS = {
  '🇻🇪 Venezuela (Táchira)': {
    label: 'Venezuela (Táchira)',
    countrycodes: 've',
    viewbox: '-72.6,8.2,-71.4,7.4',
  },
  '🇻🇪 Venezuela (todo el país)': {
    label: 'Venezuela (todo el país)',
    countrycodes: 've',
  },
  '🇨🇴 Colombia': {
    label: 'Colombia',
    countrycodes: 'co',
  },
  '🌎 Todo el mundo (sin filtro)': {
    label: 'Todo el mundo',
    countrycodes: '',
  },
};
const DEFAULT_SEARCH_REGION = '🇻🇪 Venezuela (Táchira)';

const defaults = {
  businesses: [],
  bases: [],
  rates: {
    minimum_cop: 4000,
    km_1_to_1_9_cop: 5000,
    km_2_cop: 6000,
    extra_km_cop: 1000,
    tiers: [
      { km: 1.5, price: 5000 },
      { km: 2, price: 6000 },
      { km: 3, price: 7000 },
      { km: 4, price: 8000 },
      { km: 5, price: 9000 },
      { km: 6, price: 10000 },
    ],
    cop_per_usd: 3300,
    cop_per_bs: 3,
  },
  monthlyGoal: 500000,
  profitSplit: { mine: 30, bike: 70 },
  motoPayments: [],
  salaryPayments: [],
  searchRegion: DEFAULT_SEARCH_REGION,
  customCountryCodes: '',
};

function normalizeSettings(rawSettings = {}) {
  const source = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const normalized = { ...defaults, ...source };
  const savedRates = source.rates && typeof source.rates === 'object' ? source.rates : {};
  const oldRateData = {};
  for (const key of ['base', 'km', 'min']) {
    if (Object.prototype.hasOwnProperty.call(savedRates, key)) oldRateData[key] = savedRates[key];
  }
  if (source.careerRates) oldRateData.careerRates = source.careerRates;
  if (Object.prototype.hasOwnProperty.call(source, 'differentCareerRates')) {
    oldRateData.differentCareerRates = source.differentCareerRates;
  }
  if (Object.keys(oldRateData).length && !normalized.legacyRateSettings) {
    normalized.legacyRateSettings = oldRateData;
  }
  const legacyBandRate = Number(savedRates.km_1_to_1_9_cop);
  const legacyTwoKmRate = Number(savedRates.km_2_cop);
  const legacyExtraRate = Number(savedRates.extra_km_cop);
  const legacyTiers = defaults.rates.tiers.map((tier, index) => ({
    km: tier.km,
    price: index === 0 && Number.isFinite(legacyBandRate)
      ? Math.max(0, legacyBandRate)
      : index === 1 && Number.isFinite(legacyTwoKmRate)
        ? Math.max(0, legacyTwoKmRate)
        : Number.isFinite(legacyTwoKmRate) && Number.isFinite(legacyExtraRate)
          ? Math.max(0, legacyTwoKmRate + (index - 1) * legacyExtraRate)
          : tier.price,
  }));
  const savedTiers = Array.isArray(savedRates.tiers) ? savedRates.tiers : null;
  const tiers = (savedTiers?.length ? savedTiers : legacyTiers).map((tier, index) => ({
    km: Number.isFinite(Number(tier?.km)) && Number(tier.km) > 0
      ? Number(tier.km) : (defaults.rates.tiers[index]?.km || defaults.rates.tiers.at(-1).km),
    price: Number.isFinite(Number(tier?.price))
      ? Math.max(0, Number(tier.price)) : (defaults.rates.tiers[index]?.price || 0),
  }));
  normalized.rates = {
    ...savedRates,
    minimum_cop: Number.isFinite(Number(savedRates.minimum_cop)) ? Math.max(0, Number(savedRates.minimum_cop)) : defaults.rates.minimum_cop,
    km_1_to_1_9_cop: Number.isFinite(Number(savedRates.km_1_to_1_9_cop)) ? Math.max(0, Number(savedRates.km_1_to_1_9_cop)) : defaults.rates.km_1_to_1_9_cop,
    km_2_cop: Number.isFinite(Number(savedRates.km_2_cop)) ? Math.max(0, Number(savedRates.km_2_cop)) : defaults.rates.km_2_cop,
    extra_km_cop: Number.isFinite(Number(savedRates.extra_km_cop)) ? Math.max(0, Number(savedRates.extra_km_cop)) : defaults.rates.extra_km_cop,
    tiers,
    cop_per_usd: Number.isFinite(Number(savedRates.cop_per_usd))
      ? Math.max(0.01, Number(savedRates.cop_per_usd))
      : Number.isFinite(Number(savedRates.usd_cop)) ? Math.max(0.01, Number(savedRates.usd_cop)) : defaults.rates.cop_per_usd,
    cop_per_bs: Number.isFinite(Number(savedRates.cop_per_bs))
      ? Math.max(0.01, Number(savedRates.cop_per_bs))
      : Number.isFinite(Number(savedRates.cop_bs)) ? Math.max(0.01, Number(savedRates.cop_bs)) : defaults.rates.cop_per_bs,
  };
  normalized.monthlyGoal = Number.isFinite(Number(source.monthlyGoal))
    ? Math.max(0, Number(source.monthlyGoal)) : defaults.monthlyGoal;
  const savedSplit = source.profitSplit && typeof source.profitSplit === 'object' ? source.profitSplit : {};
  const hasMineSplit = Number.isFinite(Number(savedSplit.mine));
  const hasBikeSplit = Number.isFinite(Number(savedSplit.bike));
  const splitMine = hasMineSplit ? Math.max(0, Math.min(100, Number(savedSplit.mine)))
    : hasBikeSplit ? 100 - Math.max(0, Math.min(100, Number(savedSplit.bike))) : defaults.profitSplit.mine;
  const splitBike = hasBikeSplit ? Math.max(0, Math.min(100, Number(savedSplit.bike)))
    : hasMineSplit ? 100 - Math.max(0, Math.min(100, Number(savedSplit.mine))) : defaults.profitSplit.bike;
  const splitTotal = splitMine + splitBike;
  const normalizedMine = splitTotal > 0 ? Math.round(splitMine / splitTotal * 10000) / 100 : defaults.profitSplit.mine;
  normalized.profitSplit = { mine: normalizedMine, bike: Math.round((100 - normalizedMine) * 100) / 100 };
  normalized.motoPayments = Array.isArray(source.motoPayments)
    ? source.motoPayments.filter(payment => payment && Number.isFinite(Number(payment.monto)) && Number(payment.monto) > 0)
      .map(payment => ({
        fecha: String(payment.fecha || ''),
        monto: Number(payment.monto),
        nota: String(payment.nota || ''),
      }))
    : [];
  normalized.salaryPayments = Array.isArray(source.salaryPayments)
    ? source.salaryPayments.filter(payment => payment && Number.isFinite(Number(payment.monto)) && Number(payment.monto) > 0)
      .map(payment => ({
        fecha: String(payment.fecha || ''),
        monto: Number(payment.monto),
        nota: String(payment.nota || ''),
      }))
    : [];
  normalized.businesses = Array.isArray(source.businesses) ? source.businesses : [];
  normalized.bases = Array.isArray(source.bases) ? source.bases : [];
  normalized.searchRegion = Object.prototype.hasOwnProperty.call(SEARCH_REGIONS, source.searchRegion)
    ? source.searchRegion : DEFAULT_SEARCH_REGION;
  normalized.customCountryCodes = typeof source.customCountryCodes === 'string' ? source.customCountryCodes : '';
  return normalized;
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

const storedSettings = readJson(STORAGE.settings, {});
const settings = normalizeSettings(storedSettings);
let history = readJson(STORAGE.history, []);
if (!Array.isArray(history)) history = [];
let frequentPlaces = readJson(STORAGE.frequent, []);
if (!Array.isArray(frequentPlaces)) frequentPlaces = [];
let pendingSettings = cloneData(settings);
let pendingFrequentPlaces = cloneData(frequentPlaces);
let editingPoint = null;
let editingFrequentPlace = null;
let pendingPlaceDraft = null;
let currentView = 'calculator';
let sidebarOpen = false;
let mode = 'delivery';
let selectedOrigin = null;
let routeResult = null;
let originMethod = 'database';
const currentDate = new Date();
let selectedHistoryMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
let selectedHistoryWeek = historyWeekKey(currentDate);
let historyWeekManuallySelected = false;
let observedCurrentWorkWeek = historyWeekKey(currentDate);
let historyChartPeriod = 'daily';
let visibleHistoryRecords = [];
let selectedHistoryIds = new Set();
let appConfirmResolver = null;
let appConfirmReturnFocus = null;
let toastTimeout;
let firebaseApp = null;
let firebaseMessaging = null;
let firebaseMessagingApi = null;
let firebaseMessagingListenerReady = false;
let firebaseServiceWorkerRegistration = null;
let firebaseServiceWorkerRegistrationPromise = null;
let firebaseAuth = null;
let firebaseAuthApi = null;
let authenticatedUser = null;
let firebaseDatabase = null;
let firebaseConnected = false;
let firebaseConnectionUnsubscribe = null;
let firebaseInitialized = false;
let firebaseLoadInProgress = false;
let firebaseSyncInProgress = false;
let firebaseSyncQueued = false;
let firebaseInitInProgress = false;
let firebaseHistoryClearedDuringLoad = false;
let firebaseDeletedHistoryKeysDuringLoad = new Set();
const firebaseDirtyDuringLoad = new Set();
const reversedPlaces = new Set();
let reverseLookupBusy = false;
let lastReverseLookupAt = 0;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Helper defensivo: evita que falle todo el módulo si falta un elemento en el HTML.
function on(selector, event, handler, options) {
  const el = typeof selector === 'string' ? $(selector) : selector;
  if (!el) {
    console.warn(`[UI] No se encontró el elemento para el evento "${event}":`, selector);
    return null;
  }
  el.addEventListener(event, handler, options);
  return el;
}
function setText(selector, text) {
  const el = typeof selector === 'string' ? $(selector) : selector;
  if (el) el.textContent = text;
  return el;
}

function saveSettings() {
  localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
}
function saveHistory() {
  localStorage.setItem(STORAGE.history, JSON.stringify(history));
  queueFirebaseSync(['historial']);
}
function saveFrequent() {
  localStorage.setItem(STORAGE.frequent, JSON.stringify(frequentPlaces));
}
function showToast(message, target = $('#toast')) {
  if (!target) return;
  target.textContent = message;
  target.classList.add('is-visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => target.classList.remove('is-visible'), 2700);
}
function showAppConfirm({
  title = 'Confirmación',
  message,
  acceptLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  paymentForm = null,
  icon = '✓',
}) {
  if (appConfirmResolver) appConfirmResolver(false);
  const modal = $('#app-confirm-modal');
  if (!modal) return Promise.resolve(false);
  setText('#app-confirm-title', title);
  setText('#app-confirm-message', message);
  setText('#app-confirm-accept', acceptLabel);
  setText('#app-confirm-cancel', cancelLabel);
  const orb = $('.app-confirm-orb');
  if (orb) orb.textContent = icon;
  const fields = $('#app-confirm-fields');
  if (fields) fields.hidden = !paymentForm;
  const error = $('#app-confirm-error');
  if (error) {
    error.hidden = true;
    error.textContent = '';
  }
  if (paymentForm) {
    const amount = $('#app-confirm-amount');
    const note = $('#app-confirm-note');
    if (amount) amount.value = String(paymentForm.amount);
    if (note) note.value = '';
  }
  appConfirmReturnFocus = document.activeElement;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  return new Promise(resolve => {
    appConfirmResolver = resolve;
    requestAnimationFrame(() => {
      const focus = paymentForm ? $('#app-confirm-amount') : $('#app-confirm-accept');
      focus?.focus?.();
    });
  });
}
function closeAppConfirm(accepted = false) {
  const modal = $('#app-confirm-modal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  const resolve = appConfirmResolver;
  appConfirmResolver = null;
  appConfirmReturnFocus?.focus?.();
  appConfirmReturnFocus = null;
  resolve?.(accepted);
}
on('#app-confirm-accept', 'click', () => {
  const fields = $('#app-confirm-fields');
  if (fields && !fields.hidden) {
    const amountInput = $('#app-confirm-amount');
    const amount = Number(amountInput?.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      const error = $('#app-confirm-error');
      if (error) {
        error.textContent = 'Ingresa un monto válido mayor que cero.';
        error.hidden = false;
      }
      amountInput?.focus();
      return;
    }
    closeAppConfirm({
      amount: Math.round(amount),
      note: $('#app-confirm-note')?.value.trim() || '',
    });
    return;
  }
  closeAppConfirm(true);
});
on('#app-confirm-cancel', 'click', () => closeAppConfirm(false));
on('#app-confirm-modal', 'click', event => {
  if (event.target.id === 'app-confirm-modal') closeAppConfirm(false);
});
document.addEventListener('keydown', event => {
  const modal = $('#app-confirm-modal');
  if (event.key === 'Escape' && modal && !modal.hidden) closeAppConfirm(false);
});

function setConnectionStatus(status, label, title = label) {
  const badge = $('#connection-status');
  if (badge) {
    badge.className = `connection-status is-${status}`;
    badge.title = title;
  }
  setText('#connection-label', label);
}

function makeFirebasePayload() {
  return {
    settings: cloneData(settings),
    negocios: cloneData(settings.businesses),
    puntosBase: cloneData(settings.bases),
    lugaresFrecuentes: cloneData(frequentPlaces),
    historial: cloneData(history),
  };
}

function saveCloudDataLocally(data) {
  const sourceSettings = data.settings && typeof data.settings === 'object'
    ? { ...settings, ...data.settings, rates: { ...settings.rates, ...(data.settings.rates || {}) } }
    : settings;
  const remoteSettings = normalizeSettings(sourceSettings);
  remoteSettings.businesses = Array.isArray(data.negocios) ? data.negocios
    : Array.isArray(sourceSettings.businesses) ? sourceSettings.businesses : settings.businesses;
  remoteSettings.bases = Array.isArray(data.puntosBase) ? data.puntosBase
    : Array.isArray(sourceSettings.bases) ? sourceSettings.bases : settings.bases;
  Object.keys(settings).forEach(key => delete settings[key]);
  Object.assign(settings, remoteSettings);
  frequentPlaces = Array.isArray(data.lugaresFrecuentes) ? data.lugaresFrecuentes : frequentPlaces;
  history = Array.isArray(data.historial) ? data.historial : history;
  localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
  localStorage.setItem(STORAGE.frequent, JSON.stringify(frequentPlaces));
  localStorage.setItem(STORAGE.history, JSON.stringify(history));
  pendingSettings = cloneData(settings);
  pendingFrequentPlaces = cloneData(frequentPlaces);
  if (selectedOrigin?.isCustomOrigin) {
    // Un origen temporal no forma parte de las listas sincronizadas.
  } else if (selectedOrigin?.id && selectedOrigin.id !== 'current-location') {
    const savedOrigin = [...settings.businesses, ...settings.bases].find(point => point.id === selectedOrigin.id);
    selectedOrigin = savedOrigin ? { ...selectedOrigin, ...savedOrigin } : null;
  }
  if (!selectedOrigin) {
    routeResult = null;
    const placeholder = $('#fare-placeholder');
    const result = $('#fare-result');
    if (placeholder) placeholder.hidden = false;
    if (result) result.hidden = true;
  }
  renderOriginButtons();
  renderFrequentPlaces();
  renderHistory();
  renderSidebar();
  renderSettings();
  updateSaveButtons();
}

async function loadFirebaseData() {
  if (!authenticatedUser || !firebaseDatabase || firebaseLoadInProgress) return;
  firebaseLoadInProgress = true;
  setConnectionStatus('connecting', 'Conectando…');
  try {
    const { get, ref } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js');
    const snapshot = await get(ref(firebaseDatabase, 'rutalista'));
    if (!authenticatedUser) return;
    const cloudData = snapshot.val();
    if (snapshot.exists() && cloudData && Object.keys(cloudData).length) {
      if (firebaseDirtyDuringLoad.size) {
        const mergedData = { ...cloudData };
        if (firebaseDirtyDuringLoad.has('settings')) {
          const mergedSettings = normalizeSettings(cloudData.settings || {});
          const localSettings = cloneData(settings);
          if (!firebaseDirtyDuringLoad.has('negocios')) localSettings.businesses = mergedSettings.businesses;
          if (!firebaseDirtyDuringLoad.has('puntosBase')) localSettings.bases = mergedSettings.bases;
          mergedData.settings = localSettings;
        }
        if (firebaseDirtyDuringLoad.has('negocios')) {
          mergedData.negocios = cloneData(settings.businesses);
        }
        if (firebaseDirtyDuringLoad.has('puntosBase')) {
          mergedData.puntosBase = cloneData(settings.bases);
        }
        if (firebaseDirtyDuringLoad.has('lugaresFrecuentes')) {
          mergedData.lugaresFrecuentes = cloneData(frequentPlaces);
        }
        if (firebaseDirtyDuringLoad.has('historial')) {
          if (firebaseHistoryClearedDuringLoad) {
            mergedData.historial = [];
            firebaseHistoryClearedDuringLoad = false;
            firebaseDeletedHistoryKeysDuringLoad.clear();
          } else {
            const mergedHistory = new Map();
            [...(Array.isArray(cloudData.historial) ? cloudData.historial : []), ...history]
              .forEach(item => {
                if (!firebaseDeletedHistoryKeysDuringLoad.has(historySyncKey(item))) {
                  mergedHistory.set(item.id || historySyncKey(item), item);
                }
              });
            mergedData.historial = [...mergedHistory.values()]
              .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
              .slice(0, 250);
            firebaseDeletedHistoryKeysDuringLoad.clear();
          }
        }
        saveCloudDataLocally(mergedData);
        firebaseSyncQueued = true;
      } else {
        saveCloudDataLocally(cloudData);
        firebaseSyncQueued = false;
      }
      firebaseDirtyDuringLoad.clear();
    } else {
      firebaseHistoryClearedDuringLoad = false;
      firebaseSyncQueued = true;
      await syncFirebaseData();
    }
    firebaseInitialized = true;
    if (firebaseSyncQueued) await syncFirebaseData();
    else setConnectionStatus('synced', 'Sincronizado');
  } catch (error) {
    firebaseSyncQueued = true;
    setConnectionStatus(navigator.onLine ? 'error' : 'offline', navigator.onLine ? 'Error nube' : 'Sin conexión',
      error?.message || 'No se pudieron cargar los datos de Firebase');
  } finally {
    firebaseLoadInProgress = false;
  }
}

async function syncFirebaseData() {
  if (!authenticatedUser || !firebaseDatabase) return false;
  firebaseSyncQueued = true;
  if (!navigator.onLine || !firebaseConnected) {
    setConnectionStatus('offline', 'Sin conexión');
    return false;
  }
  if (firebaseSyncInProgress) return false;
  firebaseSyncInProgress = true;
  firebaseSyncQueued = false;
  setConnectionStatus('syncing', 'Sincronizando…');
  let syncSucceeded = false;
  try {
    const { ref, set } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js');
    if (!authenticatedUser || !firebaseDatabase) return false;
    await set(ref(firebaseDatabase, 'rutalista'), makeFirebasePayload());
    syncSucceeded = true;
    setConnectionStatus('synced', 'Sincronizado');
    return true;
  } catch (error) {
    firebaseSyncQueued = true;
    setConnectionStatus(navigator.onLine ? 'error' : 'offline', navigator.onLine ? 'Error nube' : 'Sin conexión',
      error?.message || 'No se pudieron guardar los datos en Firebase');
    return false;
  } finally {
    firebaseSyncInProgress = false;
    if (syncSucceeded && firebaseSyncQueued && firebaseConnected && firebaseInitialized) {
      queueMicrotask(() => syncFirebaseData());
    }
  }
}

function queueFirebaseSync(changedAreas = []) {
  if (!authenticatedUser || !isFirebaseConfigured()) return;
  firebaseSyncQueued = true;
  if (!firebaseInitialized) changedAreas.forEach(area => firebaseDirtyDuringLoad.add(area));
  if (!firebaseDatabase) return;
  if (firebaseInitialized) syncFirebaseData();
}

async function initFirebase() {
  if (!authenticatedUser) return;
  if (!isFirebaseConfigured()) {
    setConnectionStatus('unconfigured', 'Sin nube', 'Configura Firebase en firebase-config.js para sincronizar');
    return;
  }
  if (firebaseDatabase || firebaseInitInProgress) return;
  firebaseInitInProgress = true;
  setConnectionStatus('connecting', 'Conectando…');
  try {
    const [{ initializeApp, getApps }, { getDatabase, onValue, ref }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js'),
    ]);
    firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    if (!authenticatedUser) return;
    firebaseDatabase = getDatabase(firebaseApp);
    firebaseConnectionUnsubscribe = onValue(ref(firebaseDatabase, '.info/connected'), snapshot => {
      if (!authenticatedUser) return;
      firebaseConnected = snapshot.val() === true;
      if (!firebaseConnected) {
        setConnectionStatus('offline', 'Sin conexión');
      } else if (!firebaseInitialized) {
        loadFirebaseData();
      } else if (firebaseSyncQueued) {
        syncFirebaseData();
      } else {
        setConnectionStatus('synced', 'Sincronizado');
      }
    });
    if ('Notification' in window && Notification.permission === 'granted') {
      initFirebaseMessaging();
    }
    await loadFirebaseData();
  } catch (error) {
    firebaseSyncQueued = true;
    setConnectionStatus(navigator.onLine ? 'error' : 'offline', navigator.onLine ? 'Error nube' : 'Sin conexión',
      error?.message || 'No se pudo iniciar Firebase');
  } finally {
    firebaseInitInProgress = false;
  }
}

function setMessagingButtonState(label, disabled = false, title = '') {
  const button = $('#enable-notifications-button');
  if (!button) return;
  button.disabled = disabled;
  const span = button.querySelector('span');
  if (span) span.textContent = label;
  button.title = title || label;
}

async function initFirebaseMessaging({ requestPermission = false } = {}) {
  if (!firebaseApp || !authenticatedUser) {
    console.warn('[FCM] No se puede solicitar el token: falta la sesión de Firebase.');
    return null;
  }
  if (!('Notification' in window)) {
    console.error('[FCM] Este navegador no admite notificaciones.');
    setMessagingButtonState('No disponible', false, 'Este navegador no admite notificaciones');
    return null;
  }
  if (!('serviceWorker' in navigator)) {
    console.error('[FCM] Este navegador no admite Service Workers.');
    setMessagingButtonState('No disponible', false, 'Este navegador no admite Service Workers');
    return null;
  }
  if (!window.isSecureContext) {
    console.error('[FCM] Las notificaciones requieren HTTPS o localhost.');
    setMessagingButtonState('Requiere HTTPS', false, 'Abre la app en HTTPS para obtener el token');
    return null;
  }

  try {
    if (requestPermission && Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setMessagingButtonState(
          permission === 'denied' ? 'Permiso bloqueado' : 'Activar notificaciones',
          false,
          permission === 'denied'
            ? 'Permite las notificaciones desde los ajustes del navegador'
            : 'Se necesita permiso para obtener el token',
        );
        return null;
      }
    } else if (Notification.permission !== 'granted') {
      setMessagingButtonState('Activar notificaciones');
      return null;
    }

    const [{ getMessaging, getToken, onMessage }, registration] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js'),
      firebaseServiceWorkerRegistrationPromise || navigator.serviceWorker.ready,
    ]);
    firebaseServiceWorkerRegistration = registration;
    firebaseMessaging = getMessaging(firebaseApp);
    firebaseMessagingApi = { getToken, onMessage };

    if (!firebaseMessagingApi || !firebaseMessaging) {
      console.error('[FCM] No se pudo inicializar la API de mensajería. Revisa los errores de red.');
      setMessagingButtonState('Error de red', false, 'Revisa la consola para más detalles');
      return null;
    }

    const token = await getToken(firebaseMessaging, {
      vapidKey: firebaseVapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      console.error('[FCM] Firebase devolvió un token vacío.');
      setMessagingButtonState('Reintentar notificaciones', false, 'Firebase no devolvió un token');
      return null;
    }

    console.info('[FCM] TOKEN FCM:', token);
    setMessagingButtonState('Notificaciones activas', false, 'Token FCM obtenido');

    if (authenticatedUser) {
      try {
        const { getDatabase, ref, set } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js');
        firebaseDatabase ||= getDatabase(firebaseApp);
        await set(ref(firebaseDatabase, `tokens/${authenticatedUser.uid}`), {
          token,
          lastUpdated: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[FCM] Se obtuvo el token, pero no se pudo guardar en Realtime Database:', error);
      }
    }

    if (!firebaseMessagingListenerReady) {
      firebaseMessagingApi.onMessage(firebaseMessaging, payload => {
        const title = payload.notification?.title || 'Nueva notificación';
        const body = payload.notification?.body || '';
        showToast(body ? `🔔 ${title}: ${body}` : `🔔 ${title}`);
      });
      firebaseMessagingListenerReady = true;
    }
    return token;
  } catch (error) {
    console.error('[FCM] Error al obtener el token:', error);
    setMessagingButtonState('Error; reintentar', false, error?.message || 'No se pudo obtener el token');
    return null;
  }
}

on('#enable-notifications-button', 'click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  setMessagingButtonState('Conectando…', true);
  await initFirebaseMessaging({ requestPermission: true });
  if (button.disabled) setMessagingButtonState('Activar notificaciones');
});

function showLoginScreen(message = '') {
  const appShell = $('#app-shell');
  const authScreen = $('#auth-screen');
  const authChecking = $('#auth-checking');
  const loginForm = $('#login-form');
  const loginError = $('#login-error');
  const logoutButton = $('#logout-button');
  if (appShell) appShell.hidden = true;
  if (authScreen) authScreen.hidden = false;
  if (authChecking) authChecking.hidden = true;
  if (loginForm) loginForm.hidden = false;
  if (loginError) {
    loginError.textContent = message;
    loginError.hidden = !message;
  }
  if (logoutButton) logoutButton.hidden = true;
}

function getLoginErrorMessage(error) {
  switch (error?.code) {
    case 'auth/invalid-email':
      return 'Escribe un correo electrónico válido.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'El correo o la contraseña no son correctos.';
    case 'auth/too-many-requests':
      return 'Hubo demasiados intentos. Espera un momento y vuelve a intentarlo.';
    case 'auth/network-request-failed':
      return 'No hay conexión. Revisa Internet e inténtalo de nuevo.';
    case 'auth/operation-not-allowed':
      return 'El acceso por correo y contraseña no está activado en Firebase.';
    case 'auth/unauthorized-domain':
      return 'Este dominio de la app no está autorizado en Firebase Authentication.';
    default:
      return 'No se pudo iniciar sesión. Verifica tus datos e inténtalo de nuevo.';
  }
}

on('#login-form', 'submit', async event => {
  event.preventDefault();
  if (!firebaseAuth || !firebaseAuthApi) {
    showLoginScreen('No se pudo conectar con Firebase Authentication.');
    return;
  }
  const submitButton = $('#login-submit');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Iniciando sesión…';
  }
  const errorBox = $('#login-error');
  if (errorBox) errorBox.hidden = true;
  try {
    await firebaseAuthApi.signInWithEmailAndPassword(
      firebaseAuth,
      $('#login-email')?.value.trim() || '',
      $('#login-password')?.value || '',
    );
    const pwd = $('#login-password');
    if (pwd) pwd.value = '';
  } catch (error) {
    if (errorBox) {
      errorBox.textContent = getLoginErrorMessage(error);
      errorBox.hidden = false;
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Iniciar sesión';
    }
  }
});

on('#logout-button', 'click', async event => {
  const button = event.currentTarget;
  if (!firebaseAuth || !firebaseAuthApi) return;
  button.disabled = true;
  try {
    await firebaseAuthApi.signOut(firebaseAuth);
  } catch {
    showToast('No se pudo cerrar la sesión.');
  } finally {
    button.disabled = false;
  }
});

async function initFirebaseAuthentication() {
  if (!isFirebaseConfigured()) {
    showLoginScreen('Firebase no está configurado para iniciar sesión.');
    return;
  }
  try {
    const [{ initializeApp, getApps }, {
      getAuth,
      onAuthStateChanged,
      signInWithEmailAndPassword,
      signOut,
    }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
    ]);
    firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    firebaseAuth = getAuth(firebaseApp);
    firebaseAuthApi = { onAuthStateChanged, signInWithEmailAndPassword, signOut };
    onAuthStateChanged(firebaseAuth, user => {
      const wasAuthenticated = Boolean(authenticatedUser);
      authenticatedUser = user;
      if (user) {
        const authScreen = $('#auth-screen');
        const appShell = $('#app-shell');
        const logoutButton = $('#logout-button');
        const loginForm = $('#login-form');
        if (authScreen) authScreen.hidden = true;
        if (appShell) appShell.hidden = false;
        if (logoutButton) logoutButton.hidden = false;
        loginForm?.reset?.();
        saveSettings();
        initFirebase();
        return;
      }
      if (wasAuthenticated) {
        firebaseConnectionUnsubscribe?.();
        firebaseConnectionUnsubscribe = null;
        firebaseDatabase = null;
        firebaseConnected = false;
        firebaseInitialized = false;
      }
      showLoginScreen();
    }, error => {
      showLoginScreen(getLoginErrorMessage(error));
    });
  } catch (error) {
    console.error('[Auth] Error al inicializar Firebase Authentication:', error);
    showLoginScreen('No se pudo conectar con Firebase Authentication. Revisa tu conexión.');
  }
}

window.addEventListener('online', () => {
  if (!authenticatedUser) return;
  if (!firebaseDatabase) {
    initFirebase();
    return;
  }
  if (!firebaseInitialized) loadFirebaseData();
  else if (firebaseSyncQueued) syncFirebaseData();
});
window.addEventListener('offline', () => {
  if (authenticatedUser && firebaseDatabase) setConnectionStatus('offline', 'Sin conexión');
});

function hasPendingChanges() {
  const settingsCore = value => {
    const core = cloneData(value);
    delete core.businesses;
    delete core.bases;
    return core;
  };
  return JSON.stringify(settingsCore(pendingSettings)) !== JSON.stringify(settingsCore(settings));
}
function updateSaveButtons() {
  const dirty = hasPendingChanges();
  $$('[data-save-changes], [data-cancel-changes]').forEach(button => {
    button.disabled = !dirty;
  });
  $('#data-sidebar')?.classList.toggle('has-unsaved', dirty);
}
function discardPendingChanges() {
  pendingSettings = cloneData(settings);
  pendingFrequentPlaces = cloneData(frequentPlaces);
  editingPoint = null;
  editingFrequentPlace = null;
  pendingPlaceDraft = null;
  ['sidebar-add-business-form', 'sidebar-add-base-form', 'sidebar-add-place-form'].forEach(id => {
    const form = document.getElementById(id);
    if (!form) return;
    form.reset();
    form.hidden = true;
  });
  clearPlaceAddFeedback();
  renderSidebar();
  renderSettings();
  renderFrequentPlaces();
  updateSaveButtons();
}
function savePendingChanges() {
  if (!hasPendingChanges()) return;
  const settingsCore = value => {
    const core = cloneData(value);
    delete core.businesses;
    delete core.bases;
    return core;
  };
  const changedAreas = JSON.stringify(settingsCore(pendingSettings)) !== JSON.stringify(settingsCore(settings))
    ? ['settings'] : [];
  const wasSelected = selectedOrigin;
  const nextSettings = cloneData(pendingSettings);
  nextSettings.businesses = cloneData(settings.businesses);
  nextSettings.bases = cloneData(settings.bases);
  Object.keys(settings).forEach(key => delete settings[key]);
  Object.assign(settings, nextSettings);
  saveSettings();
  if (changedAreas.length) queueFirebaseSync(changedAreas);
  if (wasSelected?.id && wasSelected.id !== 'current-location') {
    if (wasSelected.isCustomOrigin) {
      selectedOrigin = wasSelected;
    } else {
      const updatedOrigin = [...settings.businesses, ...settings.bases].find(point => point.id === wasSelected.id);
      if (updatedOrigin) selectedOrigin = { ...wasSelected, ...updatedOrigin };
      else {
        selectedOrigin = null;
        routeResult = null;
        const placeholder = $('#fare-placeholder');
        const result = $('#fare-result');
        if (placeholder) placeholder.hidden = false;
        if (result) result.hidden = true;
      }
    }
  }
  pendingSettings = cloneData(settings);
  editingPoint = null;
  renderOriginButtons();
  renderFrequentPlaces();
  renderSidebar();
  renderSettings();
  updateSaveButtons();
  showToast('Ajustes guardados');
}

const themeStorageKey = 'rutalista-theme';
const themePreference = window.matchMedia('(prefers-color-scheme: dark)');
let theme = ['light', 'dark'].includes(localStorage.getItem(themeStorageKey))
  ? localStorage.getItem(themeStorageKey)
  : (themePreference.matches ? 'dark' : 'light');
function applyTheme(nextTheme) {
  theme = nextTheme;
  document.documentElement.setAttribute('data-theme', theme);
  setText('#theme-icon', theme === 'dark' ? '☀️' : '🌙');
  const toggle = $('#theme-toggle');
  if (toggle) toggle.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  setText('#settings-theme-toggle', theme === 'dark' ? '☀️ Cambiar a modo claro' : '🌙 Cambiar a modo oscuro');
}
applyTheme(theme);
on('#theme-toggle', 'click', () => {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(themeStorageKey, nextTheme);
  applyTheme(nextTheme);
});
on('#settings-theme-toggle', 'click', () => $('#theme-toggle')?.click());
themePreference.addEventListener?.('change', event => {
  if (!['light', 'dark'].includes(localStorage.getItem(themeStorageKey))) {
    applyTheme(event.matches ? 'dark' : 'light');
  }
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function validPoint(point) {
  return point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng));
}
function frequentPlaceName(place) {
  return String(place?.nombre || place?.name || place?.input || place?.link || '');
}
function frequentPlacePerson(place) {
  return String(place?.persona || place?.person || '').trim();
}
function frequentPlaceLink(place) {
  if (place?.link || place?.input) return String(place.link || place.input);
  return validPoint(place) ? `${Number(place.lat)}, ${Number(place.lng)}` : '';
}
function makeFrequentPlace(name, link, coords, existing = {}, person = undefined) {
  const savedLink = String(link || `${Number(coords.lat)}, ${Number(coords.lng)}`);
  const candidateAddress = String(coords.locationLabel || coords.addressLabel
    || [coords.shortName, coords.context].filter(Boolean).join(', ')
    || (coords.label && coords.label !== 'Destino del mapa' ? coords.label : '')).trim();
  return {
    ...existing,
    id: existing.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    nombre: name,
    name,
    lat: Number(coords.lat),
    lng: Number(coords.lng),
    link: savedLink,
    input: savedLink,
    persona: String(person === undefined ? frequentPlacePerson(existing) : person).trim(),
    locationLabel: existing.locationLabel || (candidateAddress.toLowerCase() !== String(name).trim().toLowerCase() ? candidateAddress : ''),
    created: existing.created || new Date().toISOString(),
  };
}
function setView(name) {
  const leavingSettings = currentView === 'settings' && name !== 'settings';
  const leavingOpenSidebar = sidebarOpen && name !== currentView;
  if ((leavingSettings || leavingOpenSidebar) && hasPendingChanges()) {
    if (!window.confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')) return;
    discardPendingChanges();
  }
  currentView = name;
  const calculator = $('#calculator-view');
  const historyView = $('#history-view');
  const settingsView = $('#settings-view');
  if (calculator) calculator.hidden = name !== 'calculator';
  if (historyView) historyView.hidden = name !== 'history';
  if (settingsView) settingsView.hidden = name !== 'settings';
  if (name === 'history') renderHistory();
  if (name === 'settings') renderSettings();
  if (sidebarOpen) closeSidebar(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$$('[data-view-link]').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  setView(button.dataset.viewLink);
}));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && currentView === 'settings') setView('calculator');
});

function setMode(nextMode) {
  if (mode !== nextMode) {
    selectedOrigin = null;
    routeResult = null;
    const originInput = $('#origin-database-input');
    if (originInput) originInput.value = '';
    const originChoices = $('#origin-choices');
    if (originChoices) originChoices.hidden = true;
    const originSaveOffer = $('#origin-save-offer');
    if (originSaveOffer) originSaveOffer.hidden = true;
    const placeholder = $('#fare-placeholder');
    const result = $('#fare-result');
    if (placeholder) placeholder.hidden = false;
    if (result) result.hidden = true;
  }
  mode = nextMode;
  localStorage.setItem(STORAGE.mode, mode);
  $$('.mode-option').forEach(button => button.classList.toggle('is-active', button.dataset.mode === mode));
  setText('#origin-eyebrow', 'PUNTO DE PARTIDA');
  setText('#route-title', '¿Desde dónde sales?');
  const businessOrigins = $('#business-origins');
  if (businessOrigins) businessOrigins.hidden = true;
  setText('#fare-mode-label', 'TARIFA DELIVERY-CARRERA');
  setText('#fare-destination-label', 'Envío a');
  renderOriginButtons();
  if (routeResult) renderFare(routeResult);
}

$$('.mode-option').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));

function setOriginMethod(method) {
  if (method === 'saved') method = 'database';
  originMethod = method;
  $$('.origin-method-tab').forEach(button => {
    button.classList.toggle('is-active', button.dataset.originMethod === method);
    button.setAttribute('aria-selected', String(button.dataset.originMethod === method));
  });
  const databasePanel = $('#origin-database-panel');
  const manualPanel = $('#origin-manual-panel');
  if (databasePanel) databasePanel.hidden = method !== 'database';
  if (manualPanel) manualPanel.hidden = method !== 'manual';
  if (method === 'manual') {
    const saveOffer = $('#origin-save-offer');
    if (saveOffer) saveOffer.hidden = true;
    const results = $('#origin-database-results');
    if (results) results.hidden = true;
    const choices = $('#origin-choices');
    if (choices) choices.hidden = true;
  } else {
    renderOriginDatabaseResults();
  }
  refreshRouteRegistrationButton();
}
$$('.origin-method-tab').forEach(button => {
  button.addEventListener('click', () => setOriginMethod(button.dataset.originMethod));
});

function openSidebar() {
  sidebarOpen = true;
  $('#data-sidebar')?.classList.add('is-open');
  $('#sidebar-overlay')?.classList.add('is-visible');
  $('#data-sidebar')?.setAttribute('aria-hidden', 'false');
  $('#sidebar-overlay')?.setAttribute('aria-hidden', 'false');
  $('#sidebar-open')?.setAttribute('aria-expanded', 'true');
  renderSidebar();
  updateSaveButtons();
}
function closeSidebar(checkChanges = true) {
  if (checkChanges && hasPendingChanges()) {
    if (!window.confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')) return false;
    discardPendingChanges();
  }
  sidebarOpen = false;
  $('#data-sidebar')?.classList.remove('is-open');
  $('#sidebar-overlay')?.classList.remove('is-visible');
  $('#data-sidebar')?.setAttribute('aria-hidden', 'true');
  $('#sidebar-overlay')?.setAttribute('aria-hidden', 'true');
  $('#sidebar-open')?.setAttribute('aria-expanded', 'false');
  return true;
}
on('#sidebar-open', 'click', openSidebar);
on('#sidebar-close', 'click', () => closeSidebar());
on('#sidebar-overlay', 'click', () => closeSidebar());

function renderOriginButtons() {
  const list = $('#business-origins');
  if (!list) return;
  const points = settings.businesses.filter(validPoint);
  list.innerHTML = '';
  points.forEach(point => {
    if (!validPoint(point)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `origin-card${selectedOrigin?.id === point.id ? ' is-selected' : ''}`;
    button.innerHTML = `<span class="origin-icon">${mode === 'delivery' ? '⌂' : '⌖'}</span><span class="origin-copy"><strong>${escapeHtml(point.name)}</strong><small>${Number(point.lat).toFixed(4)}, ${Number(point.lng).toFixed(4)}</small></span><span class="origin-arrow">↗</span>`;
    button.addEventListener('click', () => {
      setOriginMethod('database');
      selectedOrigin = { ...point, kind: mode };
      const input = $('#origin-database-input');
      if (input) input.value = point.name;
      const choices = $('#origin-choices');
      if (choices) {
        choices.hidden = true;
        choices.replaceChildren();
      }
      const originSaveOffer = $('#origin-save-offer');
      if (originSaveOffer) originSaveOffer.hidden = true;
      const destinationSaveOffer = $('#destination-save-offer');
      if (destinationSaveOffer) destinationSaveOffer.hidden = true;
      renderOriginButtons();
      if (routeResult && !routeResult.manualDistance) calculateRoute();
    });
    list.append(button);
  });
  const currentBtn = $('#use-current-origin');
  if (currentBtn) currentBtn.classList.toggle('is-selected', selectedOrigin?.id === 'current-location');
  const selectionPreview = $('#origin-selected-preview');
  if (selectionPreview) {
    if (selectedOrigin) {
      const span = selectionPreview.querySelector('span');
      if (span) span.textContent = `Origen seleccionado: ${selectedOrigin.name}`;
      selectionPreview.hidden = false;
    } else {
      selectionPreview.hidden = true;
    }
  }
  renderOriginDatabaseResults();
  const placeWithoutAddress = getOriginDatabaseRecords()
    .find(point => point.recordKind === 'Lugar frecuente' && !point.locationLabel)
    || getOriginDatabaseRecords().find(point => !point.locationLabel);
  if (placeWithoutAddress) enrichFrequentPlaceAddress(placeWithoutAddress);
  refreshRouteRegistrationButton();
}

function getOriginDatabaseRecords() {
  const businesses = settings.businesses
    .filter(validPoint)
    .map(point => ({
      ...point,
      locationLabel: point.locationLabel || point.addressLabel || point.address || point.direccion || '',
      recordKind: 'Negocio',
    }));
  const favoriteMap = new Map();
  [...frequentPlaces, ...pendingFrequentPlaces].filter(validPoint).forEach(place => {
    const key = place.id || `${frequentPlaceName(place)}|${Number(place.lat)},${Number(place.lng)}`;
    const link = frequentPlaceLink(place);
    const addressFromSavedLink = addressFromLink(link);
    const linkAddress = !parseCoordinates(addressFromSavedLink)
      && !/^https?:\/\//i.test(addressFromSavedLink)
      && normalizeOriginSearch(addressFromSavedLink) !== normalizeOriginSearch(frequentPlaceName(place))
      ? addressFromSavedLink : '';
    const locationLabel = place.locationLabel || place.addressLabel || place.address || place.direccion || linkAddress;
    if (!favoriteMap.has(key)) {
      favoriteMap.set(key, {
        ...place,
        name: frequentPlaceName(place),
        lat: Number(place.lat),
        lng: Number(place.lng),
        locationLabel,
        recordKind: 'Lugar frecuente',
        favoriteKey: key,
      });
    } else if (!favoriteMap.get(key).locationLabel && locationLabel) {
      favoriteMap.get(key).locationLabel = locationLabel;
    }
  });
  return [...businesses, ...favoriteMap.values()].filter(validPoint);
}

function selectDatabaseOrigin(point) {
  selectedOrigin = {
    ...point,
    id: point.id || `database-origin-${Date.now()}`,
    name: point.name || frequentPlaceName(point) || 'Origen guardado',
    kind: mode,
    isCustomOrigin: false,
  };
  const input = $('#origin-database-input');
  if (input) input.value = selectedOrigin.name;
  const results = $('#origin-database-results');
  if (results) {
    results.hidden = true;
    results.replaceChildren();
  }
  const choices = $('#origin-choices');
  if (choices) {
    choices.hidden = true;
    choices.replaceChildren();
  }
  const originSaveOffer = $('#origin-save-offer');
  if (originSaveOffer) originSaveOffer.hidden = true;
  renderOriginButtons();
  const destInput = $('#destination-input');
  if (routeResult && !routeResult.manualDistance && destInput?.value.trim()) calculateRoute();
}

function formatReverseLocation(result) {
  const address = result?.address || {};
  const local = address.neighbourhood || address.suburb || address.village || address.hamlet
    || address.town || address.city || address.municipality || address.county || '';
  const municipality = address.municipality || address.county || address.state_district || '';
  const region = address.state || '';
  const parts = [...new Set([local, municipality, region].filter(Boolean))];
  if (parts.length) return parts.slice(0, 3).join(', ');
  return String(result?.display_name || '').split(',').slice(1, 4).map(part => part.trim()).filter(Boolean).join(', ');
}

function normalizeOriginSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[.,;:/_+\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function enrichFrequentPlaceAddress(record) {
  const lookupKey = `${record.recordKind}:${record.favoriteKey || record.id || `${record.name}|${record.lat},${record.lng}`}`;
  if (reversedPlaces.has(lookupKey) || reverseLookupBusy) return;
  reversedPlaces.add(lookupKey);
  reverseLookupBusy = true;
  try {
    const wait = Math.max(0, 1100 - (Date.now() - lastReverseLookupAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastReverseLookupAt = Date.now();
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(record.lat),
      lon: String(record.lng),
      zoom: '16',
      addressdetails: '1',
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;
    const result = await response.json();
    const locationLabel = formatReverseLocation(result);
    if (!locationLabel) return;
    let updated = false;
    if (record.recordKind === 'Negocio') {
      for (const list of [settings.businesses, pendingSettings.businesses]) {
        const business = list.find(point => record.id
          ? point.id === record.id
          : point.name === record.name && Number(point.lat) === Number(record.lat) && Number(point.lng) === Number(record.lng));
        if (business && !business.locationLabel) {
          business.locationLabel = locationLabel;
          updated = true;
        }
      }
      if (updated) {
        saveSettings();
        queueFirebaseSync(['negocios']);
      }
    } else {
      for (const list of [frequentPlaces, pendingFrequentPlaces]) {
        list.forEach(place => {
          const samePlace = record.id
            ? place.id === record.id
            : frequentPlaceName(place) === record.name
              && Number(place.lat) === Number(record.lat)
              && Number(place.lng) === Number(record.lng);
          if (samePlace && !place.locationLabel) {
            place.locationLabel = locationLabel;
            updated = true;
          }
        });
      }
      if (updated) saveFrequent();
    }
    if (updated) {
      renderOriginDatabaseResults($('#origin-database-input')?.value);
    }
  } catch {
    // Keep showing the saved coordinates if reverse geocoding is unavailable.
  } finally {
    reverseLookupBusy = false;
    const wait = Math.max(0, 1100 - (Date.now() - lastReverseLookupAt));
    setTimeout(() => renderOriginDatabaseResults($('#origin-database-input')?.value), wait);
  }
}

function findOriginDatabaseMatches(query) {
  const normalizedQuery = normalizeOriginSearch(query);
  if (!normalizedQuery) return [];
  const matches = getOriginDatabaseRecords().filter(point => {
    const searchText = [
      point.name,
      point.locationLabel,
      frequentPlaceLink(point),
      `${point.lat}, ${point.lng}`,
    ].join(' ');
    const normalizedSearchText = normalizeOriginSearch(searchText);
    return normalizedSearchText.includes(normalizedQuery);
  });
  return matches.sort((a, b) => {
    const aName = normalizeOriginSearch(a.name);
    const bName = normalizeOriginSearch(b.name);
    const aExact = aName === normalizedQuery ? 0 : 1;
    const bExact = bName === normalizedQuery ? 0 : 1;
    const aFavorite = a.recordKind === 'Lugar frecuente';
    const bFavorite = b.recordKind === 'Lugar frecuente';
    return aExact - bExact || Number(bFavorite) - Number(aFavorite);
  }).slice(0, 8);
}

function renderOriginDatabaseResults(query = $('#origin-database-input')?.value) {
  const list = $('#origin-database-results');
  if (!list) return;
  const normalizedQuery = normalizeOriginSearch(query);
  list.replaceChildren();
  const mapButton = $('#use-origin-button');
  if (mapButton) mapButton.hidden = !normalizedQuery;
  if (!normalizedQuery) {
    list.hidden = true;
    return;
  }
  if (normalizeOriginSearch(selectedOrigin?.name) === normalizedQuery) {
    list.hidden = true;
    if (mapButton) mapButton.hidden = true;
    return;
  }
  const matches = findOriginDatabaseMatches(normalizedQuery);
  if (mapButton) {
    mapButton.innerHTML = matches.length
      ? 'Buscar también en el mapa <span>→</span>'
      : 'Buscar dirección en el mapa <span>→</span>';
  }
  matches.forEach(point => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'origin-database-option';
    const copy = document.createElement('span');
    copy.className = 'origin-database-copy';
    const name = document.createElement('strong');
    name.textContent = point.name;
    const kind = document.createElement('small');
    kind.textContent = point.recordKind;
    copy.append(name, kind);
    if (point.locationLabel) {
      const address = document.createElement('small');
      address.className = 'origin-database-address';
      address.textContent = point.locationLabel;
      address.title = point.locationLabel;
      copy.append(address);
    } else {
      const coordinates = document.createElement('small');
      coordinates.className = 'origin-database-address';
      coordinates.textContent = `${Number(point.lat).toFixed(4)}, ${Number(point.lng).toFixed(4)}`;
      copy.append(coordinates);
    }
    const star = document.createElement('span');
    star.className = 'origin-database-star';
    star.textContent = '★';
    star.setAttribute('aria-label', 'Guardado en la base de datos');
    option.append(copy, star);
    option.addEventListener('click', () => selectDatabaseOrigin(point));
    list.append(option);
  });
  list.hidden = matches.length === 0;
  const missingAddress = matches.find(point => !point.locationLabel);
  if (missingAddress) enrichFrequentPlaceAddress(missingAddress);
}
on('#origin-database-input', 'input', event => {
  const choices = $('#origin-choices');
  if (choices) {
    choices.hidden = true;
    choices.replaceChildren();
  }
  renderOriginDatabaseResults(event.target.value);
});
on('#origin-database-input', 'keydown', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const matches = findOriginDatabaseMatches(event.currentTarget.value);
  if (matches.length === 1) selectDatabaseOrigin(matches[0]);
  else if (!matches.length) useOriginInput();
});

on('#use-current-origin', 'click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  const strong = button.querySelector('strong');
  if (strong) strong.textContent = 'Buscando ubicación…';
  try {
    const coords = await getCurrentPosition();
    setOriginMethod('database');
    selectedOrigin = { id: 'current-location', name: 'Mi ubicación actual', ...coords, kind: 'carrera' };
    const input = $('#origin-database-input');
    if (input) input.value = selectedOrigin.name;
    const choices = $('#origin-choices');
    if (choices) {
      choices.hidden = true;
      choices.replaceChildren();
    }
    const originSaveOffer = $('#origin-save-offer');
    if (originSaveOffer) originSaveOffer.hidden = true;
    const destinationSaveOffer = $('#destination-save-offer');
    if (destinationSaveOffer) destinationSaveOffer.hidden = true;
    renderOriginButtons();
    if (strong) strong.textContent = 'Usar mi ubicación actual';
    if (routeResult && !routeResult.manualDistance) calculateRoute();
  } catch (error) {
    showToast(error.message);
    if (strong) strong.textContent = 'Usar mi ubicación actual';
  } finally {
    button.disabled = false;
  }
});

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este navegador no permite usar la ubicación.'));
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      error => reject(new Error(error.code === 1 ? 'Permite el acceso a tu ubicación para continuar.' : 'No se pudo obtener la ubicación. Intenta de nuevo.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

function parseCoordinates(value) {
  const text = String(value).trim();
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[#&]map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i,
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}
function addressFromLink(value) {
  try {
    const url = new URL(value);
    for (const key of ['q', 'query', 'destination', 'daddr']) {
      const found = url.searchParams.get(key);
      if (found && !parseCoordinates(found)) return found.replace(/\+/g, ' ');
    }
    const placePath = url.pathname.match(/\/place\/([^/]+)/);
    if (placePath) return decodeURIComponent(placePath[1].replace(/\+/g, ' '));
  } catch {}
  return value;
}
function getSearchRegionInfo(settingsValue = settings) {
  const customInput = String(settingsValue.customCountryCodes || '').trim();
  if (customInput) {
    const countrycodes = [...new Set(customInput.toLowerCase().split(/[\s,;]+/).filter(Boolean))];
    if (countrycodes.some(code => !/^[a-z]{2}$/.test(code))) {
      throw new Error('Usa códigos de país de dos letras separados por comas, por ejemplo: ve,co,ar.');
    }
    return {
      label: `Países personalizados (${countrycodes.map(code => code.toUpperCase()).join(', ')})`,
      countrycodes: countrycodes.join(','),
    };
  }
  return SEARCH_REGIONS[settingsValue.searchRegion] || SEARCH_REGIONS[DEFAULT_SEARCH_REGION];
}
function updateSearchRegionLabel() {
  const label = $('#search-region-label');
  if (!label) return;
  try {
    label.textContent = `Buscando en: ${getSearchRegionInfo().label}`;
  } catch {
    label.textContent = 'Buscando en: revisa los códigos personalizados';
  }
}
function formatGeocodeCandidate(result) {
  const address = result.address || {};
  const shortName = String(result.name
    || address.city
    || address.town
    || address.village
    || address.municipality
    || address.hamlet
    || address.suburb
    || String(result.display_name || '').split(',')[0]
    || 'Lugar encontrado').trim();
  const placeRegion = address.state || address.state_district || address.region || address.county || '';
  const country = address.country || '';
  const context = [...new Set([placeRegion, country].filter(part => part && part.toLowerCase() !== shortName.toLowerCase()))];
  const labelParts = [...new Set([shortName, ...context])];
  const displayName = labelParts.join(', ') || result.display_name || shortName;
  return {
    lat: Number(result.lat),
    lng: Number(result.lon),
    label: displayName,
    shortName,
    context: context.join(', ') || String(result.display_name || '').split(',').slice(1).join(',').trim(),
  };
}
async function resolveDestination(value) {
  const coords = parseCoordinates(value);
  if (coords) {
    const label = addressFromLink(value);
    return { ...coords, label: label !== value ? label : 'Destino del mapa' };
  }
  const query = addressFromLink(value);
  if (!query || /^https?:\/\//i.test(query)) throw new Error('No pude leer esta dirección. Prueba con una dirección o un enlace completo de Google Maps.');
  const region = getSearchRegionInfo();
  async function searchNominatim(searchText, useViewbox) {
    const params = new URLSearchParams({ format: 'jsonv2', q: searchText });
    if (region.countrycodes) params.set('countrycodes', region.countrycodes);
    params.set('limit', '5');
    params.set('addressdetails', '1');
    if (useViewbox && region.viewbox) params.set('viewbox', region.viewbox);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('No se pudo buscar la dirección. Revisa tu conexión e intenta de nuevo.');
    const results = await response.json();
    return Array.isArray(results) ? results : [];
  }

  let matches = await searchNominatim(query, Boolean(region.viewbox));
  if (!matches.length && region.viewbox) {
    matches = await searchNominatim(query, false);
  }

  if (!matches.length && /\btariba\b/i.test(query)) {
    for (const spelling of ['Táriba', 'Tariba']) {
      if (spelling === query) continue;
      matches = await searchNominatim(spelling, false);
      if (matches.length) break;
    }
  }

  if (!matches.length) {
    const searchedRegion = region.label === 'Venezuela (Táchira)' ? 'Táchira' : region.label;
    throw new Error(`No encontré '${query}' en ${searchedRegion}. Prueba con el nombre completo (ej: Táriba, Táchira) o cambia la región en Ajustes.`);
  }
  const candidates = matches.map(formatGeocodeCandidate).filter(result => validPoint(result));
  if (!candidates.length) {
    const searchedRegion = region.label === 'Venezuela (Táchira)' ? 'Táchira' : region.label;
    throw new Error(`No encontré '${query}' en ${searchedRegion}. Prueba con el nombre completo (ej: Táriba, Táchira) o cambia la región en Ajustes.`);
  }
  return candidates.length === 1 ? candidates[0] : { choices: candidates };
}
function haversineKm(a, b) {
  const rad = deg => deg * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
function findNearbyBusiness(point) {
  return settings.businesses.find(business => validPoint(business)
    && haversineKm(point, business) * 1000 <= 50) || null;
}
function findNearbyFrequentPlace(point, inputValue = '') {
  const normalize = value => String(value || '').trim().toLocaleLowerCase('es');
  const normalizedInput = normalize(inputValue);
  return [...frequentPlaces, ...pendingFrequentPlaces].find(place => {
    if (validPoint(place) && haversineKm(point, place) * 1000 <= 50) return true;
    return !validPoint(place)
      && normalizedInput
      && normalize(frequentPlaceLink(place)) === normalizedInput;
  }) || null;
}
function addCoordinatesToFrequentPlace(place, point) {
  if (validPoint(place)) return false;
  const matchesSamePlace = saved => saved === place
    || (place.id && saved.id === place.id)
    || (frequentPlaceLink(saved) === frequentPlaceLink(place) && frequentPlaceName(saved) === frequentPlaceName(place));
  const committedMatch = frequentPlaces.find(matchesSamePlace);
  const placeId = place.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  [...frequentPlaces, ...pendingFrequentPlaces].filter(matchesSamePlace).forEach(saved => {
    saved.id = placeId;
    saved.lat = point.lat;
    saved.lng = point.lng;
    saved.nombre = frequentPlaceName(saved);
    saved.name = saved.nombre;
    saved.link = frequentPlaceLink(saved);
    saved.input = saved.link;
    saved.created ||= new Date().toISOString();
  });
  if (committedMatch) {
    saveFrequent();
    queueFirebaseSync(['lugaresFrecuentes']);
  }
  return Boolean(committedMatch);
}
function pendingHasFrequentPlace(candidate) {
  return pendingFrequentPlaces.some(place => (candidate.id && place.id === candidate.id)
    || (frequentPlaceLink(place) === frequentPlaceLink(candidate)
      && frequentPlaceName(place) === frequentPlaceName(candidate)));
}
function removeFrequentPlace(place) {
  if (!place) return false;
  const matches = candidate => place.id
    ? candidate.id === place.id
    : frequentPlaceName(candidate) === frequentPlaceName(place)
      && frequentPlaceLink(candidate) === frequentPlaceLink(place);
  const before = frequentPlaces.length;
  frequentPlaces = frequentPlaces.filter(candidate => !matches(candidate));
  if (frequentPlaces.length === before) return false;
  pendingFrequentPlaces = cloneData(frequentPlaces);
  saveFrequent();
  queueFirebaseSync(['lugaresFrecuentes']);
  return true;
}
function prependPendingFrequentPlace(place) {
  if (pendingHasFrequentPlace(place)) return;
  if (editingFrequentPlace !== null) editingFrequentPlace++;
  pendingFrequentPlaces.unshift(cloneData(place));
  pendingFrequentPlaces = pendingFrequentPlaces.slice(0, 8);
}
async function getRoadDistance(origin, destination) {
  const pair = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${pair}?overview=false`);
    if (!response.ok) throw new Error('route unavailable');
    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('route unavailable');
    return { km: data.routes[0].distance / 1000, approximate: false };
  } catch {
    return { km: haversineKm(origin, destination), approximate: true };
  }
}

async function useOriginInput() {
  setOriginMethod('database');
  const input = $('#origin-database-input');
  if (!input) return;
  const value = input.value.trim();
  if (!value) {
    showToast('Escribe un negocio o una dirección para buscar.');
    input.focus();
    return;
  }
  const button = $('#use-origin-button');
  if (button) {
    button.disabled = true;
    button.innerHTML = 'Buscando… <span>↻</span>';
  }
  try {
    const result = await resolveDestination(value);
    if (result.choices?.length > 1) {
      showGeocodeChoices($('#origin-choices'), result.choices, candidate => selectOriginCandidate(value, candidate));
    } else {
      selectOriginCandidate(value, result.choices?.[0] || result);
    }
  } catch (error) {
    showToast(error.message || 'No se pudo buscar el origen.');
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = 'Buscar dirección en el mapa <span>→</span>';
    }
  }
}

function selectOriginCandidate(inputValue, candidate) {
  const savedBusiness = findNearbyBusiness(candidate);
  const choices = $('#origin-choices');
  if (choices) {
    choices.hidden = true;
    choices.replaceChildren();
  }
  const originSaveOffer = $('#origin-save-offer');
  if (originSaveOffer) originSaveOffer.hidden = true;
  const destinationSaveOffer = $('#destination-save-offer');
  if (destinationSaveOffer) destinationSaveOffer.hidden = true;
  if (savedBusiness) {
    selectedOrigin = { ...savedBusiness, kind: mode };
    const input = $('#origin-database-input');
    if (input) input.value = savedBusiness.name;
  } else {
    selectedOrigin = {
      id: `temporary-origin-${Date.now()}`,
      name: candidate.label,
      lat: candidate.lat,
      lng: candidate.lng,
      kind: mode,
      isCustomOrigin: true,
      sourceText: inputValue,
    };
    const input = $('#origin-database-input');
    if (input) input.value = inputValue;
  }
  renderOriginButtons();
  const destInput = $('#destination-input');
  if (routeResult && !routeResult.manualDistance && destInput?.value.trim()) calculateRoute();
}

on('#use-origin-button', 'click', useOriginInput);
on('#clear-origin-selection', 'click', () => {
  selectedOrigin = null;
  routeResult = null;
  const originInput = $('#origin-database-input');
  if (originInput) originInput.value = '';
  const results = $('#origin-database-results');
  if (results) {
    results.hidden = true;
    results.replaceChildren();
  }
  const choices = $('#origin-choices');
  if (choices) {
    choices.hidden = true;
    choices.replaceChildren();
  }
  const originSaveOffer = $('#origin-save-offer');
  if (originSaveOffer) originSaveOffer.hidden = true;
  const destinationSaveOffer = $('#destination-save-offer');
  if (destinationSaveOffer) destinationSaveOffer.hidden = true;
  const placeholder = $('#fare-placeholder');
  const result = $('#fare-result');
  if (placeholder) placeholder.hidden = false;
  if (result) result.hidden = true;
  renderOriginButtons();
});

on('#destination-input', 'input', () => {
  const choices = $('#destination-choices');
  if (choices) {
    choices.hidden = true;
    choices.replaceChildren();
  }
  const offer = $('#destination-save-offer');
  if (offer) offer.hidden = true;
  const clear = $('#clear-destination');
  if (clear) clear.hidden = !$('#destination-input')?.value;
  const save = $('#save-frequent');
  if (save) save.hidden = !$('#destination-input')?.value.trim();
  refreshRouteRegistrationButton();
});
on('#manual-distance-km', 'input', refreshRouteRegistrationButton);
on('#manual-business-select', 'change', refreshRouteRegistrationButton);
on('#clear-destination', 'click', () => {
  const input = $('#destination-input');
  if (input) input.value = '';
  const choices = $('#destination-choices');
  if (choices) {
    choices.hidden = true;
    choices.replaceChildren();
  }
  const offer = $('#destination-save-offer');
  if (offer) offer.hidden = true;
  const clear = $('#clear-destination');
  if (clear) clear.hidden = true;
  const save = $('#save-frequent');
  if (save) save.hidden = true;
  refreshRouteRegistrationButton();
  input?.focus();
});
on('#destination-input', 'keydown', event => {
  if (event.key === 'Enter') calculateRoute();
});
on('#calculate-button', 'click', calculateRoute);
on('#calculate-manual-km', 'click', calculateFareByKilometer);
on('#reset-calculation', 'click', resetCalculator);
on('#manual-distance-km', 'keydown', event => {
  if (event.key === 'Enter') calculateFareByKilometer();
});

function resetCalculator() {
  selectedOrigin = null;
  routeResult = null;
  const setVal = (sel, v) => { const el = $(sel); if (el) el.value = v; };
  const setHidden = (sel, v) => { const el = $(sel); if (el) el.hidden = v; };
  const clear = sel => { const el = $(sel); if (el) el.replaceChildren(); };
  setVal('#origin-database-input', '');
  clear('#origin-database-results');
  setHidden('#origin-database-results', true);
  clear('#origin-choices');
  setHidden('#origin-choices', true);
  setHidden('#origin-save-offer', true);
  setVal('#origin-save-name', '');
  setVal('#origin-save-phone', '');
  setVal('#manual-distance-km', '');
  setVal('#manual-business-select', '');
  setVal('#destination-input', '');
  setHidden('#clear-destination', true);
  setHidden('#save-frequent', true);
  clear('#destination-choices');
  setHidden('#destination-choices', true);
  setHidden('#destination-save-offer', true);
  setVal('#destination-save-name', '');
  setVal('#destination-save-person', '');
  const calcBtn = $('#calculate-button');
  if (calcBtn) {
    calcBtn.disabled = false;
    calcBtn.innerHTML = 'Calcular precio <span>→</span>';
  }
  setHidden('#fare-result', true);
  setHidden('#fare-placeholder', false);
  setOriginMethod('database');
  renderOriginButtons();
  showToast('Cálculo reiniciado');
}

async function calculateRoute() {
  if (originMethod === 'manual') {
    const destinationText = $('#destination-input')?.value.trim() || '';
    if (!destinationText) {
      await calculateFareByKilometer();
      return;
    }
    const requestedBusiness = settings.businesses.find(business => business.id === $('#manual-business-select')?.value);
    if (requestedBusiness) {
      if (!validPoint(requestedBusiness)) {
        showToast('Este negocio necesita latitud y longitud para calcular la ruta. Puedes ingresar el kilometraje manualmente.');
        return;
      }
      selectedOrigin = { ...requestedBusiness, kind: mode };
    }
    if (!selectedOrigin || !validPoint(selectedOrigin)) {
      showToast('Selecciona un negocio con ubicación para calcular la distancia del enlace, o ingresa los kilómetros manualmente.');
      return;
    }
  }
  const input = $('#destination-input');
  if (!input) return;
  const value = input.value.trim();
  if (!selectedOrigin || !validPoint(selectedOrigin)) {
    showToast(mode === 'delivery' ? 'Selecciona un negocio de origen.' : 'Selecciona un punto de origen.');
    return;
  }
  if (!value) {
    showToast('Escribe una dirección o pega un enlace de Google Maps.');
    input.focus();
    return;
  }
  const button = $('#calculate-button');
  const regBtn = $('#register-completed-route');
  if (regBtn) regBtn.disabled = true;
  if (button) {
    button.disabled = true;
    button.innerHTML = 'Calculando… <span>↻</span>';
  }
  let destinationResult;
  try {
    destinationResult = await resolveDestination(value);
  } catch (error) {
    showToast(error.message || 'No se pudo calcular esta ruta.');
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = 'Calcular precio <span>→</span>';
    }
    refreshRouteRegistrationButton();
  }
  if (!destinationResult) return;
  if (destinationResult.choices?.length > 1) {
    showDestinationChoices(destinationResult.choices, value);
    return;
  }
  await calculateResolvedRoute(value, destinationResult.choices?.[0] || destinationResult);
}

function fareTotalsForDistance(km, rates) {
  const distanceKm = Number(km);
  const minimum = Number(rates.minimum_cop) || 0;
  const extraKmRate = Number(rates.extra_km_cop) || 0;
  const tiers = Array.isArray(rates.tiers) && rates.tiers.length
    ? [...rates.tiers].sort((a, b) => Number(a.km) - Number(b.km))
    : defaults.rates.tiers;
  let totalCop = minimum;
  const firstTier = tiers[0];
  if (distanceKm > 1 && firstTier && distanceKm <= Number(firstTier.km)) {
    totalCop = Number(firstTier.price) || 0;
  } else if (distanceKm > 1) {
    const matchedTier = tiers.find(tier => distanceKm <= Number(tier.km));
    if (matchedTier) totalCop = Number(matchedTier.price) || 0;
    else {
      const lastTier = tiers.at(-1);
      const lastKm = Number(lastTier?.km) || 6;
      const lastPrice = Number(lastTier?.price) || 0;
      totalCop = lastPrice + Math.ceil(distanceKm - lastKm) * extraKmRate;
    }
  }
  totalCop = Math.round(totalCop);
  const totalUsd = totalCop / Math.max(Number(rates.cop_per_usd) || 0, 0.01);
  const totalBs = totalCop / Math.max(Number(rates.cop_per_bs) || 0, 0.01);
  return { totalUsd, totalCop, totalBs };
}

function profitAmountsFor(totalCop, split = settings.profitSplit) {
  const minePercent = Number(split?.mine) || 0;
  const bikePercent = Number(split?.bike) || 0;
  return {
    ganancia_mia_cop: Math.round(Number(totalCop) * minePercent / 100),
    ganancia_moto_cop: Math.round(Number(totalCop) * bikePercent / 100),
    profit_split_used: { mine: minePercent, bike: bikePercent },
  };
}

function makeCompletedRouteRecord(result) {
  const profit = profitAmountsFor(result.totalCop, result.profitSplitUsed);
  return {
    id: result.historyId,
    type: result.type,
    originName: result.origin.name,
    originLat: result.origin.lat,
    originLng: result.origin.lng,
    destination: result.destination.label,
    destinationLat: result.destination.lat ?? null,
    destinationLng: result.destination.lng ?? null,
    recipientBusinessId: result.recipientBusinessId || '',
    recipientBusinessName: result.recipientBusinessName || '',
    km: result.km,
    total: result.totalBs,
    total_usd: result.totalUsd,
    total_cop: result.totalCop,
    total_bs: result.totalBs,
    ...profit,
    rate_usd_cop: result.rates.cop_per_usd,
    rate_cop_usd: result.rates.cop_per_usd,
    rate_cop_bs: result.rates.cop_per_bs,
    createdAt: new Date().toISOString(),
  };
}

async function calculateFareByKilometer() {
  const input = $('#manual-distance-km');
  if (!input) return;
  const km = Number(input.value);
  if (!input.value.trim() || !Number.isFinite(km) || km < 0) {
    showToast('Ingresa un kilometraje válido desde cero.');
    input.focus();
    return;
  }
  const rates = { ...settings.rates };
  const totals = fareTotalsForDistance(km, rates);
  const recordId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const manualSel = $('#manual-business-select')?.value || '';
  routeResult = {
    type: mode,
    manualDistance: true,
    recipientBusinessId: manualSel,
    recipientBusinessName: settings.businesses.find(business => business.id === manualSel)?.name || '',
    origin: { id: 'manual-distance', name: 'Kilometraje manual', lat: null, lng: null },
    destination: { label: 'Kilometraje manual', input: `${km} km`, lat: null, lng: null },
    km,
    approximate: false,
    ...totals,
    rates,
    profitSplitUsed: { ...settings.profitSplit },
    originMethodUsed: originMethod,
    manualBusinessSelectionUsed: manualSel,
    historyId: recordId,
  };
  const originSaveOffer = $('#origin-save-offer');
  if (originSaveOffer) originSaveOffer.hidden = true;
  const destinationSaveOffer = $('#destination-save-offer');
  if (destinationSaveOffer) destinationSaveOffer.hidden = true;
  renderFare(routeResult);
  showToast('Precio calculado por kilometraje');
}

function showDestinationChoices(choices, inputValue) {
  showGeocodeChoices($('#destination-choices'), choices, candidate => calculateResolvedRoute(inputValue, candidate));
}

function showGeocodeChoices(list, choices, onSelect) {
  if (!list) return;
  list.replaceChildren();
  choices.forEach(candidate => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'destination-choice';
    option.setAttribute('role', 'option');
    const name = document.createElement('strong');
    name.textContent = candidate.shortName || candidate.label;
    const region = document.createElement('small');
    region.textContent = candidate.context || candidate.label;
    option.append(name, region);
    option.addEventListener('click', () => {
      list.hidden = true;
      list.replaceChildren();
      onSelect(candidate);
    });
    list.append(option);
  });
  list.hidden = choices.length === 0;
}

async function calculateResolvedRoute(inputValue, destination) {
  if (!selectedOrigin || !validPoint(selectedOrigin)) {
    showToast(mode === 'delivery' ? 'Selecciona un negocio de origen.' : 'Selecciona un punto de origen.');
    return;
  }
  if (selectedOrigin.isCustomOrigin) {
    const nearby = findNearbyBusiness(selectedOrigin);
    if (nearby) {
      selectedOrigin = { ...nearby, kind: mode };
      renderOriginButtons();
    }
  }
  const savedPlace = findNearbyFrequentPlace(destination, inputValue);
  const migratedPlaceCoordinates = savedPlace ? addCoordinatesToFrequentPlace(savedPlace, destination) : false;
  const resolvedDestination = savedPlace
    ? { ...destination, label: frequentPlaceName(savedPlace) || destination.label }
    : destination;
  const button = $('#calculate-button');
  const regBtn = $('#register-completed-route');
  if (regBtn) regBtn.disabled = true;
  if (button) {
    button.disabled = true;
    button.innerHTML = 'Calculando… <span>↻</span>';
  }
  try {
    const distance = await getRoadDistance(selectedOrigin, resolvedDestination);
    const rates = settings.rates;
    const { totalUsd, totalCop, totalBs } = fareTotalsForDistance(distance.km, rates);
    const recordId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    routeResult = {
      type: mode,
      recipientBusinessId: settings.businesses.some(business => business.id === selectedOrigin.id)
        ? selectedOrigin.id : '',
      recipientBusinessName: settings.businesses.find(business => business.id === selectedOrigin.id)?.name || '',
      origin: {
        id: selectedOrigin.id,
        name: selectedOrigin.name,
        lat: Number(selectedOrigin.lat),
        lng: Number(selectedOrigin.lng),
        isCustomOrigin: Boolean(selectedOrigin.isCustomOrigin),
        sourceText: selectedOrigin.sourceText || '',
      },
      destination: { ...resolvedDestination, input: inputValue },
      km: distance.km,
      approximate: distance.approximate,
      totalUsd,
      totalCop,
      totalBs,
      rates: { ...rates },
      profitSplitUsed: { ...settings.profitSplit },
      originMethodUsed: originMethod,
      manualBusinessSelectionUsed: $('#manual-business-select')?.value || '',
      historyId: recordId,
    };
    renderFare(routeResult);
    if (migratedPlaceCoordinates) showToast('Coordenadas guardadas para este lugar');
    const originOffer = $('#origin-save-offer');
    if (originOffer) {
      originOffer.hidden = !routeResult.origin.isCustomOrigin;
      if (!originOffer.hidden) {
        const nameInput = $('#origin-save-name');
        if (nameInput) nameInput.value = routeResult.origin.sourceText || routeResult.origin.name;
      }
    }
    const destinationOffer = $('#destination-save-offer');
    if (destinationOffer) {
      destinationOffer.hidden = Boolean(savedPlace);
      if (!destinationOffer.hidden) {
        const nameInput = $('#destination-save-name');
        if (nameInput) nameInput.value = resolvedDestination.shortName || resolvedDestination.label || addressFromLink(inputValue);
        const personInput = $('#destination-save-person');
        if (personInput) personInput.value = '';
      }
    }
    const frequentSection = $('#frequent-section');
    if (pendingFrequentPlaces.length && frequentSection) frequentSection.hidden = false;
  } catch (error) {
    showToast(error.message || 'No se pudo calcular esta ruta.');
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = 'Calcular precio <span>→</span>';
    }
    refreshRouteRegistrationButton();
  }
}

function saveOriginBusinessFromOffer() {
  if (!routeResult?.origin?.isCustomOrigin) return;
  const nameInput = $('#origin-save-name');
  const typedName = nameInput?.value.trim() || '';
  if (!typedName) {
    showToast('Escribe un nombre para guardar este negocio.');
    nameInput?.focus();
    return;
  }
  const origin = routeResult.origin;
  let business = findNearbyBusiness(origin);
  const phone = String($('#origin-save-phone')?.value || '').trim();
  if (!business) {
    business = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name: typedName,
      lat: origin.lat,
      lng: origin.lng,
      phone,
    };
    settings.businesses.push(business);
    if (!pendingSettings.businesses.some(point => point.id === business.id)) {
      pendingSettings.businesses.push(cloneData(business));
    }
    saveSettings();
    queueFirebaseSync(['negocios']);
  }
  if (phone) {
    business.phone = phone;
    saveSettings();
    queueFirebaseSync(['negocios']);
  }
  pendingSettings.businesses = cloneData(settings.businesses);
  selectedOrigin = { ...business, kind: mode };
  routeResult.origin = { ...routeResult.origin, ...business, isCustomOrigin: false, sourceText: '' };
  routeResult.recipientBusinessId = business.id;
  routeResult.recipientBusinessName = business.name;
  const record = history.find(item => item.id === routeResult.historyId);
  if (record) {
    record.originName = business.name;
    record.originLat = business.lat;
    record.originLng = business.lng;
    record.recipientBusinessId = business.id;
    record.recipientBusinessName = business.name;
    saveHistory();
  }
  const originInput = $('#origin-database-input');
  if (originInput) originInput.value = business.name;
  const originSaveOffer = $('#origin-save-offer');
  if (originSaveOffer) originSaveOffer.hidden = true;
  renderOriginButtons();
  renderSidebar();
  updateSaveButtons();
  showToast('Negocio guardado');
}

function saveDestinationPlaceFromOffer() {
  if (!routeResult?.destination) return;
  const nameInput = $('#destination-save-name');
  const personInput = $('#destination-save-person');
  const typedName = nameInput?.value.trim() || '';
  const person = personInput?.value.trim() || '';
  if (!typedName) {
    showToast('Escribe un nombre para guardar este lugar.');
    nameInput?.focus();
    return;
  }
  const destination = routeResult.destination;
  let place = findNearbyFrequentPlace(destination, destination.input);
  if (!place) {
    place = makeFrequentPlace(typedName, destination.input, destination, {}, person);
    frequentPlaces.unshift(place);
    frequentPlaces = frequentPlaces.slice(0, 8);
  } else if (!frequentPlaces.includes(place)) {
    place.persona = person;
    frequentPlaces.unshift(place);
  } else {
    place.persona = person;
  }
  if (!validPoint(place)) addCoordinatesToFrequentPlace(place, destination);
  pendingFrequentPlaces = cloneData(frequentPlaces);
  routeResult.destination.label = frequentPlaceName(place) || typedName;
  const record = history.find(item => item.id === routeResult.historyId);
  if (record) {
    record.destination = routeResult.destination.label;
    saveHistory();
  }
  saveFrequent();
  queueFirebaseSync(['lugaresFrecuentes']);
  const destinationOffer = $('#destination-save-offer');
  if (destinationOffer) destinationOffer.hidden = true;
  if (personInput) personInput.value = '';
  renderFare(routeResult);
  renderFrequentPlaces();
  renderSidebar();
  updateSaveButtons();
  showToast(`Lugar '${frequentPlaceName(place)}' guardado ✅`);
}

on('#save-origin-business', 'click', saveOriginBusinessFromOffer);
on('#skip-origin-save', 'click', () => { const el = $('#origin-save-offer'); if (el) el.hidden = true; });
on('#save-destination-place', 'click', saveDestinationPlaceFromOffer);
on('#skip-destination-save', 'click', () => { const el = $('#destination-save-offer'); if (el) el.hidden = true; });

function formatUsd(value) {
  return Number(value).toFixed(2);
}
function formatWholeCurrency(value) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
}
function formatRate(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, '');
}
function routeQuoteMatchesCurrentInputs(result) {
  if (!result || result.type !== mode || result.originMethodUsed !== originMethod) return false;
  if (result.manualDistance) {
    const manualDistance = $('#manual-distance-km')?.value.trim() || '';
    return originMethod === 'manual'
      && manualDistance !== ''
      && Number(manualDistance) === Number(result.km)
      && !$('#destination-input')?.value.trim()
      && ($('#manual-business-select')?.value || '') === result.manualBusinessSelectionUsed;
  }
  if (($('#destination-input')?.value.trim() || '') !== String(result.destination.input || '').trim()) return false;
  if (!selectedOrigin || selectedOrigin.id !== result.origin.id
    || Number(selectedOrigin.lat) !== Number(result.origin.lat)
    || Number(selectedOrigin.lng) !== Number(result.origin.lng)) return false;
  return originMethod !== 'manual'
    || ($('#manual-business-select')?.value || '') === result.manualBusinessSelectionUsed;
}
function refreshRouteRegistrationButton() {
  const button = $('#register-completed-route');
  if (!button || !routeResult) return;
  const alreadyRecorded = history.some(item => item.id === routeResult.historyId);
  button.disabled = alreadyRecorded || !routeQuoteMatchesCurrentInputs(routeResult);
  button.textContent = alreadyRecorded ? '✓ Traslado registrado'
    : button.disabled ? 'Vuelve a calcular para registrar' : '✓ Registrar traslado realizado';
}
function renderFare(result) {
  const placeholder = $('#fare-placeholder');
  if (placeholder) placeholder.hidden = true;
  const farePanel = $('.fare-panel');
  if (farePanel) {
    farePanel.classList.remove('fare-enter');
    void farePanel.offsetWidth;
    farePanel.classList.add('fare-enter');
  }
  const fareCard = $('#fare-result');
  if (fareCard) fareCard.hidden = false;
  setText('#fare-mode-label', 'TARIFA DELIVERY-CARRERA');
  setText('#fare-destination-label', result.manualDistance ? 'Cálculo manual' : 'Envío a');
  setText('#fare-destination', result.manualDistance ? `${result.km.toFixed(1)} km` : result.destination.label);
  const dest = $('#fare-destination');
  if (dest) dest.title = result.destination.label;
  setText('#fare-km', `${result.km.toFixed(1)} km${result.approximate ? ' aprox.' : ''}`);
  setText('#fare-price-cop', `${formatWholeCurrency(result.totalCop)} COP`);
  setText('#fare-price-usd', `${formatUsd(result.totalUsd)} USD`);
  setText('#fare-price-bs', `${formatWholeCurrency(result.totalBs)} Bs.`);
  setText('#fare-rates', `Conversión: 1 USD = ${formatRate(result.rates.cop_per_usd)} COP | 1 Bs. = ${formatRate(result.rates.cop_per_bs)} COP`);
  refreshRouteRegistrationButton();
  const mapsLink = $('#open-maps');
  if (mapsLink) {
    mapsLink.hidden = Boolean(result.manualDistance);
    if (!result.manualDistance) {
      const origin = `${result.origin.lat},${result.origin.lng}`;
      const destination = `${result.destination.lat},${result.destination.lng}`;
      mapsLink.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    }
  }
}

on('#register-completed-route', 'click', async () => {
  if (!routeResult || history.some(item => item.id === routeResult.historyId)) return;
  if (!routeQuoteMatchesCurrentInputs(routeResult)) {
    refreshRouteRegistrationButton();
    showToast('Vuelve a calcular el precio antes de registrar el traslado.');
    return;
  }
  const confirmed = await showAppConfirm({
    title: 'Registrar traslado',
    message: '¿Confirmas que este traslado sí se realizó y quieres guardarlo en el historial?',
    acceptLabel: 'Sí, registrar',
  });
  if (!confirmed || !routeResult || history.some(item => item.id === routeResult.historyId)) return;
  if (!routeQuoteMatchesCurrentInputs(routeResult)) {
    refreshRouteRegistrationButton();
    showToast('Vuelve a calcular el precio antes de registrar el traslado.');
    return;
  }
  history.unshift(makeCompletedRouteRecord(routeResult));
  history = history.slice(0, 250);
  saveHistory();
  renderSidebar();
  renderFare(routeResult);
  showToast('Traslado realizado registrado');
});

function makeSharePriceMessage(result) {
  const service = 'DELIVERY';
  const distance = `${result.km.toFixed(1)} km${result.approximate ? ' aprox.' : ''}`;
  const lines = [`🚗 ${service}`];
  if (!result.manualDistance) {
    lines.push(`Origen: ${result.origin.name}`);
    lines.push(`Destino: ${result.destination.label}`);
  } else {
    lines.push('Cálculo por kilometraje');
  }
  lines.push(
    `Distancia: ${distance}`,
    '',
    `Precio total:`,
    `${formatWholeCurrency(result.totalCop)} COP`,
    `${formatUsd(result.totalUsd)} USD`,
    `${formatWholeCurrency(result.totalBs)} Bs.`,
    '',
    `Tasas: 1 USD = ${formatRate(result.rates.cop_per_usd)} COP | 1 Bs. = ${formatRate(result.rates.cop_per_bs)} COP`,
  );
  return lines.join('\n');
}

function whatsappPhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function fillBusinessRecipientSelect(select, selectedId = '') {
  if (!select) return;
  select.replaceChildren(new Option('Buscar contacto en WhatsApp', ''));
  settings.businesses.forEach(business => {
    const phone = whatsappPhoneDigits(business.phone);
    const option = new Option(
      `${business.name}${phone ? ` · ${business.phone}` : ' (agrega teléfono en Negocios)'}`,
      business.id,
    );
    select.append(option);
  });
  const hasSelectedBusiness = [...select.options].some(option => option.value === String(selectedId));
  select.value = hasSelectedBusiness ? String(selectedId) : '';
}

function closeSharePriceModal() {
  const modal = $('#share-price-modal');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
}

on('#share-price', 'click', () => {
  if (!routeResult) return;
  const textarea = $('#share-price-message');
  if (textarea) textarea.value = makeSharePriceMessage(routeResult);
  const businessId = routeResult.recipientBusinessId
    || (!routeResult.manualDistance && settings.businesses.some(business => business.id === routeResult.origin.id)
      ? routeResult.origin.id : '');
  fillBusinessRecipientSelect($('#share-price-business'), businessId);
  const modal = $('#share-price-modal');
  if (modal) {
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  }
  textarea?.focus();
});

on('#share-price-close', 'click', closeSharePriceModal);
on('#share-price-modal', 'click', event => {
  if (event.target.id === 'share-price-modal') closeSharePriceModal();
});
document.addEventListener('keydown', event => {
  const modal = $('#share-price-modal');
  if (event.key === 'Escape' && modal && !modal.hidden) closeSharePriceModal();
});

on('#copy-share-price', 'click', async () => {
  const textarea = $('#share-price-message');
  if (!textarea) return;
  const text = textarea.value;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      textarea.focus();
      textarea.select();
      if (!document.execCommand('copy')) throw new Error('No se pudo copiar');
    }
    showToast('Mensaje completo copiado.');
  } catch {
    textarea.focus();
    textarea.select();
    window.prompt('Copia el mensaje completo:', text);
  }
});

on('#send-share-price-whatsapp', 'click', () => {
  const text = $('#share-price-message')?.value || '';
  const business = settings.businesses.find(point => point.id === $('#share-price-business')?.value);
  const phone = whatsappPhoneDigits(business?.phone);
  if (business && phone.length < 7) {
    showToast('Ese negocio no tiene un teléfono válido. WhatsApp se abrirá para elegir el contacto.');
  }
  const destination = phone.length >= 7 ? `https://wa.me/${phone}` : 'https://wa.me/';
  window.open(`${destination}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
});

function renderFrequentPlaces() {
  const section = $('#frequent-section');
  const chips = $('#frequent-chips');
  if (!chips) return;
  if (section) section.hidden = pendingFrequentPlaces.length === 0;
  chips.innerHTML = '';
  pendingFrequentPlaces.forEach((place, index) => {
    const placeName = frequentPlaceName(place);
    const placeLink = frequentPlaceLink(place);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    const person = frequentPlacePerson(place);
    chip.innerHTML = `<span>${escapeHtml(placeName)}</span>${person ? `<small class="chip-person">· ${escapeHtml(person)}</small>` : ''}`;
    chip.title = person ? `${placeName} · ${person}` : 'Usar este destino';
    chip.addEventListener('click', () => {
      const destInput = $('#destination-input');
      if (destInput) destInput.value = placeLink;
      const clear = $('#clear-destination');
      if (clear) clear.hidden = false;
      const save = $('#save-frequent');
      if (save) save.hidden = true;
      const offer = $('#destination-save-offer');
      if (offer) offer.hidden = true;
      if (validPoint(place)) {
        calculateResolvedRoute(placeLink, {
          lat: Number(place.lat),
          lng: Number(place.lng),
          label: placeName,
          shortName: placeName,
        });
      } else {
        calculateRoute();
      }
    });
    chip.addEventListener('contextmenu', event => {
      event.preventDefault();
      if (!removeFrequentPlace(pendingFrequentPlaces[index])) return;
      renderFrequentPlaces();
      renderSidebar();
      updateSaveButtons();
      showToast('Lugar frecuente eliminado');
    });
    chips.append(chip);
  });
}
function addFrequentPlaceToDraft(name, link, coords, person = '') {
  const duplicate = findNearbyFrequentPlace({ ...coords, label: name }, link);
  if (duplicate) {
    if (person.trim()) {
      [...frequentPlaces, ...pendingFrequentPlaces].filter(place => (duplicate.id && place.id === duplicate.id)
        || (frequentPlaceLink(place) === frequentPlaceLink(duplicate) && frequentPlaceName(place) === frequentPlaceName(duplicate)))
        .forEach(place => { place.persona = person.trim(); });
      saveFrequent();
      queueFirebaseSync(['lugaresFrecuentes']);
      pendingFrequentPlaces = cloneData(frequentPlaces);
      renderSidebar();
      renderFrequentPlaces();
      updateSaveButtons();
      showToast(`Persona asociada: ${person.trim()}`);
      return;
    }
    if (!validPoint(duplicate) && addCoordinatesToFrequentPlace(duplicate, coords)) {
      pendingFrequentPlaces = cloneData(frequentPlaces);
      renderFrequentPlaces();
      renderSidebar();
      showToast('Coordenadas guardadas para este lugar');
    } else {
      showToast('Ese lugar ya está guardado.');
    }
    return;
  }
  const place = makeFrequentPlace(name, link, coords, {}, person);
  frequentPlaces.unshift(place);
  frequentPlaces = frequentPlaces.slice(0, 8);
  pendingFrequentPlaces = cloneData(frequentPlaces);
  saveFrequent();
  queueFirebaseSync(['lugaresFrecuentes']);
  renderFrequentPlaces();
  renderSidebar();
  updateSaveButtons();
  showToast(`Lugar '${name}' guardado ✅`);
}

on('#save-frequent', 'click', async () => {
  const input = $('#destination-input')?.value.trim();
  if (!input) return;
  const person = window.prompt('¿De quién es este lugar? (opcional):', '');
  if (person === null) return;
  const name = addressFromLink(input).replace(/https?:\/\//, '').slice(0, 32);
  const resolvedCurrentDestination = routeResult?.destination?.input?.toLowerCase() === input.toLowerCase()
    ? routeResult.destination : null;
  const inputCoordinates = parseCoordinates(input);
  const coords = resolvedCurrentDestination || inputCoordinates;
  if (coords) {
    addFrequentPlaceToDraft(name, input, coords, person);
    return;
  }
  try {
    const result = await resolveDestination(input);
    if (result.choices?.length > 1) {
      showGeocodeChoices($('#destination-choices'), result.choices, candidate => {
        addFrequentPlaceToDraft(name, input, candidate, person);
      });
    } else {
      addFrequentPlaceToDraft(name, input, result.choices?.[0] || result, person);
    }
  } catch (error) {
    showToast(error.message || 'No se pudo ubicar este destino.');
  }
});

function recordTotalCop(item) {
  const storedCop = Number(item.total_cop);
  if (item.total_cop != null && Number.isFinite(storedCop)) return storedCop;
  const legacyTotal = Number(item.total);
  if (!Number.isFinite(legacyTotal)) return 0;
  const copPerBs = Number(item.rate_cop_bs) || Number(settings.rates.cop_per_bs) || 1;
  return legacyTotal * copPerBs;
}

function historySelectionKey(item) {
  return item.id != null ? `id:${item.id}` : `legacy:${JSON.stringify(item)}`;
}

function historySyncKey(item) {
  return item?.id != null ? `id:${item.id}` : `legacy:${JSON.stringify(item)}`;
}

function updateHistorySelectionControls() {
  const visibleKeys = visibleHistoryRecords.map(item => historySelectionKey(item));
  const selectedCount = visibleKeys.filter(key => selectedHistoryIds.has(key)).length;
  const selectAll = $('#select-all-history');
  if (selectAll) {
    selectAll.checked = visibleKeys.length > 0 && selectedCount === visibleKeys.length;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < visibleKeys.length;
  }
  const tools = $('#history-selection-tools');
  if (tools) tools.hidden = visibleKeys.length === 0;
  const removeButton = $('#delete-selected-history');
  if (removeButton) {
    removeButton.disabled = selectedCount === 0;
    removeButton.textContent = selectedCount ? `Eliminar seleccionadas (${selectedCount})` : 'Eliminar seleccionadas';
  }
}

function recordProfitAmounts(item) {
  const mine = Number(item.ganancia_mia_cop);
  const bike = Number(item.ganancia_moto_cop);
  if (item.ganancia_mia_cop != null && item.ganancia_moto_cop != null
    && Number.isFinite(mine) && Number.isFinite(bike)) {
    return { mine, bike };
  }
  const total = recordTotalCop(item);
  const split = settings.profitSplit || defaults.profitSplit;
  return {
    mine: Math.round(total * Number(split.mine || 0) / 100),
    bike: Math.round(total * Number(split.bike || 0) / 100),
  };
}

function summarizeHistoryRecords(records) {
  return records.reduce((summary, item) => {
    const profit = recordProfitAmounts(item);
    summary.total += recordTotalCop(item);
    summary.mine += profit.mine;
    summary.bike += profit.bike;
    summary.count++;
    return summary;
  }, { total: 0, mine: 0, bike: 0, count: 0 });
}

function historyWeekKey(date) {
  const daysSinceMonday = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

function historyDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderHistoryChart(filtered, monthRecords, workWeeks, allWorkRecords, selectedMonth) {
  const chart = $('#history-chart');
  if (!chart) return;
  let buckets = [];
  if (historyChartPeriod === 'daily') {
    const byDay = new Map();
    filtered.forEach(item => {
      const date = new Date(item.createdAt);
      const key = historyDayKey(date);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(item);
    });
    buckets = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, records]) => ({
      label: String(Number(key.slice(-2))),
      records,
    }));
  } else if (historyChartPeriod === 'weekly') {
    buckets = workWeeks.map(([weekKey], index) => ({
      label: `S${index + 1}`,
      records: monthRecords.filter(item => historyWeekKey(new Date(item.createdAt)) === weekKey),
    }));
  } else {
    const [selectedYear, selectedMonthNumber] = selectedMonth.split('-').map(Number);
    const endMonth = new Date(selectedYear, selectedMonthNumber - 1, 1);
    const monthKeys = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(endMonth.getFullYear(), endMonth.getMonth() - 11 + index, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    });
    buckets = monthKeys.map(key => ({
      label: new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1)
        .toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''),
      records: allWorkRecords.filter(item => {
        const date = new Date(item.createdAt);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === key;
      }),
    }));
  }
  if (!buckets.length || buckets.every(bucket => !bucket.records.length)) {
    chart.innerHTML = '<div class="history-chart-empty">Todavía no hay rutas para graficar.</div>';
    return;
  }
  const values = buckets.map(bucket => summarizeHistoryRecords(bucket.records));
  const maxTotal = Math.max(...values.map(value => value.total), 1);
  const width = 640;
  const chartHeight = 130;
  const baseY = 112;
  const plotHeight = 92;
  const slotWidth = width / buckets.length;
  const barWidth = Math.max(5, Math.min(25, slotWidth * .56));
  const grid = [0, 1, 2, 3].map(index => {
    const y = baseY - (plotHeight / 3) * index;
    return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#dfe4dc" stroke-width="1" />`;
  }).join('');
  const bars = buckets.map((bucket, index) => {
    const value = values[index];
    const x = slotWidth * index + (slotWidth - barWidth) / 2;
    const totalHeight = value.total ? Math.max(2, value.total / maxTotal * plotHeight) : 0;
    const mineHeight = value.total ? totalHeight * value.mine / value.total : 0;
    const bikeHeight = Math.max(0, totalHeight - mineHeight);
    const label = escapeHtml(bucket.label);
    const title = escapeHtml(`${bucket.label}: ${formatWholeCurrency(value.total)} COP · Mío ${formatWholeCurrency(value.mine)} · Moto ${formatWholeCurrency(value.bike)}`);
    return `<g><title>${title}</title>
      <rect x="${x}" y="${baseY - mineHeight}" width="${barWidth}" height="${mineHeight}" rx="2" fill="#388457" />
      <rect x="${x}" y="${baseY - totalHeight}" width="${barWidth}" height="${bikeHeight}" rx="2" fill="#e4a05c" />
      <text x="${slotWidth * index + slotWidth / 2}" y="129" text-anchor="middle">${label}</text>
    </g>`;
  }).join('');
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${chartHeight}" aria-hidden="true">${grid}${bars}</svg>`;
}

function renderHistory() {
  const monthSelect = $('#history-month');
  const weekSelect = $('#history-week');
  if (!monthSelect || !weekSelect) return;
  const now = new Date();
  const currentWorkWeek = historyWeekKey(now);
  if (currentWorkWeek !== observedCurrentWorkWeek) {
    observedCurrentWorkWeek = currentWorkWeek;
    historyWeekManuallySelected = false;
  }
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthKeys = [...new Set(history.map(item => {
    const date = new Date(item.createdAt);
    return Number.isNaN(date.getTime())
      ? null
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }).filter(Boolean))];
  if (!monthKeys.includes(currentMonth)) monthKeys.push(currentMonth);
  monthKeys.sort((a, b) => b.localeCompare(a));
  if (!monthKeys.includes(selectedHistoryMonth)) selectedHistoryMonth = currentMonth;
  monthSelect.innerHTML = monthKeys.map(key => {
    const [year, month] = key.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const label = date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    return `<option value="${key}">${label.charAt(0).toLocaleUpperCase('es-CO')}${label.slice(1)}</option>`;
  }).join('');
  monthSelect.value = selectedHistoryMonth;

  const [year, month] = selectedHistoryMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const workWeeksByMonday = new Map();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    if (date.getDay() === 0) continue;
    const daysSinceMonday = (date.getDay() + 6) % 7;
    const monday = new Date(year, month - 1, day - daysSinceMonday);
    const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    if (!workWeeksByMonday.has(key)) workWeeksByMonday.set(key, []);
    workWeeksByMonday.get(key).push(day);
  }
  const workWeeks = [...workWeeksByMonday.entries()].sort(([a], [b]) => a.localeCompare(b));
  const weekOptions = [
    ['all', 'Todas las semanas (Lun-Sáb)'],
    ...workWeeks.map(([key, days], index) => [
      key,
      `Semana ${index + 1} (Lun-Sáb · días ${days[0]}-${days.at(-1)})`,
    ]),
  ];
  if (!historyWeekManuallySelected) {
    const defaultWeek = selectedHistoryMonth === currentMonth ? historyWeekKey(now) : 'all';
    selectedHistoryWeek = weekOptions.some(([value]) => value === defaultWeek) ? defaultWeek : 'all';
  } else if (!weekOptions.some(([value]) => value === selectedHistoryWeek)) {
    selectedHistoryWeek = 'all';
    historyWeekManuallySelected = false;
  }
  weekSelect.innerHTML = weekOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  weekSelect.value = selectedHistoryWeek;

  const filtered = history.filter(item => {
    const date = new Date(item.createdAt);
    if (Number.isNaN(date.getTime())) return false;
    const itemMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (itemMonth !== selectedHistoryMonth) return false;
    if (date.getDay() === 0) return false;
    if (selectedHistoryWeek === 'all') return true;
    const daysSinceMonday = (date.getDay() + 6) % 7;
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday);
    const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    return weekKey === selectedHistoryWeek;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  visibleHistoryRecords = filtered;
  updateHistorySelectionControls();
  const monthRecords = history.filter(item => {
    const date = new Date(item.createdAt);
    return !Number.isNaN(date.getTime())
      && date.getDay() !== 0
      && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === selectedHistoryMonth;
  });
  const allWorkRecords = history.filter(item => {
    const date = new Date(item.createdAt);
    return !Number.isNaN(date.getTime()) && date.getDay() !== 0;
  });
  const periodTotals = summarizeHistoryRecords(filtered);
  const monthTotals = summarizeHistoryRecords(monthRecords);
  setText('#history-period-title', selectedHistoryWeek === 'all' ? 'Este mes 💰' : 'Esta semana 💰');
  setText('#history-period-total', `${formatWholeCurrency(periodTotals.total)} COP`);
  setText('#history-period-mine', `${formatWholeCurrency(periodTotals.mine)} COP`);
  setText('#history-period-bike', `${formatWholeCurrency(periodTotals.bike)} COP`);
  setText('#history-period-count', `${periodTotals.count} ${periodTotals.count === 1 ? 'ruta' : 'rutas'}`);

  const priorRecords = history.filter(item => {
    const date = new Date(item.createdAt);
    if (Number.isNaN(date.getTime()) || date.getDay() === 0) return false;
    if (selectedHistoryWeek === 'all') {
      const prior = new Date(year, month - 2, 1);
      return date.getFullYear() === prior.getFullYear() && date.getMonth() === prior.getMonth();
    }
    const priorMonday = new Date(`${selectedHistoryWeek}T12:00:00`);
    priorMonday.setDate(priorMonday.getDate() - 7);
    return historyWeekKey(date) === historyDayKey(priorMonday);
  });
  const priorTotal = summarizeHistoryRecords(priorRecords).total;
  const change = priorTotal > 0 ? Math.round((periodTotals.total - priorTotal) / priorTotal * 100) : null;
  const changeEl = $('#history-period-change');
  if (changeEl) {
    changeEl.textContent = change === null ? '—' : `${change >= 0 ? '▲ +' : '▼ '}${change}%`;
    changeEl.classList.toggle('is-down', change !== null && change < 0);
  }

  const dailyTotals = new Map();
  filtered.forEach(item => {
    const date = new Date(item.createdAt);
    const key = historyDayKey(date);
    if (!dailyTotals.has(key)) dailyTotals.set(key, []);
    dailyTotals.get(key).push(item);
  });
  const bestDay = [...dailyTotals.entries()].map(([key, records]) => ({
    key,
    records,
    total: summarizeHistoryRecords(records).total,
  })).sort((a, b) => b.total - a.total)[0];
  const recordByDay = new Map();
  allWorkRecords.forEach(item => {
    const key = historyDayKey(new Date(item.createdAt));
    if (!recordByDay.has(key)) recordByDay.set(key, []);
    recordByDay.get(key).push(item);
  });
  const recordDay = [...recordByDay.entries()].map(([key, records]) => ({
    key,
    total: summarizeHistoryRecords(records).total,
  })).sort((a, b) => b.total - a.total)[0];
  const dateFromKey = key => {
    const [dateYear, dateMonth, day] = key.split('-').map(Number);
    return new Date(dateYear, dateMonth - 1, day);
  };
  if (bestDay) {
    const destinationCounts = new Map();
    bestDay.records.forEach(item => destinationCounts.set(item.destination || 'Sin destino',
      (destinationCounts.get(item.destination || 'Sin destino') || 0) + 1));
    const bestDestination = [...destinationCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    setText('#history-best-day-date', dateFromKey(bestDay.key).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }));
    setText('#history-best-day-total', `${formatWholeCurrency(bestDay.total)} COP`);
    setText('#history-best-day-destination', `→ ${bestDestination}`);
  } else {
    setText('#history-best-day-date', '—');
    setText('#history-best-day-total', '—');
    setText('#history-best-day-destination', '—');
  }
  setText('#history-record-date', recordDay
    ? dateFromKey(recordDay.key).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' }) : '—');
  setText('#history-record-total', recordDay ? `${formatWholeCurrency(recordDay.total)} COP` : '—');
  setText('#history-average-total', `${formatWholeCurrency(periodTotals.count ? periodTotals.total / periodTotals.count : 0)} COP`);
  setText('#history-average-count', `${periodTotals.count} ${periodTotals.count === 1 ? 'viaje' : 'viajes'}`);

  const goal = Number(settings.monthlyGoal) || 0;
  const goalCard = $('#history-goal-card');
  if (goalCard) goalCard.hidden = goal <= 0;
  if (goal > 0) {
    const progress = Math.round(monthTotals.total / goal * 100);
    setText('#history-goal-label', `${formatWholeCurrency(monthTotals.total)} / ${formatWholeCurrency(goal)} COP · ${progress}%`);
    const bar = $('#history-goal-progress');
    if (bar) bar.style.width = `${Math.min(progress, 100)}%`;
  }
  const renderRankedList = (selector, counts, emptyText) => {
    const el = $(selector);
    if (!el) return;
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    el.innerHTML = entries.length
      ? entries.map(([name, count]) => `<li><div class="history-top-row"><strong>${escapeHtml(name)}</strong><span>${count}</span></div></li>`).join('')
      : `<li>${emptyText}</li>`;
  };
  const destinations = new Map();
  const businesses = new Map();
  const knownBusinesses = new Map([...settings.businesses, ...pendingSettings.businesses].map(business => [business.id, business.name]));
  filtered.forEach(item => {
    const destination = String(item.destination || '').trim();
    const origin = String(item.recipientBusinessName
      || knownBusinesses.get(item.recipientBusinessId)
      || item.originName || '').trim();
    if (destination) destinations.set(destination, (destinations.get(destination) || 0) + 1);
    if (origin && origin.toLowerCase() !== 'kilometraje manual' && origin.toLowerCase() !== 'origen') {
      businesses.set(origin, (businesses.get(origin) || 0) + 1);
    }
  });
  renderRankedList('#history-top-destinations', destinations, 'Sin destinos todavía');
  renderRankedList('#history-top-businesses', businesses, 'Sin negocios todavía');

  const allTotals = summarizeHistoryRecords(history);
  const paidToMoto = (settings.motoPayments || []).reduce((sum, payment) => sum + Number(payment.monto || 0), 0);
  const motoBalance = allTotals.bike - paidToMoto;
  const paidSalary = (settings.salaryPayments || []).reduce((sum, payment) => sum + Number(payment.monto || 0), 0);
  const salaryBalance = allTotals.mine - paidSalary;
  const copPerUsd = Number(settings.rates.cop_per_usd) || 1;
  const copPerBs = Number(settings.rates.cop_per_bs) || 1;
  setText('#history-moto-balance', `${formatWholeCurrency(motoBalance)} COP`);
  setText('#history-moto-conversions', `${formatUsd(motoBalance / copPerUsd)} USD / ${formatWholeCurrency(motoBalance / copPerBs)} Bs.`);
  const motoBtn = $('#moto-payment-button');
  if (motoBtn) motoBtn.disabled = motoBalance <= 0;
  const restoreMoto = $('#restore-moto-payment');
  if (restoreMoto) restoreMoto.disabled = !settings.motoPayments.length;
  setText('#history-salary-total', `${formatWholeCurrency(salaryBalance)} COP`);
  setText('#history-salary-conversions', `${formatUsd(salaryBalance / copPerUsd)} USD / ${formatWholeCurrency(salaryBalance / copPerBs)} Bs.`);
  const salBtn = $('#salary-payment-button');
  if (salBtn) salBtn.disabled = salaryBalance <= 0;
  const restoreSal = $('#restore-salary-payment');
  if (restoreSal) restoreSal.disabled = !settings.salaryPayments.length;
  renderHistoryChart(filtered, monthRecords, workWeeks, allWorkRecords, selectedHistoryMonth);
  const chartTabs = $('.history-chart-tabs');
  if (chartTabs) {
    chartTabs.querySelectorAll('[data-chart-period]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.chartPeriod === historyChartPeriod);
    });
  }
  setText('#history-list-count', `${filtered.length} ${filtered.length === 1 ? 'ruta' : 'rutas'}`);

  const list = $('#history-list');
  if (!list) return;
  if (!filtered.length) {
    list.innerHTML = '<div class="history-empty">No hay rutas en este período.</div>';
    return;
  }
  list.innerHTML = filtered.map(item => {
    const selectionKey = historySelectionKey(item);
    const type = item.type === 'carrera' ? 'Carrera' : 'Delivery';
    const date = new Date(item.createdAt);
    const dateLabel = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
    const distance = Number(item.km).toFixed(1);
    const totalCop = recordTotalCop(item);
    const copPerUsd2 = Number(item.rate_cop_usd) || Number(item.rate_usd_cop) || Number(settings.rates.cop_per_usd) || 1;
    const copPerBs2 = Number(item.rate_cop_bs) || Number(settings.rates.cop_per_bs) || 1;
    const usd = item.total_usd != null && Number.isFinite(Number(item.total_usd)) ? Number(item.total_usd) : totalCop / copPerUsd2;
    const bs = item.total_bs != null && Number.isFinite(Number(item.total_bs)) ? Number(item.total_bs) : totalCop / copPerBs2;
    const profit = recordProfitAmounts(item);
    const price = `<strong>${formatWholeCurrency(totalCop)} COP</strong>
      <small class="history-conversions">(${formatUsd(usd)} USD / ${formatWholeCurrency(bs)} Bs.)</small>
      <small class="history-distribution">Mío ${formatWholeCurrency(profit.mine)} · Moto ${formatWholeCurrency(profit.bike)}</small>`;
    return `<article class="history-entry${selectedHistoryIds.has(selectionKey) ? ' is-selected' : ''}">
      <label class="history-select-control"><input type="checkbox" data-history-key="${escapeHtml(selectionKey)}" aria-label="Seleccionar ruta a ${escapeHtml(item.destination || 'destino')}" ${selectedHistoryIds.has(selectionKey) ? 'checked' : ''} /></label>
      <span class="history-icon">${item.type === 'carrera' ? '🚗' : '🍔'}</span>
      <div class="history-main"><strong>${escapeHtml(item.destination)}</strong><p>${type} desde ${escapeHtml(item.originName || 'Origen')} · ${distance} km</p></div>
      <div class="history-side">${price}<small>${dateLabel}</small></div>
    </article>`;
  }).join('');
}
on('#history-month', 'change', event => {
  selectedHistoryMonth = event.target.value;
  selectedHistoryWeek = 'all';
  historyWeekManuallySelected = false;
  selectedHistoryIds.clear();
  renderHistory();
});
on('#history-week', 'change', event => {
  selectedHistoryWeek = event.target.value;
  historyWeekManuallySelected = true;
  selectedHistoryIds.clear();
  renderHistory();
});
on('#history-list', 'change', event => {
  const checkbox = event.target.closest('[data-history-key]');
  if (!checkbox) return;
  const key = checkbox.dataset.historyKey;
  if (checkbox.checked) selectedHistoryIds.add(key);
  else selectedHistoryIds.delete(key);
  checkbox.closest('.history-entry')?.classList.toggle('is-selected', checkbox.checked);
  updateHistorySelectionControls();
});
on('#select-all-history', 'change', event => {
  const visibleKeys = visibleHistoryRecords.map(item => historySelectionKey(item));
  if (event.target.checked) visibleKeys.forEach(key => selectedHistoryIds.add(key));
  else visibleKeys.forEach(key => selectedHistoryIds.delete(key));
  renderHistory();
});
on('#delete-selected-history', 'click', async () => {
  const visibleKeys = visibleHistoryRecords.map(item => historySelectionKey(item));
  const selectedVisibleKeys = visibleKeys.filter(key => selectedHistoryIds.has(key));
  if (!selectedVisibleKeys.length) return;
  const confirmed = await showAppConfirm({
    title: 'Eliminar registros',
    message: `¿Eliminar ${selectedVisibleKeys.length === 1 ? 'el registro seleccionado' : `los ${selectedVisibleKeys.length} registros seleccionados`}? Esta acción no se puede deshacer.`,
    acceptLabel: 'Eliminar',
  });
  if (!confirmed) return;
  const keysToDelete = new Set(selectedVisibleKeys);
  const removedRecords = history.filter(item => keysToDelete.has(historySelectionKey(item)));
  if (isFirebaseConfigured() && !firebaseInitialized) {
    removedRecords.forEach(item => firebaseDeletedHistoryKeysDuringLoad.add(historySyncKey(item)));
  }
  history = history.filter(item => !keysToDelete.has(historySelectionKey(item)));
  selectedHistoryIds.clear();
  saveHistory();
  renderHistory();
  renderSidebar();
  showToast(selectedVisibleKeys.length === 1 ? 'Registro eliminado' : 'Registros eliminados');
});
$$('[data-chart-period]').forEach(button => button.addEventListener('click', () => {
  historyChartPeriod = button.dataset.chartPeriod;
  renderHistory();
}));
on('#export-history-csv', 'click', () => {
  const rows = [
    ['Fecha', 'Tipo', 'Origen', 'Destino', 'Km', 'Total COP', 'USD', 'Bs', 'Ganancia mía COP', 'Ganancia moto COP', '% mío', '% moto'],
    ...visibleHistoryRecords.map(item => {
      const totalCop = recordTotalCop(item);
      const profit = recordProfitAmounts(item);
      const split = item.profit_split_used || settings.profitSplit;
      const copPerUsd = Number(item.rate_cop_usd) || Number(item.rate_usd_cop) || Number(settings.rates.cop_per_usd) || 1;
      const copPerBs = Number(item.rate_cop_bs) || Number(settings.rates.cop_per_bs) || 1;
      return [
        item.createdAt || '',
        item.type || '',
        item.originName || '',
        item.destination || '',
        item.km ?? '',
        totalCop,
        item.total_usd ?? totalCop / copPerUsd,
        item.total_bs ?? totalCop / copPerBs,
        profit.mine,
        profit.bike,
        split.mine ?? settings.profitSplit.mine,
        split.bike ?? settings.profitSplit.bike,
      ];
    }),
  ];
  const csv = `\uFEFF${rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const download = document.createElement('a');
  download.href = url;
  download.download = `delivery-app-historial-${selectedHistoryMonth}.csv`;
  document.body.append(download);
  download.click();
  download.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('CSV exportado');
});
on('#moto-payment-button', 'click', async () => {
  const totalBike = summarizeHistoryRecords(history).bike;
  const paid = settings.motoPayments.reduce((sum, payment) => sum + Number(payment.monto || 0), 0);
  const pending = totalBike - paid;
  if (pending <= 0) {
    showToast('No hay saldo pendiente con la moto.');
    return;
  }
  const payment = await showAppConfirm({
    title: 'Pago a la moto',
    message: `Saldo pendiente: ${formatWholeCurrency(pending)} COP. Ingresa el monto que vas a pagar.`,
    acceptLabel: 'Marcar como pagado',
    paymentForm: { amount: Math.round(pending) },
    icon: '$',
  });
  if (!payment) return;
  settings.motoPayments.push({
    fecha: new Date().toISOString(),
    monto: payment.amount,
    nota: payment.note,
  });
  pendingSettings.motoPayments = cloneData(settings.motoPayments);
  saveSettings();
  queueFirebaseSync(['settings']);
  renderHistory();
  updateSaveButtons();
  showToast('Pago registrado');
});
on('#restore-moto-payment', 'click', async () => {
  const payment = settings.motoPayments.at(-1);
  if (!payment) {
    showToast('No hay pagos para restaurar.');
    return;
  }
  const detail = payment.nota ? ` (${payment.nota})` : '';
  const confirmed = await showAppConfirm({
    title: 'Restaurar pago de la moto',
    message: `¿Restaurar el último pago de ${formatWholeCurrency(payment.monto)} COP${detail}? Se sumará de nuevo a la ganancia pendiente de la moto.`,
    acceptLabel: 'Restaurar pago',
    icon: '↶',
  });
  if (!confirmed) return;
  settings.motoPayments.pop();
  pendingSettings.motoPayments = cloneData(settings.motoPayments);
  saveSettings();
  queueFirebaseSync(['settings']);
  renderHistory();
  updateSaveButtons();
  showToast('Último pago restaurado');
});
on('#salary-payment-button', 'click', async () => {
  const earned = summarizeHistoryRecords(history).mine;
  const paid = settings.salaryPayments.reduce((sum, payment) => sum + Number(payment.monto || 0), 0);
  const pending = earned - paid;
  if (pending <= 0) {
    showToast('No hay sueldo pendiente para pagar.');
    return;
  }
  const payment = await showAppConfirm({
    title: 'Pago de sueldo',
    message: `Sueldo pendiente: ${formatWholeCurrency(pending)} COP. Ingresa el monto que vas a pagar.`,
    acceptLabel: 'Marcar como pagado',
    paymentForm: { amount: Math.round(pending) },
    icon: '$',
  });
  if (!payment) return;
  settings.salaryPayments.push({
    fecha: new Date().toISOString(),
    monto: payment.amount,
    nota: payment.note,
  });
  pendingSettings.salaryPayments = cloneData(settings.salaryPayments);
  saveSettings();
  queueFirebaseSync(['settings']);
  renderHistory();
  updateSaveButtons();
  showToast('Sueldo registrado como pagado');
});
on('#restore-salary-payment', 'click', async () => {
  const payment = settings.salaryPayments.at(-1);
  if (!payment) {
    showToast('No hay pagos de sueldo para restaurar.');
    return;
  }
  const detail = payment.nota ? ` (${payment.nota})` : '';
  const confirmed = await showAppConfirm({
    title: 'Restaurar pago de sueldo',
    message: `¿Restaurar el último pago de ${formatWholeCurrency(payment.monto)} COP${detail}? Se sumará de nuevo al sueldo pendiente.`,
    acceptLabel: 'Restaurar pago',
    icon: '↶',
  });
  if (!confirmed) return;
  settings.salaryPayments.pop();
  pendingSettings.salaryPayments = cloneData(settings.salaryPayments);
  saveSettings();
  queueFirebaseSync(['settings']);
  renderHistory();
  updateSaveButtons();
  showToast('Último pago de sueldo restaurado');
});
on('#clear-history', 'click', async () => {
  const confirmed = await showAppConfirm({
    title: 'Borrar historial',
    message: '¿Seguro que quieres borrar TODO el historial? Esta acción no se puede deshacer.',
    acceptLabel: 'Borrar todo',
  });
  if (!confirmed) return;
  history = [];
  selectedHistoryIds.clear();
  firebaseDeletedHistoryKeysDuringLoad.clear();
  firebaseHistoryClearedDuringLoad = isFirebaseConfigured() && !firebaseInitialized;
  saveHistory();
  renderHistory();
  renderSidebar();
  showToast('Historial borrado');
});

function renderSettings() {
  const setVal = (sel, v) => { const el = $(sel); if (el) el.value = v; };
  setVal('#rate-min-cop', pendingSettings.rates.minimum_cop);
  setVal('#rate-extra-km-cop', pendingSettings.rates.extra_km_cop);
  setVal('#rate-cop-usd', pendingSettings.rates.cop_per_usd);
  setVal('#rate-cop-bs', pendingSettings.rates.cop_per_bs);
  setVal('#profit-mine-percent', pendingSettings.profitSplit.mine);
  setVal('#profit-bike-percent', pendingSettings.profitSplit.bike);
  setVal('#monthly-goal-cop', pendingSettings.monthlyGoal);
  const tiersEl = $('#rate-tiers');
  if (tiersEl) {
    tiersEl.innerHTML = pendingSettings.rates.tiers.map((tier, index) => `
      <div class="rate-tier-row">
        <label>Hasta (km)<input type="number" min="0.01" step="any" value="${tier.km}" data-rate-tier-index="${index}" data-rate-tier-field="km" aria-label="Límite de distancia del tramo ${index + 1}, en kilómetros" /></label>
        <label>Precio (COP)<input type="number" min="0" step="100" value="${tier.price}" data-rate-tier-index="${index}" data-rate-tier-field="price" aria-label="Precio del tramo ${index + 1}, en pesos colombianos" /></label>
      </div>`).join('');
  }
  setVal('#search-region-select', pendingSettings.searchRegion);
  setVal('#custom-country-codes', pendingSettings.customCountryCodes);
  setText('#settings-theme-toggle', theme === 'dark' ? '☀️ Cambiar a modo claro' : '🌙 Cambiar a modo oscuro');
  updateSearchRegionLabel();
  updateSaveButtons();
}

function renderSidebar() {
  renderSidebarPoints('businesses', $('#sidebar-businesses-list'));
  renderSidebarPoints('bases', $('#sidebar-bases-list'));
  const manualRecipient = $('#manual-business-select');
  if (manualRecipient) {
    fillBusinessRecipientSelect(
      manualRecipient,
      routeResult?.manualDistance ? routeResult.recipientBusinessId : manualRecipient.value,
    );
  }
  const frequentList = $('#sidebar-frequent-list');
  if (frequentList) {
    frequentList.innerHTML = pendingFrequentPlaces.length
      ? pendingFrequentPlaces.map((place, index) => {
        const name = frequentPlaceName(place);
        const link = frequentPlaceLink(place);
        if (editingFrequentPlace === index) {
          return `<form class="sidebar-edit-form" data-edit-frequent="${index}">
            <label>Nombre<input name="name" required value="${escapeHtml(name)}" /></label>
            <label>Persona asociada<input name="person" value="${escapeHtml(frequentPlacePerson(place))}" placeholder="Ej. Carlos" /></label>
            <label>Enlace o dirección<input name="location" value="${escapeHtml(link)}" placeholder="Opcional si ingresas coordenadas" /></label>
            <div class="sidebar-coordinate-fields">
              <label>Latitud<input name="lat" type="number" step="any" value="${validPoint(place) ? escapeHtml(place.lat) : ''}" placeholder="7.8241" /></label>
              <label>Longitud<input name="lng" type="number" step="any" value="${validPoint(place) ? escapeHtml(place.lng) : ''}" placeholder="-72.2128" /></label>
            </div>
            <div class="sidebar-form-actions">
              <button class="subtle-button" type="button" data-open-place-map>📍 Ubicar en mapa</button>
              <div><button class="save-item" type="submit">Guardar</button><button class="cancel-edit" type="button" data-cancel-frequent-edit>Cancelar</button></div>
            </div>
            <div class="destination-choices" data-frequent-edit-choices hidden></div>
          </form>`;
        }
        const locationText = validPoint(place) ? `${Number(place.lat).toFixed(4)}, ${Number(place.lng).toFixed(4)}` : link;
        const person = frequentPlacePerson(place);
        return `<article class="sidebar-managed-item">
          <div><strong>${escapeHtml(name)}${person ? ` · ${escapeHtml(person)}` : ''}</strong><small>${escapeHtml(locationText)}</small></div>
          <div class="sidebar-item-actions">
            <button class="edit-item" type="button" data-edit-place="${index}">✏️ Editar</button>
            <button class="delete-item" type="button" data-delete-place="${index}">Eliminar</button>
          </div>
        </article>`;
      }).join('')
      : '<p class="sidebar-empty">Todavía no hay lugares frecuentes.</p>';
  }
  const recent = $('#sidebar-recent-history');
  if (recent) {
    recent.innerHTML = history.length
      ? history.slice(0, 5).map(item => {
        const amount = Number.isFinite(Number(item.total_cop))
          ? `${formatWholeCurrency(item.total_cop)} COP`
          : `${formatWholeCurrency(item.total)} Bs.`;
        return `<div class="recent-history-item"><strong>${escapeHtml(item.destination || 'Destino')}</strong><small>${amount} · ${Number(item.km || 0).toFixed(1)} km</small></div>`;
      }).join('')
      : '<p class="sidebar-empty">Aún no hay cálculos.</p>';
  }
  updateSaveButtons();
}

function renderSidebarPoints(key, container) {
  if (!container) return;
  const points = pendingSettings[key] || [];
  container.innerHTML = points.length ? points.map(point => {
    if (editingPoint?.key === key && editingPoint.id === point.id) {
      return `<form class="sidebar-edit-form" data-edit-point="${key}" data-id="${escapeHtml(point.id)}">
        <label>Nombre<input name="name" required value="${escapeHtml(point.name)}" /></label>
        ${key === 'businesses' ? `<label>Teléfono de WhatsApp<input name="phone" type="tel" value="${escapeHtml(point.phone || '')}" placeholder="Ej. +58 412 1234567" /></label>` : ''}
        <div class="sidebar-coordinate-fields">
          <label>Latitud<input name="lat" ${key !== 'businesses' ? 'required' : ''} type="number" step="any" value="${validPoint(point) ? escapeHtml(point.lat) : ''}" /></label>
          <label>Longitud<input name="lng" ${key !== 'businesses' ? 'required' : ''} type="number" step="any" value="${validPoint(point) ? escapeHtml(point.lng) : ''}" /></label>
        </div>
        <div class="sidebar-form-actions"><button type="button" class="subtle-button" data-capture-form="edit-${key}-${escapeHtml(point.id)}">⌖ Mi ubicación</button><button type="button" class="subtle-button" data-open-location-map>📍 Ubicar en mapa</button><div><button class="save-item" type="submit">Guardar</button><button class="cancel-edit" type="button" data-cancel-edit>Cancelar</button></div></div>
      </form>`;
    }
    return `<article class="sidebar-managed-item">
      <div><strong>${escapeHtml(point.name)}</strong><small>${validPoint(point) ? `${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}` : 'Solo contacto'}${key === 'businesses' && point.phone ? ` · WhatsApp: ${escapeHtml(point.phone)}` : ''}</small></div>
      <div class="sidebar-item-actions">
        <button class="edit-item" type="button" data-edit-key="${key}" data-edit-id="${escapeHtml(point.id)}">Editar</button>
        <button class="delete-item" type="button" data-delete-key="${key}" data-delete-id="${escapeHtml(point.id)}">Eliminar</button>
      </div>
    </article>`;
  }).join('') : `<p class="sidebar-empty">Todavía no hay ${key === 'businesses' ? 'negocios' : 'puntos base'}.</p>`;
}

function updateRateFromInput(event) {
  const mapping = {
    'rate-min-cop': 'minimum_cop',
    'rate-extra-km-cop': 'extra_km_cop',
    'rate-cop-usd': 'cop_per_usd',
    'rate-cop-bs': 'cop_per_bs',
  };
  const key = mapping[event.target.id];
  if (!key) return;
  const min = ['cop_per_usd', 'cop_per_bs'].includes(key) ? 0.01 : 0;
  pendingSettings.rates[key] = Math.max(min, Number(event.target.value) || 0);
  updateSaveButtons();
}
$$('#rate-min-cop, #rate-extra-km-cop, #rate-cop-usd, #rate-cop-bs').forEach(input => {
  input.addEventListener('input', updateRateFromInput);
});
on('#profit-mine-percent', 'input', event => {
  const mine = Math.max(0, Math.min(100, Number(event.target.value) || 0));
  pendingSettings.profitSplit.mine = mine;
  pendingSettings.profitSplit.bike = 100 - mine;
  const bikeInput = $('#profit-bike-percent');
  if (bikeInput) bikeInput.value = pendingSettings.profitSplit.bike;
  updateSaveButtons();
});
on('#profit-bike-percent', 'input', event => {
  const bike = Math.max(0, Math.min(100, Number(event.target.value) || 0));
  pendingSettings.profitSplit.bike = bike;
  pendingSettings.profitSplit.mine = 100 - bike;
  const mineInput = $('#profit-mine-percent');
  if (mineInput) mineInput.value = pendingSettings.profitSplit.mine;
  updateSaveButtons();
});
on('#monthly-goal-cop', 'input', event => {
  pendingSettings.monthlyGoal = Math.max(0, Number(event.target.value) || 0);
  updateSaveButtons();
});
on('#rate-tiers', 'input', event => {
  const input = event.target.closest('[data-rate-tier-index]');
  if (!input) return;
  const index = Number(input.dataset.rateTierIndex);
  const field = input.dataset.rateTierField;
  if (!pendingSettings.rates.tiers[index] || !['km', 'price'].includes(field)) return;
  const value = Number(input.value);
  pendingSettings.rates.tiers[index][field] = Number.isFinite(value)
    ? Math.max(field === 'km' ? 0.01 : 0, value) : 0;
  updateSaveButtons();
});
on('#reset-rates', 'click', () => {
  pendingSettings.rates.minimum_cop = defaults.rates.minimum_cop;
  pendingSettings.rates.tiers = cloneData(defaults.rates.tiers);
  pendingSettings.rates.extra_km_cop = defaults.rates.extra_km_cop;
  renderSettings();
  updateSaveButtons();
});
on('#search-region-select', 'change', event => {
  pendingSettings.searchRegion = Object.prototype.hasOwnProperty.call(SEARCH_REGIONS, event.target.value)
    ? event.target.value : DEFAULT_SEARCH_REGION;
  updateSaveButtons();
});
on('#custom-country-codes', 'input', event => {
  pendingSettings.customCountryCodes = event.target.value;
  updateSaveButtons();
});

function validCoordinates(coords) {
  return validPoint(coords)
    && Math.abs(Number(coords.lat)) <= 90
    && Math.abs(Number(coords.lng)) <= 180;
}

function clearPlaceAddFeedback() {
  pendingPlaceDraft = null;
  const feedback = $('#sidebar-place-feedback');
  if (feedback) {
    feedback.replaceChildren();
    feedback.hidden = true;
  }
  const choices = $('#sidebar-place-choices');
  if (choices) {
    choices.replaceChildren();
    choices.hidden = true;
  }
  const fallback = $('#sidebar-place-fallback');
  if (fallback) fallback.hidden = true;
}

function showFrequentPlacePreview(name, link, coords, person = '') {
  if (!validCoordinates(coords)) {
    showFrequentPlaceFallback();
    return;
  }
  pendingPlaceDraft = { name, link, person: String(person || '').trim(), lat: Number(coords.lat), lng: Number(coords.lng) };
  const preview = $('#sidebar-place-feedback');
  if (!preview) return;
  preview.replaceChildren();
  const text = document.createElement('p');
  text.textContent = `📍 Ubicación encontrada: ${pendingPlaceDraft.lat.toFixed(4)}, ${pendingPlaceDraft.lng.toFixed(4)}`;
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'small-primary';
  confirm.dataset.confirmPlaceAdd = 'true';
  confirm.textContent = 'Confirmar y añadir';
  preview.append(text, confirm);
  preview.hidden = false;
  const choices = $('#sidebar-place-choices');
  if (choices) choices.hidden = true;
  const fallback = $('#sidebar-place-fallback');
  if (fallback) fallback.hidden = true;
}

function showFrequentPlaceFallback() {
  pendingPlaceDraft = null;
  const feedback = $('#sidebar-place-feedback');
  if (feedback) feedback.hidden = true;
  const choices = $('#sidebar-place-choices');
  if (choices) choices.hidden = true;
  const fallback = $('#sidebar-place-fallback');
  if (fallback) fallback.hidden = false;
}

async function locateFrequentPlaceFromForm(form) {
  const name = String(form.elements.name.value).trim();
  const person = String(form.elements.person?.value || '').trim();
  const link = String(form.elements.input.value).trim();
  const latitude = String(form.elements.lat.value || '').trim();
  const longitude = String(form.elements.lng.value || '').trim();
  const manualCoordinates = { lat: Number(latitude), lng: Number(longitude) };
  if (!name) {
    showToast('Escribe un nombre para este lugar.');
    form.elements.name.focus();
    return;
  }
  clearPlaceAddFeedback();
  if (latitude && longitude && validCoordinates(manualCoordinates)) {
    showFrequentPlacePreview(name, link || `${latitude}, ${longitude}`, manualCoordinates, person);
    return;
  }
  if (!link) {
    showToast('Escribe una dirección o ingresa latitud y longitud.');
    return;
  }
  const coordinates = parseCoordinates(link);
  if (coordinates) {
    showFrequentPlacePreview(name, link, coordinates, person);
    return;
  }
  const searchButton = form.querySelector('[type="submit"]');
  if (searchButton) {
    searchButton.disabled = true;
    searchButton.textContent = 'Buscando…';
  }
  try {
    const result = await resolveDestination(link);
    if (result.choices?.length > 1) {
      showGeocodeChoices($('#sidebar-place-choices'), result.choices, candidate => {
        showFrequentPlacePreview(name, link, candidate, person);
      });
    } else {
      showFrequentPlacePreview(name, link, result.choices?.[0] || result, person);
    }
  } catch {
    showFrequentPlaceFallback();
  } finally {
    if (searchButton) {
      searchButton.disabled = false;
      searchButton.textContent = 'Añadir lugar';
    }
  }
}

function confirmFrequentPlaceDraft() {
  if (!pendingPlaceDraft || !validCoordinates(pendingPlaceDraft)) {
    showToast('Primero ubica el lugar para poder guardarlo.');
    return;
  }
  const form = $('#sidebar-add-place-form');
  if (!form) return;
  const name = String(form.elements.name.value || '').trim();
  const inputLink = String(form.elements.input.value || '').trim();
  const link = inputLink || `${pendingPlaceDraft.lat}, ${pendingPlaceDraft.lng}`;
  if (!name) {
    showToast('Escribe un nombre para este lugar.');
    form.elements.name.focus();
    return;
  }
  const candidate = {
    ...pendingPlaceDraft,
    name,
    link,
    label: name,
  };
  const duplicate = findNearbyFrequentPlace(candidate, link);
  if (duplicate) {
    const migrated = addCoordinatesToFrequentPlace(duplicate, candidate);
    const person = String(form.elements.person.value || '').trim();
    let personUpdated = false;
    if (person) {
      const matches = saved => (duplicate.id && saved.id === duplicate.id)
        || (frequentPlaceLink(saved) === frequentPlaceLink(duplicate) && frequentPlaceName(saved) === frequentPlaceName(duplicate));
      frequentPlaces.filter(matches).forEach(saved => { saved.persona = person; });
      pendingFrequentPlaces.filter(matches).forEach(saved => { saved.persona = person; });
      saveFrequent();
      queueFirebaseSync(['lugaresFrecuentes']);
      pendingFrequentPlaces = cloneData(frequentPlaces);
      personUpdated = true;
    }
    if (migrated) {
      pendingFrequentPlaces = cloneData(frequentPlaces);
      showToast('Coordenadas guardadas para este lugar');
    } else if (personUpdated) {
      showToast(`Persona asociada: ${person}`);
    } else {
      showToast('Ese lugar ya está guardado.');
    }
    if (migrated || personUpdated) {
      renderSidebar();
      renderFrequentPlaces();
      updateSaveButtons();
    }
    const addForm = $('#sidebar-add-place-form');
    if (addForm) {
      addForm.reset();
      addForm.hidden = true;
    }
    clearPlaceAddFeedback();
    return;
  }
  const place = makeFrequentPlace(name, link, pendingPlaceDraft, {}, form.elements.person.value);
  frequentPlaces.unshift(place);
  frequentPlaces = frequentPlaces.slice(0, 8);
  pendingFrequentPlaces = cloneData(frequentPlaces);
  saveFrequent();
  queueFirebaseSync(['lugaresFrecuentes']);
  pendingPlaceDraft = null;
  form.reset();
  clearPlaceAddFeedback();
  form.hidden = true;
  renderSidebar();
  renderFrequentPlaces();
  updateSaveButtons();
  showToast(`Lugar '${name}' guardado ✅`);
}

let locationMap = null;
let locationMapMarker = null;
let locationMapTarget = null;

function setLocationMapPoint(point) {
  if (!validCoordinates(point) || !locationMap || !locationMapMarker) return;
  const coords = { lat: Number(point.lat), lng: Number(point.lng) };
  locationMapMarker.setLatLng([coords.lat, coords.lng]);
  setText('#location-map-coordinates', `Lat: ${coords.lat.toFixed(4)}, Lng: ${coords.lng.toFixed(4)}`);
}

function closeLocationMap() {
  const modal = $('#location-map-modal');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  locationMapTarget = null;
}

function openPlaceMap(target) {
  const form = target instanceof HTMLFormElement ? target : target.closest('form');
  let kind = 'destination';
  let initialPoint = null;
  if (form?.id === 'sidebar-add-place-form') {
    kind = 'place-add';
    const latitude = $('#sidebar-place-lat')?.value.trim() || '';
    const longitude = $('#sidebar-place-lng')?.value.trim() || '';
    const manualPoint = {
      lat: Number(latitude),
      lng: Number(longitude),
    };
    if (latitude && longitude && validCoordinates(manualPoint)) initialPoint = manualPoint;
  } else if (form?.dataset.editFrequent !== undefined) {
    kind = 'place-edit';
    const coordinates = { lat: Number(form.elements.lat.value), lng: Number(form.elements.lng.value) };
    initialPoint = validCoordinates(coordinates) ? coordinates : parseCoordinates(form.elements.location.value);
  } else if (form?.dataset.addKind || form?.dataset.editPoint) {
    kind = 'managed-point';
    const latitude = form.elements.lat.value.trim();
    const longitude = form.elements.lng.value.trim();
    const point = { lat: Number(form.elements.lat.value), lng: Number(form.elements.lng.value) };
    if (latitude && longitude && validCoordinates(point)) initialPoint = point;
  }

  if (!window.L) {
    showToast('No se pudo cargar el mapa. Revisa tu conexión.');
    return;
  }
  locationMapTarget = { kind, form };
  const center = initialPoint || { lat: 7.77, lng: -72.22 };
  const modal = $('#location-map-modal');
  if (modal) {
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  }
  const searchInput = $('#location-map-search-input');
  if (searchInput) searchInput.value = '';
  const searchResults = $('#location-map-search-results');
  if (searchResults) {
    searchResults.replaceChildren();
    searchResults.hidden = true;
  }

  if (!locationMap) {
    locationMap = window.L.map('location-map-canvas').setView([center.lat, center.lng], 12);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(locationMap);
    locationMapMarker = window.L.marker([center.lat, center.lng], { draggable: true }).addTo(locationMap);
    locationMap.on('click', event => setLocationMapPoint(event.latlng));
    locationMapMarker.on('drag', event => setLocationMapPoint(event.target.getLatLng()));
  } else {
    locationMap.setView([center.lat, center.lng], 12);
    locationMapMarker.setLatLng([center.lat, center.lng]);
  }
  setLocationMapPoint(center);
  requestAnimationFrame(() => locationMap?.invalidateSize());
}

async function searchLocationMap() {
  const input = $('#location-map-search-input');
  if (!input) return;
  const query = input.value.trim();
  if (!query) return;
  const button = $('#location-map-search-button');
  if (button) {
    button.disabled = true;
    button.textContent = 'Buscando…';
  }
  try {
    const result = await resolveDestination(query);
    const candidates = result.choices || [result];
    const results = $('#location-map-search-results');
    if (!results) return;
    results.replaceChildren();
    candidates.forEach(candidate => {
      const option = document.createElement('button');
      option.type = 'button';
      option.textContent = candidate.label;
      option.addEventListener('click', () => {
        locationMap.setView([candidate.lat, candidate.lng], 15);
        setLocationMapPoint(candidate);
        results.hidden = true;
        results.replaceChildren();
      });
      results.append(option);
    });
    results.hidden = candidates.length === 0;
    if (candidates.length === 1) {
      locationMap.setView([candidates[0].lat, candidates[0].lng], 15);
      setLocationMapPoint(candidates[0]);
      results.hidden = true;
    }
  } catch (error) {
    showToast(error.message || 'No se pudo encontrar esa ubicación.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Buscar';
    }
  }
}

function confirmLocationMap() {
  if (!locationMapTarget || !locationMapMarker) return;
  const point = locationMapMarker.getLatLng();
  const coords = { lat: point.lat, lng: point.lng };
  const { kind, form } = locationMapTarget;
  if (kind === 'destination') {
    const input = $('#destination-input');
    if (input) {
      input.value = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } else if (kind === 'place-add') {
    showFrequentPlacePreview(
      String(form.elements.name.value).trim(),
      String(form.elements.input.value).trim(),
      coords,
      String(form.elements.person.value || '').trim(),
    );
  } else if (kind === 'place-edit') {
    form.elements.lat.value = coords.lat.toFixed(6);
    form.elements.lng.value = coords.lng.toFixed(6);
  } else if (kind === 'managed-point') {
    form.elements.lat.value = coords.lat.toFixed(6);
    form.elements.lng.value = coords.lng.toFixed(6);
  }
  closeLocationMap();
}

on('#location-map-close', 'click', closeLocationMap);
on('#location-map-cancel', 'click', closeLocationMap);
on('#location-map-confirm', 'click', confirmLocationMap);
on('#location-map-search-button', 'click', searchLocationMap);
on('#location-map-search-input', 'keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchLocationMap();
  }
});
on('#location-map-modal', 'click', event => {
  if (event.target.id === 'location-map-modal') closeLocationMap();
});
function commitFrequentPlaceEdit(index, name, link, coords, person) {
  const oldPlace = pendingFrequentPlaces[index];
  if (!oldPlace || !name || !validCoordinates(coords)) return;
  const oldName = frequentPlaceName(oldPlace);
  const oldLink = frequentPlaceLink(oldPlace);
  const moved = validPoint(oldPlace)
    && (Number(oldPlace.lat) !== Number(coords.lat) || Number(oldPlace.lng) !== Number(coords.lng));
  const updated = makeFrequentPlace(name, link, coords, moved ? { ...oldPlace, locationLabel: '' } : oldPlace, person);
  pendingFrequentPlaces[index] = updated;
  const committedIndex = frequentPlaces.findIndex(place => oldPlace.id
    ? place.id === oldPlace.id
    : frequentPlaceName(place) === oldName && frequentPlaceLink(place) === oldLink);
  if (committedIndex >= 0) frequentPlaces[committedIndex] = cloneData(updated);
  else frequentPlaces.unshift(cloneData(updated));
  frequentPlaces = frequentPlaces.slice(0, 8);
  pendingFrequentPlaces = cloneData(frequentPlaces);
  editingFrequentPlace = null;
  saveFrequent();
  queueFirebaseSync(['lugaresFrecuentes']);
  renderSidebar();
  renderFrequentPlaces();
  updateSaveButtons();
  showToast('Lugar frecuente actualizado');
}

function addManagedPointToDraft(form, kind, coords) {
  const name = String(form.elements.name.value).trim();
  const phone = String(form.elements.phone?.value || '').trim();
  const hasCoordinates = validCoordinates(coords);
  if (!name || (!hasCoordinates && !(kind === 'businesses' && whatsappPhoneDigits(phone).length >= 7))) {
    showToast(kind === 'businesses'
      ? 'Revisa el nombre y agrega coordenadas o un teléfono válido.'
      : 'Revisa el nombre y las coordenadas.');
    return;
  }
  const point = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name,
    lat: hasCoordinates ? Number(coords.lat) : undefined,
    lng: hasCoordinates ? Number(coords.lng) : undefined,
    ...(kind === 'businesses' ? {
      phone,
      locationLabel: String(coords?.locationLabel || coords?.addressLabel
        || [coords?.shortName, coords?.context].filter(Boolean).join(', ')
        || (coords?.label && coords.label !== 'Destino del mapa' ? coords.label : '')).trim(),
    } : {}),
  };
  settings[kind].push(point);
  pendingSettings[kind] = cloneData(settings[kind]);
  saveSettings();
  queueFirebaseSync([kind === 'businesses' ? 'negocios' : 'puntosBase']);
  form.reset();
  form.hidden = true;
  renderSidebar();
  renderOriginButtons();
  updateSaveButtons();
  showToast(kind === 'businesses' ? 'Negocio guardado ✅' : 'Punto base guardado ✅');
}

const sidebarEl = $('#data-sidebar');
if (sidebarEl) sidebarEl.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.toggleAdd) {
    const formId = target.dataset.toggleAdd === 'business' ? 'sidebar-add-business-form'
      : target.dataset.toggleAdd === 'base' ? 'sidebar-add-base-form' : 'sidebar-add-place-form';
    const form = document.getElementById(formId);
    if (!form) return;
    form.hidden = !form.hidden;
    if (target.dataset.toggleAdd === 'place' && form.hidden) clearPlaceAddFeedback();
    if (!form.hidden) form.querySelector('input')?.focus();
    return;
  }
  if (target.dataset.editKey) {
    editingPoint = { key: target.dataset.editKey, id: target.dataset.editId };
    renderSidebar();
    return;
  }
  if (target.dataset.editPlace !== undefined) {
    editingFrequentPlace = Number(target.dataset.editPlace);
    renderSidebar();
    return;
  }
  if (target.hasAttribute('data-cancel-frequent-edit')) {
    editingFrequentPlace = null;
    renderSidebar();
    return;
  }
  if (target.hasAttribute('data-confirm-place-add')) {
    confirmFrequentPlaceDraft();
    return;
  }
  if (target.id === 'sidebar-place-map-button'
    || target.id === 'sidebar-place-map-direct'
    || target.hasAttribute('data-open-place-map')
    || target.hasAttribute('data-open-location-map')
    || target.hasAttribute('data-map-form')) {
    openPlaceMap(target);
    return;
  }
  if (target.id === 'sidebar-place-manual-button') {
    const manual = $('#sidebar-place-manual-fields');
    if (manual) manual.hidden = false;
    $('#sidebar-place-lat')?.focus();
    return;
  }
  if (target.id === 'sidebar-place-use-coordinates') {
    const form = target.closest('form');
    if (!form) return;
    const latitude = String($('#sidebar-place-lat')?.value || '').trim();
    const longitude = String($('#sidebar-place-lng')?.value || '').trim();
    const coords = { lat: Number(latitude), lng: Number(longitude) };
    if (!latitude || !longitude || !validCoordinates(coords)) {
      showToast('Escribe coordenadas válidas para guardar este lugar.');
      return;
    }
    showFrequentPlacePreview(
      String(form.elements.name.value).trim(),
      String(form.elements.input.value).trim(),
      coords,
      String(form.elements.person.value || '').trim(),
    );
    return;
  }
  if (target.hasAttribute('data-cancel-edit')) {
    editingPoint = null;
    renderSidebar();
    return;
  }
  if (target.dataset.deleteKey) {
    const { deleteKey: key, deleteId: id } = target.dataset;
    settings[key] = settings[key].filter(point => point.id !== id);
    pendingSettings[key] = cloneData(settings[key]);
    saveSettings();
    queueFirebaseSync([key === 'businesses' ? 'negocios' : 'puntosBase']);
    if (editingPoint?.id === id) editingPoint = null;
    if (selectedOrigin?.id === id) {
      selectedOrigin = null;
      routeResult = null;
      const placeholder = $('#fare-placeholder');
      const result = $('#fare-result');
      if (placeholder) placeholder.hidden = false;
      if (result) result.hidden = true;
    }
    renderSidebar();
    renderOriginButtons();
    updateSaveButtons();
    return;
  }
  if (target.dataset.deletePlace !== undefined) {
    const removedIndex = Number(target.dataset.deletePlace);
    const removed = pendingFrequentPlaces[removedIndex];
    if (!removeFrequentPlace(removed)) return;
    if (editingFrequentPlace === removedIndex) editingFrequentPlace = null;
    else if (editingFrequentPlace !== null && editingFrequentPlace > removedIndex) editingFrequentPlace--;
    renderSidebar();
    renderFrequentPlaces();
    updateSaveButtons();
    showToast('Lugar frecuente eliminado');
    return;
  }
  if (target.dataset.captureForm) {
    const button = target;
    const form = button.dataset.captureForm.startsWith('edit-')
      ? button.closest('form')
      : document.getElementById(button.dataset.captureForm);
    if (!form) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Buscando…';
    try {
      const coords = await getCurrentPosition();
      form.elements.lat.value = coords.lat.toFixed(6);
      form.elements.lng.value = coords.lng.toFixed(6);
      updateSaveButtons();
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }
});

if (sidebarEl) sidebarEl.addEventListener('submit', async event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  if (form.id === 'sidebar-add-place-form') {
    const name = String(values.name).trim();
    const link = String(values.input).trim();
    if (!name) return;
    if (link && pendingFrequentPlaces.some(place => frequentPlaceLink(place).toLowerCase() === link.toLowerCase())) {
      showToast('Ese lugar ya está guardado.');
      return;
    }
    await locateFrequentPlaceFromForm(form);
    return;
  }
  if (form.dataset.editFrequent !== undefined) {
    const index = Number(form.dataset.editFrequent);
    const name = String(values.name).trim();
    const person = String(values.person || '').trim();
    const rawLocation = String(values.location).trim();
    if (!name) {
      showToast('Escribe un nombre para este lugar.');
      form.elements.name.focus();
      return;
    }
    const latitude = String(values.lat || '').trim();
    const longitude = String(values.lng || '').trim();
    const oldPlace = pendingFrequentPlaces[index];
    const manualCoordinates = { lat: Number(latitude), lng: Number(longitude) };
    const coordinates = latitude && longitude && validCoordinates(manualCoordinates)
      ? manualCoordinates
      : oldPlace && validPoint(oldPlace) && rawLocation === frequentPlaceLink(oldPlace)
        ? { lat: Number(oldPlace.lat), lng: Number(oldPlace.lng) }
        : parseCoordinates(rawLocation);
    if (coordinates && validCoordinates(coordinates)) {
      commitFrequentPlaceEdit(index, name, rawLocation || `${coordinates.lat}, ${coordinates.lng}`, coordinates, person);
      return;
    }
    if (!name || !rawLocation) {
      showToast('Completa el nombre y una dirección o coordenadas válidas.');
      return;
    }
    try {
      const result = await resolveDestination(rawLocation);
      if (result.choices?.length > 1) {
        showGeocodeChoices(form.querySelector('[data-frequent-edit-choices]'), result.choices, candidate => {
          commitFrequentPlaceEdit(index, name, rawLocation, candidate, person);
        });
      } else {
        commitFrequentPlaceEdit(index, name, rawLocation, result.choices?.[0] || result, person);
      }
    } catch (error) {
      showToast(error.message || 'No pude ubicar esta dirección.');
    }
    return;
  }
  if (form.dataset.editPoint) {
    const key = form.dataset.editPoint;
    const point = settings[key].find(item => item.id === form.dataset.id);
    const latitude = String(values.lat || '').trim();
    const longitude = String(values.lng || '').trim();
    const hasCoordinates = Boolean(latitude && longitude);
    const updated = {
      name: String(values.name).trim(),
      lat: hasCoordinates ? Number(values.lat) : undefined,
      lng: hasCoordinates ? Number(values.lng) : undefined,
      ...(key === 'businesses' ? { phone: String(values.phone || '').trim() } : {}),
    };
    const validLocation = hasCoordinates && validCoordinates(updated);
    const validBusinessContact = key === 'businesses' && whatsappPhoneDigits(updated.phone).length >= 7;
    if (!point || !updated.name
      || (!validLocation && !validBusinessContact)
      || (hasCoordinates && !validLocation)) {
      showToast(key === 'businesses'
        ? 'Revisa el nombre y agrega coordenadas o un teléfono válido.'
        : 'Revisa el nombre y las coordenadas.');
      return;
    }
    if (key === 'businesses') {
      const moved = validLocation && (!validPoint(point)
        || Number(point.lat) !== updated.lat || Number(point.lng) !== updated.lng);
      updated.locationLabel = moved ? '' : point.locationLabel || '';
    }
    Object.assign(point, updated);
    pendingSettings[key] = cloneData(settings[key]);
    editingPoint = null;
    if (selectedOrigin?.id === point.id) selectedOrigin = { ...selectedOrigin, ...point };
    saveSettings();
    queueFirebaseSync([key === 'businesses' ? 'negocios' : 'puntosBase']);
    renderSidebar();
    renderOriginButtons();
    updateSaveButtons();
    showToast('Punto actualizado');
    return;
  }
  if (form.dataset.addKind) {
    const kind = form.dataset.addKind === 'business' ? 'businesses' : 'bases';
    const locationText = String(values.location || '').trim();
    const latitudeText = String(values.lat || '').trim();
    const longitudeText = String(values.lng || '').trim();
    const locationCoordinates = parseCoordinates(locationText);
    const hasManualCoordinates = latitudeText && longitudeText;
    const coords = locationCoordinates || (hasManualCoordinates
      ? { lat: Number(values.lat), lng: Number(values.lng) }
      : null);
    if (coords && validCoordinates(coords)) {
      addManagedPointToDraft(form, kind, coords);
      return;
    }
    if (!locationText) {
      if (kind === 'businesses' && !latitudeText && !longitudeText
        && whatsappPhoneDigits(values.phone).length >= 7) {
        addManagedPointToDraft(form, kind, null);
        return;
      }
      showToast('Añade coordenadas manuales o pega un enlace con ubicación.');
      return;
    }
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Buscando…';
    }
    try {
      const result = await resolveDestination(locationText);
      if (result.choices?.length > 1) {
        showGeocodeChoices(form.querySelector('[data-add-point-choices]'), result.choices, candidate => {
          addManagedPointToDraft(form, kind, candidate);
        });
      } else {
        addManagedPointToDraft(form, kind, result.choices?.[0] || result);
      }
    } catch (error) {
      showToast(error.message || 'No pude ubicar este punto.');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Añadir';
      }
    }
    return;
  }
});

$$('[data-save-changes]').forEach(button => button.addEventListener('click', savePendingChanges));
$$('[data-cancel-changes]').forEach(button => button.addEventListener('click', discardPendingChanges));

function makeBackupPayload() {
  return {
    settings: cloneData(pendingSettings),
    negocios: cloneData(pendingSettings.businesses),
    puntosBase: cloneData(pendingSettings.bases),
    lugaresFrecuentes: cloneData(pendingFrequentPlaces),
    historial: cloneData(history),
  };
}

on('#export-data', 'click', () => {
  const backup = new Blob([JSON.stringify(makeBackupPayload(), null, 2)], { type: 'application/json' });
  const downloadUrl = URL.createObjectURL(backup);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `delivery-app-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  showToast('Respaldo descargado.');
});

on('#import-data', 'click', () => $('#import-file')?.click());
on('#import-file', 'change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    const validPoints = (points, allowContactOnly = false) => Array.isArray(points) && points.every(point => {
      if (!point || typeof point !== 'object' || typeof point.name !== 'string') return false;
      const hasCoordinates = (point.lat !== undefined && point.lat !== null)
        || (point.lng !== undefined && point.lng !== null);
      const hasValidCoordinates = hasCoordinates && validCoordinates(point);
      const contactOnly = allowContactOnly && !hasCoordinates && whatsappPhoneDigits(point.phone).length >= 7;
      return (hasValidCoordinates || contactOnly)
        && (!hasValidCoordinates || (Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lng)) <= 180));
    });
    const validBackup = backup && typeof backup === 'object'
      && backup.settings && typeof backup.settings === 'object' && !Array.isArray(backup.settings)
      && validPoints(backup.negocios, true)
      && validPoints(backup.puntosBase)
      && Array.isArray(backup.lugaresFrecuentes)
      && backup.lugaresFrecuentes.every(place => place && frequentPlaceName(place) && frequentPlaceLink(place))
      && Array.isArray(backup.historial)
      && backup.historial.every(item => item && typeof item === 'object');
    if (!validBackup) throw new Error('El archivo no tiene el formato de respaldo de Delivery app.');
    if (!window.confirm('Importar este respaldo reemplazará los datos actuales. ¿Continuar?')) return;

    const importedSettings = normalizeSettings(backup.settings);
    importedSettings.businesses = backup.negocios;
    importedSettings.bases = backup.puntosBase;
    Object.keys(settings).forEach(key => delete settings[key]);
    Object.assign(settings, importedSettings);
    frequentPlaces = backup.lugaresFrecuentes;
    history = backup.historial.slice(0, 250);
    pendingSettings = cloneData(settings);
    pendingFrequentPlaces = cloneData(frequentPlaces);
    editingPoint = null;
    editingFrequentPlace = null;
    pendingPlaceDraft = null;
    clearPlaceAddFeedback();

    localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
    localStorage.setItem(STORAGE.frequent, JSON.stringify(frequentPlaces));
    localStorage.setItem(STORAGE.history, JSON.stringify(history));
    queueFirebaseSync(['settings', 'lugaresFrecuentes', 'historial']);

    const oldOrigin = selectedOrigin;
    const importedOrigin = oldOrigin?.id && oldOrigin.id !== 'current-location'
      ? [...settings.businesses, ...settings.bases].find(point => point.id === oldOrigin.id)
      : null;
    selectedOrigin = importedOrigin ? { ...oldOrigin, ...importedOrigin } : null;
    routeResult = null;
    const placeholder = $('#fare-placeholder');
    const result = $('#fare-result');
    if (placeholder) placeholder.hidden = false;
    if (result) result.hidden = true;
    renderOriginButtons();
    renderFrequentPlaces();
    renderHistory();
    renderSidebar();
    renderSettings();
    updateSaveButtons();
    showToast('Respaldo importado.');
  } catch (error) {
    showToast(error.message || 'No se pudo importar el archivo.');
  } finally {
    event.target.value = '';
  }
});

// Inicialización final (con protección para que el login siempre arranque).
try {
  setMode(mode);
  renderOriginButtons();
  renderFrequentPlaces();
  renderSidebar();
  renderSettings();
  updateSaveButtons();
} catch (error) {
  console.error('[Init] Error al inicializar la UI:', error);
}

// El login se inicializa fuera del try anterior para que NUNCA se bloquee.
initFirebaseAuthentication().catch(error => {
  console.error('[Auth] Error fatal al inicializar autenticación:', error);
  showLoginScreen('No se pudo conectar con Firebase Authentication. Revisa tu conexión.');
});

if ('serviceWorker' in navigator) {
  firebaseServiceWorkerRegistrationPromise = navigator.serviceWorker.register('./service-worker.js', {
    scope: './',
  }).then(registration => {
    console.info('[FCM] Service Worker registrado:', registration.scope);
    return navigator.serviceWorker.ready;
  }).then(registration => {
    firebaseServiceWorkerRegistration = registration;
    console.info('[FCM] Service Worker activo:', registration.scope);
    return registration;
  }).catch(error => {
    console.error('[FCM] Error al registrar el Service Worker:', error);
    throw error;
  });
  firebaseServiceWorkerRegistrationPromise.catch(() => {});
}