# magpie-panel

Magpie 的懸浮面板插件。它讓 Magpie 認識這個產品、提供狀態／設定頁，並在背景**確保並啟動 Magpie Panel 桌面浮窗**。

浮窗本身是另一個獨立的 Windows 程式（本 repo 的 `app/`），不是 Magpie 的一部分：插件頁是 `sandbox allow-scripts` 的 iframe，不能開視窗、不能 `fetch`、不能直接呼叫浮窗程式。真正常駐、可縮放、有 tray icon 的是那個獨立程式；插件只負責找到它、啟動它、顯示狀態。

## 安裝

插件是 npm 套件（`magpie-panel`）。

從 GitHub 安裝時，Magpie／Bun 只抓 repo 根目錄，不能指定 `plugin/` 子目錄：

```bash
magpie plugin add github:owogametools/magpie-statusP
```

在本機開發時，直接安裝 `plugin/` 資料夾：

```bash
magpie plugin add ./plugin
```

若之前從舊的 private repo 安裝過插件，先移除再重新安裝（舊安裝的依賴名可能是 `magpie-status`）：

```bash
magpie plugin remove magpie-panel
magpie plugin remove magpie-status
magpie plugin add github:owogametools/magpie-statusP
```

發佈到 npm 之後，也可以直接 `magpie plugin add magpie-panel`。

安裝後，在 Magpie 側邊欄的 **Plugins** 群組開啟「懸浮面板」。

## 第一次啟動

1. 開啟插件頁時，Magpie 會先喚醒插件宿主（Bun 進程）。
2. 宿主依下列順序找浮窗程式：
   1. 外掛選項 `binaryPath` 指定的絕對路徑；
   2. NSIS 安裝位置：`%LOCALAPPDATA%\Programs\Magpie Panel\Magpie Panel.exe`（也接受連字號命名）；
   3. 已下載版本：`%APPDATA%\MagpiePanel\bin\<version>\magpie-panel.exe`。宿主每次載入會先比對 GitHub 最新 release；較新就下載並改用新版，離線或查詢失敗則沿用本機最新版，不會擋住啟動。
   4. 完全沒有本機版本時，下載 GitHub Releases 最新版：`owogametools/magpie-statusP`。
