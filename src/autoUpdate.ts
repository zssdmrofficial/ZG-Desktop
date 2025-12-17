import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as https from 'https';
import type { IncomingMessage } from 'http';
import * as path from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

declare const UPDATE_PROMPT_WEBPACK_ENTRY: string;
declare const UPDATE_PROMPT_PRELOAD_WEBPACK_ENTRY: string;

const OWNER = 'zssdmrofficial';
const REPO = 'ZG-Desktop';
const ASSET_NAME = 'ZG-Desktop-Setup.exe';
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const USER_AGENT = `${REPO} Auto Updater`;
const MAX_REDIRECTS = 5;

const REQUEST_OPTIONS: https.RequestOptions = {
  headers: {
    'User-Agent': USER_AGENT,
    Accept: 'application/vnd.github.v3+json',
  },
};

interface GitHubRelease {
  tag_name: string;
  body?: string;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size?: number;
  }>;
}

type UpdatePromptAction = 'close';

interface UpdatePromptOutcome {
  action: UpdatePromptAction;
  downloadStarted: boolean;
}

type UpdatePromptData =
  | {
      kind: 'update';
      appName: string;
      releaseTag: string;
      body?: string;
      assetName: string;
      downloadUrl: string;
      expectedBytes?: number;
    }
  | {
      kind: 'error';
      appName: string;
      title: string;
      detail: string;
    };

const updatePromptDataByWebContentsId = new Map<number, UpdatePromptData>();
const updatePromptResolveByWebContentsId = new Map<number, (action: UpdatePromptAction) => void>();
const updatePromptDownloadStartedByWebContentsId = new Map<number, boolean>();
const updatePromptInstallerPathByWebContentsId = new Map<number, string>();
let updatePromptIpcRegistered = false;

const isSafeExternalUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const ensureUpdatePromptIpcRegistered = (): void => {
  if (updatePromptIpcRegistered) return;
  updatePromptIpcRegistered = true;

  ipcMain.handle('update-prompt:get-data', event => {
    return updatePromptDataByWebContentsId.get(event.sender.id) ?? null;
  });

  ipcMain.handle('update-prompt:close', event => {
    const resolve = updatePromptResolveByWebContentsId.get(event.sender.id);
    if (!resolve) return;
    resolve('close');
    updatePromptResolveByWebContentsId.delete(event.sender.id);
    updatePromptDataByWebContentsId.delete(event.sender.id);
    updatePromptDownloadStartedByWebContentsId.delete(event.sender.id);
    updatePromptInstallerPathByWebContentsId.delete(event.sender.id);
    try {
      BrowserWindow.fromWebContents(event.sender)?.close();
    } catch {
      // ignore
    }
  });

  ipcMain.handle('update-prompt:start-download', async event => {
    const webContentsId = event.sender.id;
    const data = updatePromptDataByWebContentsId.get(webContentsId);
    if (!data || data.kind !== 'update') return;

    if (updatePromptDownloadStartedByWebContentsId.get(webContentsId)) return;
    updatePromptDownloadStartedByWebContentsId.set(webContentsId, true);

    const installerPath = path.join(tmpdir(), `${REPO}-Setup-${normalizeVersionString(data.releaseTag) ?? 'latest'}.exe`);

    const sendProgress = (payload: {
      receivedBytes: number;
      totalBytes?: number;
      percent?: number;
      label?: string;
    }) => {
      try {
        event.sender.send('update-prompt:download-progress', payload);
      } catch {
        // ignore (window closed)
      }
    };

    try {
      await downloadInstaller(data.downloadUrl, installerPath, sendProgress);
      updatePromptInstallerPathByWebContentsId.set(webContentsId, installerPath);
      sendProgress({ receivedBytes: 0, totalBytes: 0, percent: 100, label: '下載完成，準備安裝' });
      try {
        event.sender.send('update-prompt:download-complete', { ok: true });
      } catch {
        // ignore
      }
    } catch (error) {
      try {
        event.sender.send('update-prompt:download-error', { message: String(error) });
      } catch {
        // ignore
      }
      updatePromptDownloadStartedByWebContentsId.set(webContentsId, false);
    }
  });

  ipcMain.handle('update-prompt:install', async event => {
    const webContentsId = event.sender.id;
    const installerPath = updatePromptInstallerPathByWebContentsId.get(webContentsId);
    if (!installerPath) return;

    try {
      event.sender.send('update-prompt:installing', { ok: true });
    } catch {
      // ignore
    }

    try {
      await launchInstaller(installerPath);
    } catch (error) {
      try {
        event.sender.send('update-prompt:install-error', { message: String(error) });
      } catch {
        // ignore
      }
    }
  });

  ipcMain.handle('update-prompt:open-external', async (_event, url: string) => {
    if (typeof url !== 'string' || !isSafeExternalUrl(url)) return;
    await shell.openExternal(url);
  });
};

