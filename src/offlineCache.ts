import * as path from 'path';
import { promises as fs } from 'fs';
import scrape from 'website-scraper';
import type { TargetWebsite } from './shared/websites';
import type { RefreshSummary } from './shared/offlineTypes';

export class OfflineCacheManager {
  private cacheRoot: string | null = null;
  private readonly offlineIndex = new Map<string, string>();
  private readonly originToSite = new Map<string, TargetWebsite>();
  private readonly originToFolder = new Map<string, string>();
  private refreshTask: Promise<RefreshSummary> | null = null;

  constructor(
    private readonly userDataResolver: () => string,
    private readonly websites: TargetWebsite[],
  ) {
    this.websites.forEach(site => {
      const origin = this.getOrigin(site.url);
      this.originToSite.set(origin, site);
      this.originToFolder.set(origin, this.getFolderName(site.url));
    });
  }

  async initializeFromDisk(): Promise<void> {
    const cacheRoot = this.getCacheRoot();
    await fs.mkdir(cacheRoot, { recursive: true });

    await Promise.all(
      this.websites.map(async site => {
        const entryPath = path.join(cacheRoot, this.getFolderName(site.url), 'index.html');
        if (await this.pathExists(entryPath)) {
          this.offlineIndex.set(this.getOrigin(site.url), entryPath);
        }
      }),
    );
  }

  async refreshAllSites(): Promise<RefreshSummary> {
    if (this.refreshTask) {
      return this.refreshTask;
    }

    this.refreshTask = this.downloadAllSites();
    try {
      return await this.refreshTask;
    } finally {
      this.refreshTask = null;
    }
  }

  async getOfflineEntry(url: string): Promise<string | null> {
    const origin = this.getOrigin(url);
    const cachedEntry = this.offlineIndex.get(origin);
    if (cachedEntry && (await this.pathExists(cachedEntry))) {
      return cachedEntry;
    }

    const folder = this.originToFolder.get(origin);
    if (!folder) return null;

    const entryPath = path.join(this.getCacheRoot(), folder, 'index.html');
    if (await this.pathExists(entryPath)) {
      this.offlineIndex.set(origin, entryPath);
      return entryPath;
    }

    return null;
  }

  private async downloadAllSites(): Promise<RefreshSummary> {
    const updated: string[] = [];
    const failed: Array<{ site: string; reason: string }> = [];

    for (const site of this.websites) {
      try {
        await this.downloadSite(site);
        updated.push(site.name);
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        failed.push({ site: site.name, reason });
        console.error(`[OfflineCache] Failed to cache ${site.url}: ${reason}`);
      }
    }

    return { updated, failed };
  }

  private async downloadSite(site: TargetWebsite): Promise<void> {
    const folderName = this.getFolderName(site.url);
    const destination = path.join(this.getCacheRoot(), folderName);
    const tempDestination = `${destination}.tmp`;

    await fs.rm(tempDestination, { recursive: true, force: true });

    try {
      await scrape({
        urls: [site.url],
        directory: tempDestination,
        recursive: true,
        maxDepth: 4,
        defaultFilename: 'index.html',
        request: {
          timeout: {
            request: 10_000,
          },
          headers: {
            'user-agent': 'ZG-Desktop/1.0 (+offline-cache)',
          },
        },
      });

      await fs.rm(destination, { recursive: true, force: true });
      await fs.rename(tempDestination, destination);

      const entryPath = path.join(destination, 'index.html');
      this.offlineIndex.set(this.getOrigin(site.url), entryPath);
    } catch (error) {
      await fs.rm(tempDestination, { recursive: true, force: true });
      throw error;
    }
  }

  private getCacheRoot(): string {
    if (!this.cacheRoot) {
      this.cacheRoot = path.join(this.userDataResolver(), 'offline-cache');
    }
    return this.cacheRoot;
  }

  private getOrigin(url: string): string {
    return new URL(url).origin;
  }

  private getFolderName(url: string): string {
    const hostname = new URL(url).hostname;
    return hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
