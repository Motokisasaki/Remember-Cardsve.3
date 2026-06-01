let deferredInstallPrompt = null;

const installBtn = document.getElementById('installBtn');
const installHelp = document.getElementById('installHelp');
const networkStatus = document.getElementById('networkStatus');

function updateNetworkStatus() {
  if (!networkStatus) return;
  if (navigator.onLine) {
    networkStatus.textContent = 'オンライン: アプリの最新状態を同期できます。';
    networkStatus.classList.remove('offline');
  } else {
    networkStatus.textContent = 'オフライン: キャッシュ済みのカードを利用できます。';
    networkStatus.classList.add('offline');
  }
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./service-worker.js');
  } catch (error) {
    console.error('Service Worker registration failed:', error);
  }
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (installBtn) installBtn.classList.remove('hidden');
  if (installHelp) {
    installHelp.textContent = 'Android/Chromeではこのボタンからホーム画面に追加できます。';
  }
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  if (installBtn) installBtn.classList.add('hidden');
  if (installHelp) {
    installHelp.textContent = 'ホーム画面に追加されました。以後はアプリとして起動できます。';
  }
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      if (installHelp && isIos() && !isInStandaloneMode()) {
        installHelp.textContent = 'iPhoneではSafariの共有メニューから「ホーム画面に追加」を選んでください。';
      }
      return;
    }
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    if (result?.outcome !== 'accepted' && installHelp) {
      installHelp.textContent = 'インストールはキャンセルされました。必要なら再度お試しください。';
    }
    deferredInstallPrompt = null;
    installBtn.classList.add('hidden');
  });
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

updateNetworkStatus();
registerServiceWorker();

if (installHelp && isIos() && !isInStandaloneMode()) {
  installHelp.textContent = 'iPhoneではSafariの共有メニューから「ホーム画面に追加」を選ぶとアプリとして使えます。';
}