3. 下載時，宿主取得 `magpie-panel-windows-amd64.zip` 與 `SHA256SUMS` 到暫存資料夾，先用 `crypto` 驗證 SHA256，通過後才解壓（`tar.exe`，失敗改用 PowerShell `Expand-Archive`），再以原子 rename 放進 `%APPDATA%\MagpiePanel\bin\<version>\`。
4. 舊版本目錄會保留；下載或驗證失敗不會刪掉仍可用的版本，必要時用 `binaryPath` 手動回退。
5. 程式以 detached 方式啟動（`stdio: "ignore"`），所以關掉 Magpie 後浮窗仍在。程式本身有單一實例鎖，重複啟動無害。

> Magpie 插件頁顯示的是**插件套件版本**；浮窗設定頁的「應用程式版本」才是目前執行的 binary。兩者更新來源不同，插件版本較新不代表浮窗一定已升級。

外掛選項 `autoLaunch` 預設為 `true`：每次宿主載入（包含 Magpie 啟動、選項變更後重載）都會確保並啟動程式。設成 `false` 後，只有頁面上的「啟動浮窗」按鈕會要求啟動。

## 選項

| 選項 | 預設 | 說明 |
|---|---|---|
| `binaryPath` | `""` | 自訂浮窗執行檔的絕對路徑。必須存在、不能包含 `..`；Windows 上必須是 `.exe`。留空代表自動尋找／下載。 |
| `autoLaunch` | `true` | 宿主載入時自動確保並啟動浮窗。 |
| `launchAt` | 無 | 頁面按「啟動」時寫入的毫秒時間戳。宿主在 2 分鐘內看到它就會啟動，即使 `autoLaunch` 是 `false`。 |
| `lastLaunchAt` | 無 | 頁面寫入的「上次啟動請求」時間，只用於顯示；實際啟動結果請看 Magpie 日誌。 |

頁面每次儲存都會先 `magpie.options.get()` 再合併，最後 `magpie.options.set({ ...current, ...patch })`。Magpie 限制每秒最多寫入一次，頁面會自動節流。

Magpie 寫入選項時會呼叫 `plugin.Restart()`：它會停掉目前的宿主，但不會立刻重啟；要等頁面 HTML 再次被服務（`pluginpage.go` 的 `pageHost` → `plugin.Warm`）才會載入新的宿主。因此頁面在「啟動」成功後會重新載入自己，讓宿主回來讀 `launchAt`；開啟 `autoLaunch` 或修改路徑（且 `autoLaunch` 為開）時也一樣，讓新設定立刻生效。

## 頁面功能

- 標頭狀態燈：最近是否送出過啟動請求。
- 狀態卡：自動啟動開關、目前 binary 路徑（或「自動下載」）、上次啟動請求時間。
- 控制卡：啟動／重新啟動浮窗、`autoLaunch` 開關、`binaryPath` 輸入與儲存／清除。
- 今日用量：透過 `magpie.read("usage:summary", { period: "today" })` 顯示呼叫數、tokens、費用；權限不足或版本不支援時顯示提示，不影響其他功能。
- 首次使用說明：SmartScreen、資料位置、浮窗可設定登入時自動啟動。

## 資料位置

| 內容 | 位置 |
|---|---|
| 下載的浮窗程式 | `%APPDATA%\MagpiePanel\bin\<version>\magpie-panel.exe` |
| 浮窗設定與形象圖片 | `%APPDATA%\MagpiePanel\`（由浮窗程式管理） |
| 插件自己的選項 | Magpie 的 `plugins.json`（由 Magpie 管理） |

插件**不寫入** Magpie 的設定，也不會把任何東西安裝進 Magpie。下載來源只允許 HTTPS。

## 疑難排解

- **頁面顯示「無法讀取用量」**：Magpie 版本不支援 `usage:summary`，或權限被拒；其他功能仍可用。
- **按了啟動但沒反應**：頁面只能寫入 `launchAt`，實際啟動由宿主執行。錯誤會以 `[magpie-panel]` 寫入 Magpie 日誌（`input.client.app.log`）；若沒有 bridge，則寫到宿主 stderr（Magpie 也會記錄）。
- **浮窗版本沒更新**：宿主每次載入會比對 GitHub 最新 release；離線時會沿用本機最新版。先從浮窗設定關閉舊 process（單一實例鎖會擋住新版），再讓插件宿主重啟。必要時把 `%APPDATA%\MagpiePanel\bin\<舊版>` 移走，或設定 `binaryPath` 指到想跑的執行檔。
- **錯誤碼**：
  - `offline` — 連不到 GitHub Releases（離線或被防火牆阻擋）
  - `missing-asset` — release 缺少 `magpie-panel-windows-amd64.zip` 或 `SHA256SUMS`
  - `sha-mismatch` / `sha-missing` — 驗證失敗，已中止，不會解壓
  - `extract-failed` — `tar.exe` 與 PowerShell 都無法解壓
  - `missing-exe` — 解壓後找不到 `magpie-panel.exe`
  - `binary-path-invalid` / `binary-missing` — `binaryPath` 不是絕對路徑、含 `..`、不是 `.exe`，或檔案不存在
  - `unsupported-platform` — 目前只支援 Windows
- **SmartScreen**：首次執行未簽章 exe 會出現警告，選「仍要執行」。
- **重複啟動**：浮窗程式有單一實例鎖；重複的啟動請求只會讓既有視窗顯示。

## 開發與驗證

```bash
node --check plugin/index.js
node --check plugin/page/app.js
python -m json.tool plugin/package.json
node --test plugin/manifest.test.mjs

# 匯入不得連網或啟動任何程式
bun -e 'await import("./plugin/index.js"); console.log("ok")'
```

沙箱安裝測試（不會動到本機 Magpie）：

```bash
sb=$(mktemp -d)
HOME=$sb XDG_CONFIG_HOME=$sb/.config magpie plugin add ./plugin
HOME=$sb XDG_CONFIG_HOME=$sb/.config magpie plugin --json
```

## 需要在真實 Magpie 安裝上確認的假設

- 宿主 factory 的第二個參數 `options` 就是 `plugins.json` 裡這個插件的 `options`（已對照 `internal/plugin/host.js`，仍建議實機確認）。
- `SetOptions` → `Restart()` 只會停掉宿主；頁面重新載入後 `pageHost` 才會把它啟動回來。若實際版本行為不同，頁面重載仍無害。
- `launchAt` 的 2 分鐘時效是插件端的保守設計，避免過期的選項值在每次宿主重載時都觸發啟動。
- `input.client.app.log({ body: { service, level, message } })` 的日誌格式與 Magpie 日誌顯示。
- `usage:summary` 的欄位（`calls`、`input`、`output`、`cost`、`models[].model`）與權限提示。
- `_magpie/bridge.js` 的 `magpie.ready` / `theme` / `onTheme` / `options` / `read` 行為，以及 `magpie.page.titles` 的語言鍵。
