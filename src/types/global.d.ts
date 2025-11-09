import type { RefreshSummary } from '../shared/offlineTypes';

declare global {
  interface Window {
    electronAPI: {
      navigate: (url: string) => void;
      goHome: () => void;
      refreshOfflineCache: () => Promise<RefreshSummary>;
      onShowBackButton: (callback: () => void) => void;
      onHideBackButton: (callback: () => void) => void;
      onShowLoadingIndicator: (callback: () => void) => void;
      onHideLoadingIndicator: (callback: () => void) => void;
      onOfflineMode: (callback: () => void) => void;
      onOnlineMode: (callback: () => void) => void;
    };
  }
}

declare module '*.css' {
  const classes: { [key: string]: string };
  export default classes;
}

export {};
