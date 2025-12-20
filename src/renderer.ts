import './index.css';

const animateHeaderActionsLayout = (mutate: () => void): void => {
  const container = document.querySelector('.app-header__actions');
  if (!container) return;

  const elements = Array.from(container.querySelectorAll('button')) as HTMLElement[];
  const firstRects = new Map<HTMLElement, DOMRect>();
  for (const element of elements) {
    if (element.hasAttribute('hidden')) continue;
    firstRects.set(element, element.getBoundingClientRect());
  }

  mutate();

  requestAnimationFrame(() => {
    const lastRects = new Map<HTMLElement, DOMRect>();
    for (const element of elements) {
      if (element.hasAttribute('hidden')) continue;
      lastRects.set(element, element.getBoundingClientRect());
    }

    for (const element of elements) {
      const first = firstRects.get(element);
      const last = lastRects.get(element);
      if (!first || !last) continue;
      const dx = first.left - last.left;
      if (Math.abs(dx) < 0.5) continue;

      element.animate(
        [
          { transform: `translateX(${dx}px)` },
          { transform: 'translateX(0)' },
        ],
        { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
      );
    }
  });
};

window.addEventListener('DOMContentLoaded', () => {
  const backButton = document.getElementById('back-button');
  const loadingIndicator = document.getElementById('loading-indicator');
  const refreshButton = document.getElementById('refresh-button') as HTMLButtonElement | null;
  const settingsButton = document.getElementById('settings-button') as HTMLButtonElement | null;
  const offlineIndicator = document.getElementById('offline-indicator');

  if (backButton) {
    backButton.addEventListener('click', () => window.electronAPI.goHome());
    window.electronAPI.onShowBackButton(() => {
      animateHeaderActionsLayout(() => backButton.removeAttribute('hidden'));
    });
    window.electronAPI.onHideBackButton(() => {
      animateHeaderActionsLayout(() => backButton.setAttribute('hidden', ''));
    });
  }

  if (loadingIndicator) {
    window.electronAPI.onShowLoadingIndicator(() => {
      loadingIndicator.removeAttribute('hidden');
    });
    window.electronAPI.onHideLoadingIndicator(() => {
      loadingIndicator.setAttribute('hidden', '');
    });
  }

  if (refreshButton) {
    const defaultLabel = refreshButton.textContent ?? '更新';
    refreshButton.dataset.defaultLabel = defaultLabel;
    refreshButton.title = '更新離線快取';

    refreshButton.addEventListener('click', async () => {
      refreshButton.disabled = true;
      refreshButton.textContent = '更新中...';
      refreshButton.title = '正在更新離線快取...';

      try {
        const summary = await window.electronAPI.refreshOfflineCache();
        if (summary.failed.length === 0) {
          refreshButton.textContent = '已更新';
          refreshButton.title = `已更新 ${summary.updated.length} 個網站`;
        } else {
          refreshButton.textContent = '部分失敗';
          refreshButton.title = `成功 ${summary.updated.length}，失敗 ${summary.failed.length}`;
        }
      } catch (error) {
        console.error('Failed to refresh offline cache', error);
        refreshButton.textContent = '重試';
        refreshButton.title = '更新失敗，請再次嘗試。';
      } finally {
        setTimeout(() => {
          refreshButton.textContent = refreshButton.dataset.defaultLabel ?? '更新';
          refreshButton.title = '更新離線快取';
        }, 2000);
        refreshButton.disabled = false;
      }
    });
  }

  if (settingsButton) {
    settingsButton.addEventListener('click', () => void window.electronAPI.openSettingsPrompt());
  }

  if (offlineIndicator) {
    window.electronAPI.onOfflineMode(() => {
      offlineIndicator.removeAttribute('hidden');
    });
    window.electronAPI.onOnlineMode(() => {
      offlineIndicator.setAttribute('hidden', '');
    });
  }
});

export {};
