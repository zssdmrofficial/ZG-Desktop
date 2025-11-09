import * as path from 'path';
import * as https from 'https';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import AdmZip from 'adm-zip';
import type { TargetWebsite } from './shared/websites';
import type { RefreshSummary } from './shared/offlineTypes';

const execFileAsync = promisify(execFile);

export class OfflineCacheManager {
  private cacheRoot: string | null = null;
  private readonly offlineIndex = new Map<string, string>();
  private readonly originToSite = new Map<string, TargetWebsite>();
  private readonly originToFolder = new Map<string, string>();
  private readonly hostToFolder = new Map<string, string>();
  private gitAvailable: boolean | null = null;
  private refreshTask: Promise<RefreshSummary> | null = null;

  constructor(
    private readonly userDataResolver: () => string,
    private readonly websites: TargetWebsite[],
  ) {
    this.websites.forEach(site => {
      const siteUrl = new URL(site.url);
      const origin = siteUrl.origin;
      const folderName = this.getFolderName(site.url);
      this.originToSite.set(origin, site);
      this.originToFolder.set(origin, folderName);
      this.hostToFolder.set(siteUrl.host, folderName);
    });
  }

  async initializeFromDisk(): Promise<void> {
    const cacheRoot = this.getCacheRoot();
    await fs.mkdir(cacheRoot, { recursive: true });

    await Promise.all(
      this.websites.map(async site => {
        const entryPath = path.join(cacheRoot, this.getFolderName(site.url), this.getEntryFile(site));
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

    this.refreshTask = this.synchronizeAllSites();
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

    const site = this.originToSite.get(origin);
    const entryFile = site ? this.getEntryFile(site) : 'index.html';
    const entryPath = path.join(this.getCacheRoot(), folder, entryFile);
    if (await this.pathExists(entryPath)) {
      this.offlineIndex.set(origin, entryPath);
      return entryPath;
    }

    return null;
  }

  private async synchronizeAllSites(): Promise<RefreshSummary> {
    const updated: string[] = [];
    const failed: Array<{ site: string; reason: string }> = [];

    for (const site of this.websites) {
      try {
        await this.syncSite(site);
        updated.push(site.name);
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        failed.push({ site: site.name, reason });
        console.error(`[OfflineCache] Failed to cache ${site.url}: ${reason}`);
      }
    }

    return { updated, failed };
  }

  private async syncSite(site: TargetWebsite): Promise<void> {
    const cacheRoot = this.getCacheRoot();
    await fs.mkdir(cacheRoot, { recursive: true });

    const folderName = this.getFolderName(site.url);
    const destination = path.join(cacheRoot, folderName);
    const tempDestination = `${destination}.tmp`;

    await fs.rm(tempDestination, { recursive: true, force: true });

    try {
      if (await this.hasGit()) {
        await this.syncWithGit(site, destination, tempDestination);
      } else {
        await this.syncViaGithubArchive(site, destination, tempDestination);
      }

      const entryPath = path.join(destination, this.getEntryFile(site));
      if (!(await this.pathExists(entryPath))) {
        throw new Error(`Entry file not found at ${entryPath}`);
      }
      this.offlineIndex.set(this.getOrigin(site.url), entryPath);
    } finally {
      await fs.rm(tempDestination, { recursive: true, force: true });
    }
  }

  private async hasGit(): Promise<boolean> {
    if (this.gitAvailable !== null) {
      return this.gitAvailable;
    }

    try {
      await execFileAsync('git', ['--version']);
      this.gitAvailable = true;
    } catch {
      this.gitAvailable = false;
      console.warn('[OfflineCache] Git executable not found. Falling back to GitHub archive downloads.');
    }

    return this.gitAvailable;
  }

  private async syncWithGit(site: TargetWebsite, destination: string, tempDestination: string): Promise<void> {
    const { url, branch = 'main' } = site.repository;
    const repoExists = await this.isGitRepository(destination);

    if (!repoExists) {
      await this.cloneFreshRepository(url, branch, destination, tempDestination);
      return;
    }

    try {
      await this.runGitCommand(['fetch', '--depth', '1', 'origin', branch], destination);
      await this.runGitCommand(['checkout', '--force', '-B', branch, `origin/${branch}`], destination);
    } catch (error) {
      if (error instanceof Error && /not a git repository/i.test(error.message)) {
        await this.cloneFreshRepository(url, branch, destination, tempDestination);
        return;
      }
      throw error;
    }
  }

  private async cloneFreshRepository(
    url: string,
    branch: string,
    destination: string,
    tempDestination: string,
  ): Promise<void> {
    await fs.rm(tempDestination, { recursive: true, force: true });
    await this.runGitCommand(['clone', '--depth', '1', '--single-branch', '--branch', branch, url, tempDestination]);
    await fs.rm(destination, { recursive: true, force: true });
    await fs.rename(tempDestination, destination);
  }

  private async runGitCommand(args: string[], cwd?: string): Promise<void> {
    try {
      await execFileAsync('git', args, { cwd });
    } catch (error) {
      const command = `git ${args.join(' ')}`;
      throw new Error(
        `Failed to execute "${command}"${cwd ? ` (cwd: ${cwd})` : ''}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async syncViaGithubArchive(site: TargetWebsite, destination: string, tempDestination: string): Promise<void> {
    const branch = site.repository.branch ?? 'main';
    const { owner, repo } = this.parseGithubRepo(site.repository.url);
    const archiveUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`;

    const archiveBuffer = await this.downloadArchiveBuffer(archiveUrl);
    const zip = new AdmZip(archiveBuffer);

    await fs.rm(tempDestination, { recursive: true, force: true });
    await fs.mkdir(tempDestination, { recursive: true });
    zip.extractAllTo(tempDestination, true);

    const extractedRoot = await this.findFirstDirectory(tempDestination);
    if (!extractedRoot) {
      throw new Error('Failed to locate extracted repository folder inside archive.');
    }

    await fs.rm(destination, { recursive: true, force: true });
    await fs.rename(extractedRoot, destination);
  }

  private parseGithubRepo(repoUrl: string): { owner: string; repo: string } {
    const sanitized = repoUrl.trim();
    const httpsMatch = sanitized.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    const sshMatch = sanitized.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    throw new Error(`Unsupported GitHub repository URL: ${repoUrl}`);
  }

  private async findFirstDirectory(target: string): Promise<string | null> {
    const entries = await fs.readdir(target, { withFileTypes: true });
    const dirEntry = entries.find(entry => entry.isDirectory());
    return dirEntry ? path.join(target, dirEntry.name) : null;
  }

  private async downloadArchiveBuffer(url: string, redirectCount = 0): Promise<Buffer> {
    if (redirectCount > 5) {
      throw new Error('Too many redirects while downloading archive.');
    }

    return new Promise<Buffer>((resolve, reject) => {
      https
        .get(url, response => {
          const { statusCode, headers } = response;
          if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location) {
            response.resume();
            this.downloadArchiveBuffer(headers.location, redirectCount + 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (statusCode !== 200) {
            response.resume();
            reject(new Error(`Failed to download archive from ${url}. Status code: ${statusCode ?? 'unknown'}`));
            return;
          }

          const chunks: Buffer[] = [];
          response.on('data', chunk => {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          });
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        })
        .on('error', reject);
    });
  }

  private getCacheRoot(): string {
    if (!this.cacheRoot) {
      this.cacheRoot = path.join(this.userDataResolver(), 'offline-cache');
    }
    return this.cacheRoot;
  }

  private getEntryFile(site: TargetWebsite): string {
    return site.repository.entryFile ?? 'index.html';
  }

  private async isGitRepository(folder: string): Promise<boolean> {
    return this.pathExists(path.join(folder, '.git'));
  }

  private getOrigin(url: string): string {
    return new URL(url).origin;
  }

  private getFolderName(url: string): string {
    const hostname = new URL(url).hostname;
    return hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
  }

  getSiteRootForOrigin(origin: string): string | null {
    const folder = this.originToFolder.get(origin);
    return folder ? path.join(this.getCacheRoot(), folder) : null;
  }

  getSiteRootForHost(host: string): string | null {
    const folder = this.hostToFolder.get(host);
    return folder ? path.join(this.getCacheRoot(), folder) : null;
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
