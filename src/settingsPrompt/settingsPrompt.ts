import './settingsPrompt.css';

type SettingsPromptData = {
  appName: string;
  appVersion: string;
  autoUpdateEnabled: boolean;
};

type ManualUpdateResponse =
  | { status: 'ok'; result: { status: string; currentVersion: string; latestVersion?: string } }
  | { status: 'error'; message: string };

const setToggleState = (
  toggle: HTMLButtonElement,
  label: HTMLElement | null,
  status: HTMLElement | null,
  enabled: boolean
) => {
  toggle.classList.toggle('is-on', enabled);
  toggle.setAttribute('aria-checked', String(enabled));
  if (label) label.textContent = enabled ? '開啟' : '關閉';
  if (status) {
    status.textContent = enabled
      ? '自動更新已開啟（僅記錄設定偏好）。'
      : '自動更新已關閉（僅記錄設定偏好）。';
  }
};

window.addEventListener('DOMContentLoaded', async () => {
  const appName = document.getElementById('app-name');
  const promptMeta = document.getElementById('prompt-meta');
  const closeButton = document.getElementById('close-button') as HTMLButtonElement | null;
  const closeAction = document.getElementById('close-action') as HTMLButtonElement | null;
  const checkUpdateButton = document.getElementById('settings-check-update') as HTMLButtonElement | null;
  const checkUpdateStatus = document.getElementById('check-update-status');
  const autoUpdateToggle = document.getElementById('auto-update-toggle') as HTMLButtonElement | null;
  const autoUpdateLabel = document.getElementById('auto-update-label');
  const autoUpdateStatus = document.getElementById('auto-update-status');

  const data = (await window.settingsPromptAPI.getData()) as SettingsPromptData | null;
  if (!data) {
    await window.settingsPromptAPI.close();
    return;
  }

  if (appName) appName.textContent = data.appName;
  if (promptMeta) promptMeta.textContent = `版本 ${data.appVersion}`;

  if (autoUpdateToggle) {
    let current = Boolean(data.autoUpdateEnabled);
    setToggleState(autoUpdateToggle, autoUpdateLabel, autoUpdateStatus, current);
    autoUpdateToggle.addEventListener('click', async () => {
      current = await window.settingsPromptAPI.setAutoUpdateEnabled(!current);
      setToggleState(autoUpdateToggle, autoUpdateLabel, autoUpdateStatus, current);
    });
  }

  if (checkUpdateButton) {
    const defaultLabel = checkUpdateButton.textContent ?? '→ 檢查更新';
    checkUpdateButton.dataset.defaultLabel = defaultLabel;

    checkUpdateButton.addEventListener('click', async () => {
      checkUpdateButton.disabled = true;
      checkUpdateButton.textContent = '→ 檢查中...';
      if (checkUpdateStatus) checkUpdateStatus.textContent = '正在檢查更新...';

      try {
        const response = (await window.settingsPromptAPI.checkForUpdates()) as ManualUpdateResponse;
        if (response.status === 'error') {
          checkUpdateButton.textContent = '→ 檢查失敗';
          if (checkUpdateStatus) checkUpdateStatus.textContent = response.message;
          return;
        }

        const { result } = response;
        if (result.status === 'up_to_date') {
          checkUpdateButton.textContent = '→ 已是最新';
          if (checkUpdateStatus) checkUpdateStatus.textContent = `目前版本 ${result.currentVersion}`;
        } else {
          checkUpdateButton.textContent = '→ 有新版';
          if (checkUpdateStatus) {
            checkUpdateStatus.textContent = `找到新版 ${result.latestVersion ?? ''}`.trim();
          }
        }
      } catch (error) {
        console.error('Failed to check for updates', error);
        checkUpdateButton.textContent = '→ 檢查失敗';
        if (checkUpdateStatus) checkUpdateStatus.textContent = String(error);
      } finally {
        setTimeout(() => {
          checkUpdateButton.textContent = checkUpdateButton.dataset.defaultLabel ?? '→ 檢查更新';
          if (checkUpdateStatus) checkUpdateStatus.textContent = '透過手動檢查確認最新版本。';
        }, 2200);
        checkUpdateButton.disabled = false;
      }
    });
  }

  const close = async () => {
    await window.settingsPromptAPI.close();
  };

  closeButton?.addEventListener('click', () => void close());
  closeAction?.addEventListener('click', () => void close());

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      void close();
    }
  });
});

export { };
