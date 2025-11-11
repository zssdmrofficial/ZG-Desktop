export interface RepositorySource {
  url: string;
  branch?: string;
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

export const NAVIGATION_TIMEOUT_MS = 5_000;