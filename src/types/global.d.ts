import type { RefreshSummary } from '../shared/offlineTypes';
import type { ManualUpdateResult } from '../autoUpdate';

declare global {
  interface Window {
    electronAPI: {
      navigate: (url: string) => void;
      goHome: () => void;
      refreshOfflineCache: () => Promise<RefreshSummary>;
      checkForUpdates: () => Promise<
        | { status: 'ok'; result: ManualUpdateResult }
        | { status: 'error'; message: string }
      >;
      onShowBackButton: (callback: () => void) => void;
      onHideBackButton: (callback: () => void) => void;
      onShowLoadingIndicator: (callback: () => void) => void;
      onHideLoadingIndicator: (callback: () => void) => void;
      onOfflineMode: (callback: () => void) => void;
      onOnlineMode: (callback: () => void) => void;
    };
    updatePromptAPI: {
      getData: () => Promise<unknown>;
      close: () => Promise<void>;
      startDownload: () => Promise<void>;
      install: () => Promise<void>;
      openExternal: (url: string) => Promise<void>;
      onDownloadProgress: (callback: (payload: unknown) => void) => () => void;
      onDownloadError: (callback: (payload: unknown) => void) => () => void;
      onDownloadComplete: (callback: (payload: unknown) => void) => () => void;
      onInstalling: (callback: (payload: unknown) => void) => () => void;
      onInstallError: (callback: (payload: unknown) => void) => () => void;
    };
  }
}

declare module '*.css' {
  const classes: { [key: string]: string };
  export default classes;
}

export {};
