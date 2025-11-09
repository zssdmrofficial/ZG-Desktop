export interface RefreshSummary {
  updated: string[];
  failed: Array<{ site: string; reason: string }>;
}
