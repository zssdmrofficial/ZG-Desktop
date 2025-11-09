# ZG-Desktop

張國官網桌面板應用程式，支援線上瀏覽與離線快取功能。
- 嘗試直接載入線上網站；若逾時或錯誤，自動切換到本機離線快取。
- 可在應用內一鍵更新離線快取。
- 具備返回首頁、載入中與離線狀態指示。


## 功能特色
- 線上/離線自動切換：導覽逾時（預設 5 秒）或載入失敗時，改用離線副本。
- 一鍵更新快取：點擊「刷新離線快取」即可同步所有站台的最新內容。
- 清楚的 UI 指示：顯示「載入中」與「離線」徽章，並可快速「返回首頁」。
- 安全隔離：外部頁面於 `BrowserView`，並啟用 `contextIsolation`；預載（preload）僅暴露必要 API。
- 自訂離線協定：以 `app-offline://` 讀取離線檔案，且嚴格限制在快取根目錄內。


## 內建站台
站台清單定義於 `src/shared/websites.ts`：
- `http://www.zssdmr.dpdns.org`
- `http://ussr.zssdmr.dpdns.org`
- `http://pinball.zssdmr.dpdns.org`

可依需求自行增減與調整（見「自訂/新增網站」）。


## 開發與執行
先決條件：
- Node.js 18+（建議 LTS）
- npm
- Git（可選，用於較快且增量的同步；未安裝時會改用 GitHub 壓縮檔下載）
- 首次同步離線快取需要網路連線

安裝相依：
```bash
npm install
```

開發模式（啟動 Electron Forge）：
```bash
npm start
```

打包（產生安裝包/可執行檔）：
```bash
npm run make
```

程式碼檢查：
```bash
npm run lint
```


## 使用說明
1. 啟動應用後，在首頁選擇欲開啟的站台。
2. 若線上載入成功則直接顯示；若逾時（`NAVIGATION_TIMEOUT_MS`，預設 5000ms）或發生錯誤，會自動切換到離線副本。
3. 右上角顯示載入中/離線狀態徽章。
4. 可隨時點擊「返回首頁」。
5. 需要更新離線內容時，點擊「刷新離線快取」。


## 離線快取機制
- 快取根目錄：`<使用者資料夾>/offline-cache`（實際路徑依作業系統由 `app.getPath('userData')` 決定）。
- 同步策略：
  - 具備 Git：以 `git clone/fetch/checkout` 進行增量同步。
  - 無 Git：改以 `https://codeload.github.com/...` 下載壓縮檔並解壓。
- 入口檔案：每個站台可在設定中指定 `entryFile`（預設 `index.html`）。
- 自訂協定：`app-offline://<host>/<encoded-path>`，後端嚴格檢查路徑避免目錄跳脫，僅能存取對應站台快取根目錄下的檔案。


## 自訂/新增網站
編輯 `src/shared/websites.ts`，依介面新增一筆設定：

```ts
export interface TargetWebsite {
  name: string;
  url: string; // 用於線上導覽與離線映射（以 origin 辨識）
  repository: {
    url: string;      // Git (HTTPS 或 SSH) 倉庫 URL（亦可為 .git 結尾）
    branch?: string;  // 預設 main
    entryFile?: string; // 預設 index.html
  };
}

export const targetWebsites: TargetWebsite[] = [
  {
    name: 'example.com',
    url: 'https://example.com',
    repository: {
      url: 'https://github.com/your/repo.git',
      branch: 'main',
      entryFile: 'public/index.html',
    },
  },
];
```

注意事項：
- `url` 的「origin」會對應離線快取資料夾與協定的 host；請與實際網站一致。
- `entryFile` 必須存在於同步完成後的快取資料夾中，否則會被判定為離線入口缺失。


## 技術架構
- Electron 39、TypeScript 5
- Electron Forge 7（Webpack 插件）
- Webpack、`ts-loader`、`fork-ts-checker-webpack-plugin`
- `adm-zip`（處理 GitHub 壓縮檔）

主要檔案：
- 主程序：`src/index.ts`（視窗/BrowserView 管理、導覽與離線協定註冊）
- Preload：`src/preload.ts`（僅暴露必要 IPC API）
- Renderer：`src/renderer.ts`、`src/index.html`、`src/index.css`
- 首頁：`src/home/home.html`、`src/home/home.ts`、`src/home/home.css`
- 離線快取：`src/offlineCache.ts`、型別：`src/shared/offlineTypes.ts`
- 站台設定：`src/shared/websites.ts`
- Forge/打包：`forge.config.ts`、`webpack.*.ts`


## 打包與圖示
- 應用圖示與資源置於 `src/assets/`，Forge 會在打包時帶入。
- Windows 使用 Squirrel；也提供 Debian/RPM 與 macOS ZIP 封裝設定。


## 疑難排解
- 無法更新離線快取：
  - 確認首次啟動時網路可用。
  - 安裝 Git 可提升同步速度；未安裝會自動改用 GitHub 壓縮檔。
- 離線頁面 404：確認該站台設定的 `entryFile` 在快取資料夾內確實存在。
- 安全性：外部內容載入於隔離的 `BrowserView`；自訂協定限制於各站台快取根目錄內。


## 授權與作者
- 授權：MIT
- 作者：zssdmrofficial（`package.json` 中提供聯絡資訊）
