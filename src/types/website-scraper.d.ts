declare module 'website-scraper' {
  type TimeoutOption = number | { request?: number; connect?: number; socket?: number };

  interface ScrapeRequestOptions {
    timeout?: TimeoutOption;
    headers?: Record<string, string>;
  }

  interface ScrapeOptions {
    urls: Array<string | { url: string }>;
    directory: string;
    recursive?: boolean;
    maxDepth?: number;
    defaultFilename?: string;
    request?: ScrapeRequestOptions;
    subdirectories?: Array<{ directory: string; extensions: string[] }>;
  }

  export default function scrape(options: ScrapeOptions): Promise<void>;
}