const showUpdatePromptWindow = async (parent: BrowserWindow, data: UpdatePromptData): Promise<UpdatePromptOutcome> => {
  ensureUpdatePromptIpcRegistered();

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/icon.ico')
    : path.join(__dirname, '../../src/assets/icon.ico');

  return new Promise(resolve => {
    let resolved = false;
    const promptWindow = new BrowserWindow({
      width: 760,
      height: 420,
      parent,
      modal: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      frame: false,
      backgroundColor: '#0b0b0e',
      icon: iconPath,
      webPreferences: {
        preload: UPDATE_PROMPT_PRELOAD_WEBPACK_ENTRY,
        contextIsolation: true,
      },
    });

    const webContentsId = promptWindow.webContents.id;

    updatePromptDataByWebContentsId.set(webContentsId, data);
    updatePromptDownloadStartedByWebContentsId.set(webContentsId, false);
    updatePromptInstallerPathByWebContentsId.delete(webContentsId);
    updatePromptResolveByWebContentsId.set(webContentsId, action => {
      if (resolved) return;
      resolved = true;
      resolve({ action, downloadStarted: Boolean(updatePromptDownloadStartedByWebContentsId.get(webContentsId)) });
    });

    const cleanup = () => {
      updatePromptResolveByWebContentsId.delete(webContentsId);
      updatePromptDataByWebContentsId.delete(webContentsId);
      updatePromptDownloadStartedByWebContentsId.delete(webContentsId);
      updatePromptInstallerPathByWebContentsId.delete(webContentsId);
    };

    const finish = (action: UpdatePromptAction) => {
      const downloadStarted = Boolean(updatePromptDownloadStartedByWebContentsId.get(webContentsId));
      cleanup();
      if (!resolved) {
        resolved = true;
        resolve({ action, downloadStarted });
      }
    };

    promptWindow.on('closed', () => finish('close'));
    promptWindow.once('ready-to-show', () => promptWindow.show());

    void promptWindow.loadURL(UPDATE_PROMPT_WEBPACK_ENTRY).catch(error => {
      console.error('[AutoUpdate] Failed to load update prompt', error);
      finish('close');
      try {
        promptWindow.close();
      } catch {
        // ignore
      }
    });
  });
};

const normalizeVersionString = (value: string): string | null => {
  if (!value) return null;
  const trimmed = value.trim().replace(/^v/i, '');
  return trimmed === '' ? null : trimmed;
};

const parseVersionSegments = (value: string): number[] | null => {
  const segments = value.split('.');
  const parsed: number[] = [];
  for (const segment of segments) {
    const digitsMatch = segment.match(/^\d+/);
    if (!digitsMatch) {
      return null;
    }
    parsed.push(Number.parseInt(digitsMatch[0], 10));
  }
  return parsed;
};

const compareVersionSegments = (left: number[], right: number[]): number => {
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const leftValue = left[i] ?? 0;
    const rightValue = right[i] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }
  return 0;
};

const isNormalizedVersionNewer = (latest: string, current: string): boolean => {
  const latestSegments = parseVersionSegments(latest);
  if (!latestSegments) {
    console.warn('[AutoUpdate] 無法解析 release 版本', latest);
    return false;
  }
  const currentSegments = parseVersionSegments(current);
  if (!currentSegments) {
    console.warn('[AutoUpdate] 無法解析目前版本', current);
    return false;
  }
  return compareVersionSegments(latestSegments, currentSegments) > 0;
};

const getResponse = (url: string, redirectCount = 0): Promise<IncomingMessage> => {
  return new Promise((resolve, reject) => {
    const request = https.get(url, REQUEST_OPTIONS, response => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        request.destroy();
        response.resume();
        if (redirectCount >= MAX_REDIRECTS) {
          reject(new Error('追蹤重新導向次數超過限制'));
          return;
        }
        const nextUrl = new URL(response.headers.location, url).toString();
        void getResponse(nextUrl, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      resolve(response);
    });
    request.on('error', reject);
  });
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await getResponse(url);
  const body = await new Promise<string>((resolve, reject) => {
    const buffers: Buffer[] = [];
    response.on('data', (chunk: Buffer) => buffers.push(Buffer.from(chunk)));
    response.on('end', () => resolve(Buffer.concat(buffers).toString('utf8')));
    response.on('error', (error: Error) => reject(error));
  });

  if (response.statusCode && response.statusCode >= 400) {
    throw new Error(`GitHub 回傳 ${response.statusCode}: ${body}`);
  }

  return JSON.parse(body) as T;
};

