// src/renderer.ts
import './index.css';

// 【修正】提供完整的 API 類型定義
declare global {
  interface Window {
    electronAPI: {
      navigate: (url: string) => void;
      goHome: () => void;
      onShowBackButton: (callback: () => void) => void;
      onHideBackButton: (callback: () => void) => void;
      onShowLoadingIndicator: (callback: () => void) => void;
      onHideLoadingIndicator: (callback: () => void) => void;
    };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const backButton = document.getElementById('back-button');
  const loadingIndicator = document.getElementById('loading-indicator');

  if (backButton) {
    backButton.addEventListener('click', () => window.electronAPI.goHome());
    window.electronAPI.onShowBackButton(() => { backButton.style.visibility = 'visible'; });
    window.electronAPI.onHideBackButton(() => { backButton.style.visibility = 'hidden'; });
  }

  if (loadingIndicator) {
    window.electronAPI.onShowLoadingIndicator(() => {
      loadingIndicator.removeAttribute('hidden');
    });
    window.electronAPI.onHideLoadingIndicator(() => {
      loadingIndicator.setAttribute('hidden', '');
    });
  }
});

// 【修正】將此檔案標記為模組，解決 TS2669 錯誤
export {};
