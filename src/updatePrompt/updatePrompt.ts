import './updatePrompt.css';

type PromptAction = 'update' | 'close';

type PromptData =
  | {
      kind: 'update';
      appName: string;
      releaseTag: string;
      body?: string;
      assetName: string;
    }
  | {
      kind: 'error';
      appName: string;
      title: string;
      detail: string;
    };

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, char => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });

const renderTextWithLinks = (value: string): string => {
  const escaped = escapeHtml(value);
  const urlPattern = /\bhttps?:\/\/[^\s<]+/gi;
  return escaped.replace(urlPattern, url => `<a href="${url}" rel="noreferrer noopener">${url}</a>`);
};

const renderBodyHtml = (value?: string): string => {
  if (!value) return '';
  const linked = renderTextWithLinks(value);
  const bolded = linked.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const lines = bolded.split(/\r?\n/).map(line => (line.trim() === '' ? '' : `<p>${line}</p>`));
  return lines.join('');
};

const setupLinkHandling = (container: HTMLElement) => {
  container.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLAnchorElement)) return;
    const url = target.getAttribute('href');
    if (!url) return;
    event.preventDefault();
    void window.updatePromptAPI.openExternal(url);
  });
};

const setButtons = (
  primary: HTMLButtonElement,
  secondary: HTMLButtonElement,
  config: { primaryLabel?: string; secondaryLabel: string; primaryDisabled?: boolean }
) => {
  if (config.primaryLabel) {
    primary.textContent = `→ ${config.primaryLabel}`;
    primary.removeAttribute('hidden');
  } else {
    primary.textContent = '';
    primary.setAttribute('hidden', '');
  }
  secondary.textContent = `→ ${config.secondaryLabel}`;
  secondary.removeAttribute('hidden');
  primary.disabled = Boolean(config.primaryDisabled);
};

const act = async (action: PromptAction, primaryButton?: HTMLButtonElement) => {
  if (action === 'update' && primaryButton) {
    primaryButton.disabled = true;
    primaryButton.textContent = '啟動中...';
  }
  await window.updatePromptAPI.action(action);
};

window.addEventListener('DOMContentLoaded', async () => {
  const appName = document.getElementById('app-name');
  const title = document.getElementById('prompt-title');
  const meta = document.getElementById('prompt-meta');
  const detail = document.getElementById('prompt-detail');
  const closeButton = document.getElementById('close-button') as HTMLButtonElement | null;
  const primaryAction = document.getElementById('primary-action') as HTMLButtonElement | null;
  const secondaryAction = document.getElementById('secondary-action') as HTMLButtonElement | null;

  if (!title || !meta || !detail || !primaryAction || !secondaryAction) {
    void window.updatePromptAPI.action('close');
    return;
  }

  const data = (await window.updatePromptAPI.getData()) as PromptData | null;
  if (!data) {
    void window.updatePromptAPI.action('close');
    return;
  }

  if (appName) appName.textContent = data.appName;

  if (data.kind === 'update') {
    title.textContent = `找到新版 ${data.releaseTag}`;
    meta.innerHTML = `<div>安裝檔：<code>${escapeHtml(data.assetName)}</code></div>`;
    detail.innerHTML = renderBodyHtml(data.body) || '<p>尚未提供更新說明。</p>';
    setButtons(primaryAction, secondaryAction, { primaryLabel: '立即更新', secondaryLabel: '關閉' });
  } else {
    title.textContent = data.title;
    meta.innerHTML = '';
    detail.innerHTML = `<p>${renderTextWithLinks(data.detail)}</p>`;
    setButtons(primaryAction, secondaryAction, { secondaryLabel: '關閉' });
  }

  setupLinkHandling(detail);

  closeButton?.addEventListener('click', () => void act('close'));
  secondaryAction.addEventListener('click', () => void act('close'));
  primaryAction.addEventListener('click', () => void act('update', primaryAction));

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      void act('close');
      return;
    }

    if (event.key === 'Enter' && data.kind === 'update') {
      event.preventDefault();
      void act('update', primaryAction);
    }
  });
});

export {};