const fetchLatestRelease = async (): Promise<GitHubRelease> => {
  return fetchJson<GitHubRelease>(API_URL);
};

const downloadInstaller = async (
  url: string,
  destination: string,
  onProgress?: (payload: { receivedBytes: number; totalBytes?: number; percent?: number; label?: string }) => void
): Promise<void> => {
  if (fs.existsSync(destination)) {
    await fsPromises.unlink(destination);
  }

  await new Promise<void>((resolve, reject) => {
    const cleanupAndReject = (error: Error) => {
      fsPromises
        .unlink(destination)
        .catch(() => undefined)
        .finally(() => reject(error));
    };

    const run = async () => {
      const response = await getResponse(url);
      if (response.statusCode !== 200) {
        cleanupAndReject(new Error(`下載失敗：GitHub 回傳 ${response.statusCode}`));
        return;
      }

      const totalBytesHeader = response.headers['content-length'];
      const totalBytes =
        typeof totalBytesHeader === 'string' ? Number.parseInt(totalBytesHeader, 10) : undefined;

      let receivedBytes = 0;
      let lastEmit = 0;
      const emit = (force = false) => {
        if (!onProgress) return;
        const now = Date.now();
        if (!force && now - lastEmit < 120) return;
        lastEmit = now;
        const percent = totalBytes && totalBytes > 0 ? Math.min(100, (receivedBytes / totalBytes) * 100) : undefined;
        onProgress({
          receivedBytes,
          totalBytes,
          percent,
          label: percent !== undefined ? `下載中... ${percent.toFixed(1)}%` : '下載中...',
        });
      };

      const fileStream = fs.createWriteStream(destination);

      response.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length;
        emit();
      });

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(err => {
          if (err) {
            cleanupAndReject(err);
            return;
          }
          emit(true);
          resolve();
        });
      });

      response.on('error', (error: Error) => {
        cleanupAndReject(error);
      });

      fileStream.on('error', (error: Error) => {
        cleanupAndReject(error);
      });
    };

    void run().catch(error => cleanupAndReject(error instanceof Error ? error : new Error(String(error))));
  });
};

const launchInstaller = async (installerPath: string): Promise<void> => {
  try {
    const child = spawn(installerPath, [], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    app.quit();
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
};

export type ManualUpdateStatus =
  | 'up_to_date'
  | 'update_available_closed'
  | 'update_available_launching';

export interface ManualUpdateResult {
  status: ManualUpdateStatus;
  currentVersion: string;
  latestVersion?: string;
}

export const checkForUpdateOnce = async (window: BrowserWindow): Promise<ManualUpdateResult> => {
  const release = await fetchLatestRelease();

  if (release.draft || release.prerelease) {
    return { status: 'up_to_date', currentVersion: app.getVersion() };
  }

  const normalizedLatestVersion = normalizeVersionString(release.tag_name);
  if (!normalizedLatestVersion) {
    console.warn('[AutoUpdate] 無法解析 tag', release.tag_name);
    return { status: 'up_to_date', currentVersion: app.getVersion() };
  }

  const normalizedCurrentVersion = normalizeVersionString(app.getVersion());
  if (!normalizedCurrentVersion) {
    console.warn('[AutoUpdate] 無法解析目前版本', app.getVersion());
    return { status: 'up_to_date', currentVersion: app.getVersion() };
  }

  if (!isNormalizedVersionNewer(normalizedLatestVersion, normalizedCurrentVersion)) {
    return {
      status: 'up_to_date',
      currentVersion: normalizedCurrentVersion,
      latestVersion: normalizedLatestVersion,
    };
  }

  const asset = release.assets.find(item => item.name === ASSET_NAME);
  if (!asset) {
    return {
      status: 'up_to_date',
      currentVersion: normalizedCurrentVersion,
      latestVersion: normalizedLatestVersion,
    };
  }

  const outcome = await showUpdatePromptWindow(window, {
    kind: 'update',
    appName: REPO,
    releaseTag: release.tag_name,
    body: release.body,
    assetName: ASSET_NAME,
    downloadUrl: asset.browser_download_url,
    expectedBytes: asset.size,
  });

  return {
    status: outcome.downloadStarted ? 'update_available_launching' : 'update_available_closed',
    currentVersion: normalizedCurrentVersion,
    latestVersion: normalizedLatestVersion,
  };
};
