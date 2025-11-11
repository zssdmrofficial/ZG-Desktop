import './home.css';
import { targetWebsites } from '../shared/websites';

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('link-container');
  if (!container) return;

  targetWebsites.forEach(site => {
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

export {};