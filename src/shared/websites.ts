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
    name: '官方網站',
    url: 'http://www.zssdmr.dpdns.org',
    repository: {
      url: 'https://github.com/zssdmrofficial/zssdmrofficial.github.io.git',
      branch: 'main',
      entryFile: 'index.html',
    },
  },
  {
    name: '紅色宇宙論',
    url: 'http://ussr.zssdmr.dpdns.org',
    repository: {
      url: 'https://github.com/zssdmrofficial/ussr.zssdmrofficial.github.io.git',
      branch: 'main',
      entryFile: 'index.html',
    },
  },
  {
    name: '彈珠答題遊戲',
    url: 'http://pinball.zssdmr.dpdns.org',
    repository: {
      url: 'https://github.com/zssdmrofficial/pinball.zssdmrofficial.github.io.git',
      branch: 'main',
      entryFile: 'index.html',
    },
  },
  {
    name: '思想小助手',
    url: 'http://chat.zssdmr.dpdns.org',
    repository: {
      url: 'https://github.com/zssdmrofficial/chat.zssdmrofficial.github.io.git',
      branch: 'main',
      entryFile: 'index.html',
    },
  },
];

export const NAVIGATION_TIMEOUT_MS = 5_000;