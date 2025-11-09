export interface TargetWebsite {
  name: string;
  url: string;
}

export const targetWebsites: TargetWebsite[] = [
  { name: 'www.zssdmr.dpdns.org', url: 'http://www.zssdmr.dpdns.org' },
  { name: 'ussr.zssdmr.dpdns.org', url: 'http://ussr.zssdmr.dpdns.org' },
  { name: 'pinball.zssdmr.dpdns.org', url: 'http://pinball.zssdmr.dpdns.org' },
];

export const NAVIGATION_TIMEOUT_MS = 10_000;
