// src/home/home.ts
import './home.css';

// 【修正】提供完整的 API 類型定義
declare global {
  interface Window {
    electronAPI: {
      navigate: (url: string) => void;
      goHome: () => void;
      onShowBackButton: (callback: () => void) => void;
      onHideBackButton: (callback: () => void) => void;
    };
  }
}

const websites = [
    { name: 'www.zssdmr.dpdns.org', url: 'http://www.zssdmr.dpdns.org' },
    { name: 'ussr.zssdmr.dpdns.org', url: 'http://ussr.zssdmr.dpdns.org' },
    { name: 'pinball.zssdmr.dpdns.org', url: 'http://pinball.zssdmr.dpdns.org' },
];

window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('link-container');
    if (!container) return;
    websites.forEach(site => {
        const button = document.createElement('button');
        button.textContent = site.name;
        button.addEventListener('click', () => {
            if (window.electronAPI) {
                window.electronAPI.navigate(site.url);
            }
        });
        container.appendChild(button);
    });
});

// 【修正】將此檔案標記為模組，解決 TS2669 錯誤
export {};