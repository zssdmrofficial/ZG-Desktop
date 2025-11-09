export interface RepositorySource {
  /**
   * Full Git clone URL, e.g. https://github.com/org/repo.git
   */
  url: string;
  /**
   * Branch to checkout. Defaults to `main` when omitted.
   */
  branch?: string;
  /**
   * Entry file relative to the repository root used for offline browsing.
   * Defaults to `index.html`.
   */
  entryFile?: string;
}

export interface TargetWebsite {
  name: string;
  url: string;
  repository: RepositorySource;
}

export const targetWebsites: TargetWebsite[] = [
  {
    name: 'www.zssdmr.dpdns.org',
    url: 'http://www.zssdmr.dpdns.org',
    repository: {
      url: 'https://github.com/zssdmrofficial/zssdmrofficial.github.io.git',
      branch: 'main',
      entryFile: 'index.html',
    },
  },
  {
    name: 'ussr.zssdmr.dpdns.org',
    url: 'http://ussr.zssdmr.dpdns.org',
    repository: {
      url: 'https://github.com/zssdmrofficial/ussr.zssdmrofficial.github.io.git',
      branch: 'main',
      entryFile: 'index.html',
    },
  },
  {
    name: 'pinball.zssdmr.dpdns.org',
    url: 'http://pinball.zssdmr.dpdns.org',
    repository: {
      url: 'https://github.com/zssdmrofficial/pinball.zssdmrofficial.github.io.git',
      branch: 'main',
      entryFile: 'index.html',
    },
  },
];

export const NAVIGATION_TIMEOUT_MS = 10_000;
