import { app, BrowserWindow, dialog } from 'electron';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as https from 'https';
import type { IncomingMessage } from 'http';
import * as path from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

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
  }>;
}

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

const downloadInstaller = async (url: string, destination: string): Promise<void> => {
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

      const fileStream = fs.createWriteStream(destination);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(err => {
          if (err) {
            cleanupAndReject(err);
            return;
          }
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

const launchInstaller = async (window: BrowserWindow, installerPath: string): Promise<void> => {
  try {
    const child = spawn(installerPath, [], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    app.quit();
  } catch (error) {
    void dialog.showMessageBox(window, {
      type: 'error',
      buttons: ['關閉'],
      message: '啟動安裝程式失敗',
      detail: String(error),
    });
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

  const installerPath = path.join(tmpdir(), `${REPO}-Setup-${normalizedLatestVersion}.exe`);
  await downloadInstaller(asset.browser_download_url, installerPath);
  const { response } = await dialog.showMessageBox(window, {
    type: 'question',
    buttons: ['立即更新', '關閉'],
    defaultId: 0,
    cancelId: 1,
    message: `找到新版 ${release.tag_name}`,
    detail: [release.body, `安裝檔：${ASSET_NAME}`].filter(Boolean).join('\n\n'),
  });

  if (response !== 0) {
    return {
      status: 'update_available_closed',
      currentVersion: normalizedCurrentVersion,
      latestVersion: normalizedLatestVersion,
    };
  }

  await launchInstaller(window, installerPath);
  return {
    status: 'update_available_launching',
    currentVersion: normalizedCurrentVersion,
    latestVersion: normalizedLatestVersion,
  };
};
