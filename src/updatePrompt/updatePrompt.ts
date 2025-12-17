import './updatePrompt.css';

type DownloadProgressPayload = {
  receivedBytes: number;
  totalBytes?: number;
  percent?: number;
  label?: string;
};

type DownloadErrorPayload = { message: string };

type DownloadCompletePayload = { ok: boolean };

type PromptData =
  | {
      kind: 'update';
      appName: string;
      releaseTag: string;
      body?: string;
      assetName: string;
      expectedBytes?: number;
    }
  | {
      kind: 'error';
      appName: string;
      title: string;
      detail: string;
    };

type MarkedApi = {
  parse: (markdown: string, options?: Record<string, unknown>) => string;
  setOptions?: (options: Record<string, unknown>) => void;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const markedModule = require('./vendor/marked.min.js') as unknown as Partial<MarkedApi> & { marked?: unknown };

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

const getMarked = (): MarkedApi | null => {
  if (markedModule && typeof markedModule.parse === 'function') return markedModule as unknown as MarkedApi;

  const candidate = (globalThis as unknown as { marked?: unknown }).marked;
  if (!candidate || typeof candidate !== 'function') return null;
  const marked = candidate as unknown as MarkedApi;
  if (typeof marked.parse !== 'function') return null;
  return marked;
};

const renderBodyHtmlFallback = (value?: string): string => {
  if (!value) return '';
  const linked = renderTextWithLinks(value);
  const bolded = linked.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const lines = bolded.split(/\r?\n/).map(line => (line.trim() === '' ? '' : `<p>${line}</p>`));
  return lines.join('');
};

const renderBodyHtml = (value?: string): string => {
  if (!value) return '';

  const marked = getMarked();
  if (!marked) return renderBodyHtmlFallback(value);

  // Safety: disable raw HTML by escaping < and > before parsing.
  const safeSource = value.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  try {
    marked.setOptions?.({
      gfm: true,
      breaks: true,
      headerIds: false,
      mangle: false,
    });

    return marked.parse(safeSource, {
      gfm: true,
      breaks: true,
      headerIds: false,
      mangle: false,
    });
  } catch {
    return renderBodyHtmlFallback(value);
  }
};

const setupLinkHandling = (container: HTMLElement) => {
  container.addEventListener('click', event => {
    const target = event.target;
    const anchor = target instanceof HTMLAnchorElement ? target : target instanceof HTMLElement ? target.closest('a') : null;
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const url = anchor.getAttribute('href');
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

window.addEventListener('DOMContentLoaded', async () => {
  const appName = document.getElementById('app-name');
  const title = document.getElementById('prompt-title');
  const meta = document.getElementById('prompt-meta');
  const detail = document.getElementById('prompt-detail');
  const closeButton = document.getElementById('close-button') as HTMLButtonElement | null;
  const primaryAction = document.getElementById('primary-action') as HTMLButtonElement | null;
  const secondaryAction = document.getElementById('secondary-action') as HTMLButtonElement | null;
  const progress = document.getElementById('prompt-progress');
  const progressLabel = document.getElementById('prompt-progress-label');
  const progressBar = document.getElementById('prompt-progress-bar');

  if (!title || !meta || !detail || !primaryAction || !secondaryAction) {
    void window.updatePromptAPI.close();
    return;
  }

  const data = (await window.updatePromptAPI.getData()) as PromptData | null;
  if (!data) {
    void window.updatePromptAPI.close();
    return;
  }

  if (appName) appName.textContent = data.appName;

  let downloadRequested = false;
  let downloaded = false;
  let unsubscribeProgress: (() => void) | null = null;
  let unsubscribeError: (() => void) | null = null;
  let unsubscribeComplete: (() => void) | null = null;
  let unsubscribeInstalling: (() => void) | null = null;
  let unsubscribeInstallError: (() => void) | null = null;

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

  const close = async () => {
    unsubscribeProgress?.();
    unsubscribeError?.();
    unsubscribeComplete?.();
    unsubscribeInstalling?.();
    unsubscribeInstallError?.();
    unsubscribeProgress = null;
    unsubscribeError = null;
    unsubscribeComplete = null;
    unsubscribeInstalling = null;
    unsubscribeInstallError = null;
    await window.updatePromptAPI.close();
  };

  const startDownload = async () => {
    if (downloaded) {
      await startInstall();
      return;
    }
    if (downloadRequested) return;
    downloadRequested = true;

    if (progress) progress.removeAttribute('hidden');
    if (progressLabel) progressLabel.textContent = '準備下載...';
    if (progressBar) progressBar.style.width = '0%';

    primaryAction.disabled = true;
    primaryAction.textContent = '下載中...';
    secondaryAction.disabled = true;

    unsubscribeProgress = window.updatePromptAPI.onDownloadProgress(payload => {
      if (!payload || typeof payload !== 'object') return;
      const percent = (payload as DownloadProgressPayload).percent;
      const label = (payload as DownloadProgressPayload).label;
      if (typeof label === 'string' && progressLabel) progressLabel.textContent = label;
      if (typeof percent === 'number' && Number.isFinite(percent) && progressBar) {
        progressBar.style.width = `${Math.max(0, Math.min(100, percent)).toFixed(1)}%`;
      }
    });

    unsubscribeError = window.updatePromptAPI.onDownloadError(payload => {
      const message =
        payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as DownloadErrorPayload).message)
          : '下載失敗';
      if (progressLabel) progressLabel.textContent = message;
      primaryAction.disabled = false;
      primaryAction.textContent = '重新下載';
      secondaryAction.disabled = false;
      downloadRequested = false;
    });

    unsubscribeComplete = window.updatePromptAPI.onDownloadComplete(payload => {
      if (!payload || typeof payload !== 'object') return;
      if (!(payload as DownloadCompletePayload).ok) return;
      downloaded = true;
      downloadRequested = false;
      primaryAction.disabled = false;
      primaryAction.textContent = '安裝更新';
      secondaryAction.disabled = false;
      if (progressLabel) progressLabel.textContent = '下載完成，可開始安裝';
      if (progressBar) progressBar.style.width = '100%';
    });

    await window.updatePromptAPI.startDownload();
  };

  const startInstall = async () => {
    if (!downloaded) return;

    primaryAction.disabled = true;
    primaryAction.textContent = '安裝中...';
    secondaryAction.disabled = true;

    unsubscribeInstalling = window.updatePromptAPI.onInstalling(() => {
      if (progress) progress.removeAttribute('hidden');
      if (progressLabel) progressLabel.textContent = '啟動安裝程式中...';
    });

    unsubscribeInstallError = window.updatePromptAPI.onInstallError(payload => {
      const message =
        payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as DownloadErrorPayload).message)
          : '啟動安裝程式失敗';
      if (progressLabel) progressLabel.textContent = message;
      primaryAction.disabled = false;
      primaryAction.textContent = '重試安裝';
      secondaryAction.disabled = false;
    });

    await window.updatePromptAPI.install();
  };

  closeButton?.addEventListener('click', () => void close());
  secondaryAction.addEventListener('click', () => void close());
  primaryAction.addEventListener('click', () => void startDownload());

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      void close();
      return;
    }

    if (event.key === 'Enter' && data.kind === 'update') {
      event.preventDefault();
      void startDownload();
    }
  });
});

export {};
