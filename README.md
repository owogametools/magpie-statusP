# Magpie Panel

<img src="preview.gif" alt="Magpie Panel 預覽" width="360">

一個常駐的懸浮面板，復刻 Magpie 點擊 tray icon 後彈出的面板，並加上「形象」頁：用自訂 GIF／PNG／WebP 隨著 Magpie 的路由狀態變化。

- 浮窗可自由縮放、拖曳、記住位置與大小（含多螢幕）
- 預設永遠置頂、開機自動啟動、全域快捷鍵 `Alt+Shift+M`
- 五個頁籤：用量、Agents、快速操作、形象、設定
- 形象支援 7 種狀態、依 Agent 分套、預設套 fallback、Agent 優先序
- Magpie 未執行時顯示離線，不崩潰；資料只讀 `127.0.0.1`

## 架構

Magpie 的插件只能提供沙箱頁面，不能建立原生視窗或 tray。因此本專案分成兩塊：

```text
plugin/   Magpie 插件（npm 套件）：在 Magpie 裡提供入口、狀態與設定，
          必要時從 GitHub Releases 下載並啟動浮窗程式
app/      MyGo 桌面程式：tray、浮窗、Magpie 本機 API、形象狀態機
```

插件不是必需的：浮窗程式可以獨立執行，插件只是讓 Magpie 使用者更容易找到與啟動它。

## 安裝

### 浮窗程式

從 [Releases](https://github.com/owogametools/magpie-statusP/releases) 下載：

- `magpie-panel-setup-<version>-amd64.exe`：NSIS 安裝檔（建議）
- `magpie-panel-windows-amd64.zip`：免安裝版，解壓後執行 `magpie-panel.exe`

首次啟動 Windows SmartScreen 可能警告（未簽章），選擇「仍要執行」。程式會登錄開機啟動；可在設定頁關閉。

### Magpie 插件

```bash
magpie plugin add github:owogametools/magpie-statusP
```

Magpie 的 GitHub 安裝只抓 repo 根目錄；根目錄的 `package.json` 會把入口與頁面指向 `plugin/`。

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

在 Magpie 的 Settings → Plugins 開啟「Magpie Panel」頁面，即可看到狀態、binary 路徑與自動啟動選項。插件會優先使用已安裝的程式；找不到時從 Releases 下載 `magpie-panel-windows-amd64.zip`，以 `SHA256SUMS` 驗證後放到 `%APPDATA%\MagpiePanel\bin\<version>\`。

## 使用

- **左鍵 tray icon**：顯示／隱藏浮窗
- **右鍵 tray icon**：顯示浮窗並跳到設定頁
- **Alt+Shift+M**：顯示／隱藏浮窗（可在設定頁更改）
- **拖曳視窗邊緣**：縮放；位置與大小會記住
- **關閉**：只隱藏，程式常駐；從設定頁的「離開」結束程式

### 形象

到「形象」頁為每個 Agent 的 7 種狀態選圖：

| 狀態 | 意義 |
|---|---|
| `idle` | 待機 |
| `routing` | 請求已開始，尚未送出 attempt |
| `waiting` | 等待首 token |
| `streaming` | 正在串流輸出 |
| `fallback` | 切換備援模型／帳號（顯示 2 秒） |
| `failed` | 請求失敗（顯示 3 秒） |
| `offline` | Magpie 未連線 |

圖片解析順序：**該 Agent 的圖 → 預設套的圖 → 內建佔位圖**。多個 Agent 同時活躍時，只顯示優先序最高的那個；全部待機時顯示最後活躍的 Agent。

支援 GIF／PNG／WebP，單檔上限 20 MB。圖片會複製到 `%APPDATA%\MagpiePanel\avatars\`，原始檔移動不影響。

程式內建 `claude` 預設套（蜜塔），首次啟動且 `avatar.sets` 還是空的時候會自動安裝到 `%APPDATA%\MagpiePanel\avatars\claude\`。已有的套組或同名檔案不會被覆寫。

## 設定與資料位置

| 路徑 | 內容 |
|---|---|
| `%APPDATA%\MagpiePanel\config.json` | 設定（寫入前保留 `.bak`） |
| `%APPDATA%\MagpiePanel\avatars\` | 形象圖片 |
| `%APPDATA%\MagpiePanel\bin\` | 插件下載的程式版本 |
| `%APPDATA%\MagpiePanel\window-state.json` | MyGo 記住的視窗位置與大小 |

Magpie 的 port 會自動從 `~/.config/magpie/settings.json` 讀取，讀不到時用 `3425`。程式只連 `127.0.0.1`，不帶 gateway key，也不記錄 prompt、帳號或金鑰。

Agent 的模型與 reasoning 切換走 Magpie 官方 CLI（`magpie <agent> <model>`），不碰 Magpie 的內部視窗 API。

## 從原始碼建置

需求：Windows 11、Go 1.27+、Bun、WebView2（Windows 11 內建）。

```bash
cd app
bun install
bun run dev          # 開發模式
bun run build        # 產出 build/windows-amd64/
go test ./...
```

也可以：

```bash
cd app
go tool mygo build
```

`bun run build` 會產出 `Magpie Panel.exe` 與 NSIS 安裝檔。

## 限制

- 首發只支援 Windows 11 amd64；程式碼本身跨平台，但未打包 macOS／Linux。
- Windows 未簽章，SmartScreen 會警告。
- 插件的宿主 API 隨 Magpie 版本演進；若 Magpie 改變插件格式，請更新插件版本。
- 形象的狀態來自 Magpie 的 `route-events` SSE；極短的請求可能只看到一瞬。

## 授權

本專案為 MIT。視覺設計參考 [Magpie](https://github.com/yetone/magpie)（MIT，Copyright (c) 2026 yetone），未直接複製其程式碼。詳見 [LICENSE](LICENSE) 與 [NOTICE](NOTICE)。
