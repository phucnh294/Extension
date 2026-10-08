---
title: Readown Chrome extension — build steps, architecture and gotchas
date: 2026-10-07
last_updated: 2026-10-07
type: functionality
project: ut-support
area: md-viewer-extension
status: implementation-complete
subtype: design
files: [extension/manifest.json, extension/src/render.js, extension/src/content.js, extension/src/viewer.js, extension/src/viewer.html, extension/src/popup.js, extension/src/popup.html, extension/src/viewer.css, extension/_locales/en/messages.json, extension/_locales/vi/messages.json, scripts/build.mjs, scripts/package.mjs, scripts/icons.mjs, scripts/store-assets.mjs, test/e2e.test.mjs, windows/install.ps1, store/listing.txt, store/privacy-policy.txt]
version: 2
extraction_method: runtime-observation
tags: [ui, security, testing, playwright, process]
keywords: [Readown, Readown.Document, Manifest V3, content_scripts, chrome.storage.sync, DOMPurify, RETURN_DOM_FRAGMENT, isolated world, allow-on-file-urls, isAllowedFileSchemeAccess, windows-1252, "isn't UTF-8 encoded", Broad Host Permissions, showOpenFilePicker, getAsFileSystemHandle, FONT_MIN, FONT_MAX, clampFontSize, OpenWithProgids, SystemFileAssociations, readown-1.0.0.zip]
related: [README.md, rag-ai-local/functionality-docs/10062026/01_markdown-viewer-chrome-extension.md, store/listing.txt, store/privacy-policy.txt]
---

# Readown Chrome extension — build steps, architecture and gotchas

## TL;DR
- **What:** Readown ("Readown – Markdown file viewer") là extension Chrome Manifest V3 hiển thị file `.md` (file trên máy và file raw trên GitHub/Gist/GitLab/Bitbucket) theo kiểu GitHub, có mục lục, tô màu code, theme, thanh trượt cỡ chữ, trang "Mở file" tự reload, và menu chuột phải trong File Explorer.
- **Why:** ghi lại các bước build/đóng gói/publish, kiến trúc và những bẫy đã gặp, để người sau build và phát hành lại mà không phải dò lại.
- **Where:** `extension/` (thứ được đóng gói), `scripts/` (build, zip, icon, ảnh store), `test/e2e.test.mjs`, `windows/` (tích hợp Explorer), `store/` (listing, privacy policy, ảnh).
- **Impact:** `npm test` → 10 pass / 1 skip; `npm run package` → `dist/readown-1.0.0.zip` (24 file) sẵn sàng upload. Thay thế tài liệu `10062026/01_markdown-viewer-chrome-extension.md`.

## Build steps for the Readown extension (từ máy trắng đến chạy được)
1. **Yêu cầu:** Node.js 20+ (đã dùng 22.16; `scripts/` cần `zlib.crc32` có từ Node 22.2 — dùng Node ≥ 22.2), Google Chrome. Windows cho phần File Explorer.
2. **Cài thư viện:**
   ```bash
   npm install
   ```
   Lần đầu chạy test có thể cần: `npx playwright install chromium`.
3. **Build** (bắt buộc trước khi "Load unpacked" — `extension/vendor/` và `extension/icons/` là file sinh ra):
   ```bash
   npm run build
   ```
   Kết quả mong đợi: `build: extension/ ready (v1.0.0) — load it via chrome://extensions → Load unpacked`.
4. **Nạp vào Chrome:** `chrome://extensions` → bật *Developer mode* → *Load unpacked* → chọn thư mục `extension/` (thư mục có `manifest.json`, không phải thư mục cha) → *Details* → bật **Allow access to file URLs**.
5. **Sau mỗi lần sửa code:** `npm run build` (nếu đổi vendor/icon/locale) → bấm ↻ trên thẻ Readown trong `chrome://extensions` → tải lại tab `.md`.
6. **Test:**
   ```bash
   npm test
   ```
7. **Đóng gói để nộp store:**
   ```bash
   npm run package
   ```
   Tạo `dist/readown-<version>.zip` từ nội dung `extension/` (bỏ dotfile và `.map`).
8. **Ảnh cho store** (3 ảnh chụp 1280×800 + promo 440×280 và 1400×560 trong `store/`):
   ```bash
   npm run store-assets
   ```
9. **Tích hợp File Explorer (tuỳ chọn, Windows):** double-click `windows\install.cmd` (gỡ: `windows\uninstall.cmd`). Chỉ ghi HKCU, không cần admin.

## Release checklist for the Readown extension (nộp / cập nhật Chrome Web Store)
- Tăng `version` trong `extension/manifest.json` mỗi lần upload một package mới cho item đã từng upload — store không nhận số version bằng hoặc thấp hơn bản đã upload. (Version hiện tại 1.0.0 vì bản 1.0.1 chưa từng được upload.)
- `npm test` phải pass, rồi `npm run package`.
- Dashboard: *Package → Upload new package*; nếu đổi giao diện thì thay ảnh trong `store/screenshots/`; dán lại mô tả từ `store/listing.txt`.
- Tab *Privacy*: single purpose + justification cho `storage` và host permissions lấy nguyên văn mục `PERMISSION JUSTIFICATION` trong `store/listing.txt`; *Remote code: No*; không khai báo dữ liệu thu thập.
- Privacy policy URL = Gist `https://gist.github.com/phucnh294/258714b81c39c899f3ae0dd4194a2148` (tài khoản GitHub phucnh294). Khi sửa `store/privacy-policy.txt` thì sửa Gist cho khớp (Edit → dán → *Update public gist*); link không đổi.
- Tài khoản developer cần: phí 5 USD một lần, xác minh 2 bước Google, **contact email đã nhập và đã verify** ở trang Settings (thiếu thì store báo "You must provide/verify a contact email"), khai báo Non-trader nếu phát hành cá nhân miễn phí.

## Architecture of the Readown extension
```
                    ┌──────────── extension/ (đóng gói vào zip) ────────────┐
 .md tab (file://,  │ content_scripts (manifest):                            │
 raw GitHub/GitLab) │   vendor/marked.umd.js  vendor/purify.min.js           │
   ───────────────► │   vendor/highlight.min.js  src/render.js  src/content.js│
                    │   CSS: vendor/github-markdown.css  src/viewer.css      │
 popup (icon M↓) ─► │ src/popup.html/js  → cài đặt + nút "Open a Markdown…"  │
                    │ src/viewer.html/js → chọn/kéo thả file, tự reload      │
                    │ _locales/en, vi    icons/    vendor/licenses/          │
                    └──────────────── chrome.storage.sync ───────────────────┘
 File Explorer ──(windows/install.ps1: "chrome.exe" "%1")──► .md tab ở trên
```
- **`src/render.js`** — module dùng chung (`window.MDV`): i18n `t()/localize()`, settings `loadSettings/saveSettings/onSettingsChanged`, `renderMarkdown()`, `createViewer()` dựng toàn bộ UI (thanh công cụ, TOC, vùng nội dung, Raw, front matter), `clampFontSize`, `FONT_MIN=12`, `FONT_MAX=28`. Không có code riêng cho từng nơi dùng.
- **`src/content.js`** — chạy trên URL khớp `matches`; chỉ hành động khi `document.contentType` là `text/plain` / `text/markdown` / `text/x-markdown` và body có `<pre>`. Sửa mã hoá, chèn meta CSP, xoá body, gọi `MDV.createViewer(document.body).render(text)`.
- **`src/viewer.html` + `viewer.js`** — trang extension mở từ popup; dùng `showOpenFilePicker` hoặc drag & drop `getAsFileSystemHandle` để có handle, poll `lastModified` mỗi 1 giây và render lại khi file được lưu. Không cần quyền file URL.
- **`src/popup.*`** — theme, độ rộng, thanh trượt cỡ chữ, bật/tắt TOC; cảnh báo khi `chrome.extension.isAllowedFileSchemeAccess()` là false.
- **Không có service worker / background**: quyền duy nhất là `storage`.

## Rendering pipeline of the Readown extension
1. `content.js` lấy text trong `<pre>` → `repairEncoding()` (nếu trang không phải UTF-8 và text đảo ngược được sang byte windows-1252 rồi giải mã UTF-8 hợp lệ thì dùng bản UTF-8).
2. `renderMarkdown()`: tách front matter (`---`/`+++`), `marked.parse(body, { gfm: true })`, `DOMPurify.sanitize(html)` **ra chuỗi**, parse qua `<template>`.
3. Hậu xử lý DOM: id heading kiểu GitHub (trùng thì thêm `-1`, `-2`) + link neo; highlight.js chỉ cho class `language-*` mà hljs biết; nút Copy; class task-list; TOC từ h1–h4 (chỉ khi ≥ 2 heading).
4. `content.js` chèn `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; base-uri 'none'">` — lớp bảo vệ thứ hai sau DOMPurify.
5. CSS được Chrome chèn tĩnh qua `content_scripts.css` nên không bị CSP của trang chặn (raw.githubusercontent.com có `default-src 'none'`). Mọi selector đều scope trong `.mdv` / `.markdown-body` vì CSS này được chèn vào mọi URL khớp, kể cả trang HTML mà extension bỏ qua.

## Build pipeline of the Readown extension (scripts/)
- **`scripts/build.mjs`**: copy `marked.umd.js`, `purify.min.js`, `highlight.min.js` + LICENSE từ `node_modules` vào `extension/vendor/`; viết lại `github-markdown.css` (2 khối màu `@media (prefers-color-scheme)` → `.markdown-body` sáng mặc định, `.mdv[data-theme="dark"]`, và `auto` trong media query) — build **fail** nếu cấu trúc file CSS đổi; vẽ icon PNG 16/32/48/128 và `windows/readown.ico`; kiểm tra mọi file manifest tham chiếu tồn tại, content script không chứa noncharacter Unicode, `extName` ≤ 75 và `extDescription` ≤ 132 ký tự cho cả `en` và `vi`.
- **`scripts/icons.mjs`**: tự vẽ logo M↓ (polygon + supersampling 4×4) và tự mã hoá PNG/ICO bằng `node:zlib` — không cần thư viện ảnh.
- **`scripts/package.mjs`**: tự ghi file zip (deflate + CRC32 của `node:zlib`), tên lấy `version` từ manifest.
- **`scripts/store-assets.mjs`**: chạy test "store screenshots" với `SCREENSHOTS=1` (qua `spawnSync`, vì cú pháp `VAR=1 cmd` không chạy trong npm script trên Windows) rồi render promo tile bằng Playwright.

## Host permissions of the Readown extension
- `matches` chỉ gồm: `file:///*.md|.MD|.markdown|.mdown|.mkd|.mkdn` và `https://raw.githubusercontent.com/*`, `https://gist.githubusercontent.com/*`, `https://gitlab.com/*/-/raw/*`, `https://bitbucket.org/*/raw/*` với đuôi `.md`, `.md?*`, `.markdown`.
- Bản đầu dùng `http(s)://*/*.md` → dashboard cảnh báo **Broad Host Permissions** (review sâu, lâu). Muốn thêm site mới: thêm đúng host/path vào `matches`, cập nhật `PERMISSION JUSTIFICATION` trong `store/listing.txt`, privacy policy (file + Gist), và test `web: raw hosts…` trong `test/e2e.test.mjs`. Không quay lại wildcard host.
- Pattern có `?*` cần thiết cho link raw GitHub kèm `?token=…` (match pattern so cả query string).

## Settings of the Readown extension (chrome.storage.sync)
| Setting | Default | Tác dụng thực tế khi chạy |
|---|---|---|
| `theme` | `auto` | `data-theme` trên `.mdv` và `html[data-mdv-theme]`; `auto` theo `prefers-color-scheme`. Nút theme xoay vòng Auto → Light → Dark |
| `width` | `normal` | độ rộng nội dung tối đa 900 / 1200 px / full |
| `fontSize` | `16` | biến CSS `--mdv-font-size` trên `.markdown-body` và Raw; kẹp 12–28 bằng `clampFontSize`. Thanh trượt áp dụng ngay khi kéo (`input`) nhưng chỉ **lưu khi thả** (`change`); bấm số `16px` để về mặc định |
| `toc` | `true` | hiện sidebar mục lục (chỉ khi tài liệu có ≥ 2 heading) |
- Mọi tab đang mở cập nhật theo `chrome.storage.onChanged`. Lưu khi thả thanh trượt vì `storage.sync` giới hạn số lần ghi mỗi phút.

## File Explorer integration of the Readown extension (windows/)
- `windows/install.ps1` (bọc bởi `install.cmd` / `uninstall.cmd`, chạy `-ExecutionPolicy Bypass`) chỉ ghi dưới `HKCU\Software\Classes`: ProgID `Readown.Document` (icon, `FriendlyAppName`, lệnh `"chrome.exe" "%1"`), verb chuột phải `SystemFileAssociations\<ext>\shell\Readown` ("Open with Readown", tiếng Việt nếu UI culture là `vi`), và giá trị `OpenWithProgids` cho `.md .markdown .mdown .mkd .mkdn`. `-Uninstall` chỉ xoá những gì script tạo.
- Extension Chrome không thể tự đăng ký làm trình mở file của Windows, nên luồng là Explorer → Chrome → content script. Chrome 154 trả file `.md` cục bộ dạng `text/markdown` trong `<pre>` — `content.js` chấp nhận.
- Windows không cho script đặt app mặc định (UserChoice có hash bảo vệ): người dùng tự chọn *Open with → Choose another app → Readown → Always* một lần.
- Script cảnh báo nếu extension chưa được nạp (tìm đường dẫn thư mục `extension` trong các file `Preferences` của profile Chrome).
- File `.ps1` phải giữ **ASCII** (PowerShell 5.1 đọc file không BOM theo ANSI); nhãn tiếng Việt được ghép từ mã ký tự `[char]0x1EDF`.

## Key decisions for the Readown extension and why
| Quyết định | Phương án bị loại | Lý do |
|---|---|---|
| Copy vendor từ `node_modules`, không bundler | CDN / webpack | Store cấm remote code; file thuần dễ review |
| Scope lại `github-markdown.css` lúc build | Đổi `<link>` qua `web_accessible_resources` | CSP của trang có thể chặn `<link>` chèn vào; CSS tĩnh của content script thì không |
| Màu highlight.js tự viết bằng biến CSS | Kèm 2 file theme hljs | Một stylesheet, đổi theme bằng cùng `data-theme` |
| Chỉ quyền `storage`, không `scripting`/`tabs`/background | Inject bằng code | Ít quyền, duyệt nhanh hơn |
| Host cụ thể thay vì `*://*/*.md` | Giữ wildcard | Tránh "Broad Host Permissions" |
| Tên "Readown" | "Markdown Viewer", "Markdown Reader" | Hai tên kia đã có trên store (Markdown Reader ~100k người dùng); "Readown" không có kết quả trùng (kiểm tra 2026-10-07) |
| Thanh trượt cỡ chữ trên toolbar | Nút A−/A+ | Người dùng yêu cầu, chỉnh nhanh hơn |
| Tự viết PNG/ICO/ZIP bằng `node:zlib` | `sharp`, `archiver` | Không thêm dependency |

## Gotchas found while building the Readown extension
- **DOMPurify `RETURN_DOM_FRAGMENT` không an toàn trong isolated world của content script.** Fragment trả về không còn thuộc tính `onerror`, nhưng `<img src=x onerror=…>` vẫn chạy handler trong main world khi chèn vào trang. Sanitize ra **chuỗi** rồi parse thì không chạy. Phát hiện bằng test e2e (`window.__xss`), khoanh vùng bằng CDP `Runtime.evaluate` trong context isolated. Không bao giờ chuyển lại sang fragment mode.
- **"Could not load file 'src/content.js' for content script. It isn't UTF-8 encoded."** File là UTF-8 hợp lệ nhưng chứa noncharacter U+FFFF (công cụ ghi file đã biến chuỗi escape `\uffff` thành ký tự thật). Chrome bỏ qua cả extension mà không báo rõ khi nạp bằng `--load-extension`. `build.mjs` giờ báo lỗi ngay; khi viết regex luôn giữ dạng escape, kiểm tra lại file bằng grep ký tự non-ASCII.
- **Bấm nút trong bản xem trước `popup.html` (không phải popup thật) không làm gì** vì không có `chrome.tabs`. `popup.js` giờ fallback `window.open('viewer.html')`. Khi người dùng báo "không mở được", kiểm tra trước extension đã được nạp vào profile Chrome chưa.
- **Extension nạp bằng `--load-extension` đã bật sẵn "Allow access to file URLs"**; click `#allow-on-file-urls` sẽ *tắt* nó. Test kiểm tra `.checked` trước. Với cài đặt thường, mục này mặc định **tắt** — thiếu nó thì file `.md` cục bộ chỉ hiện chữ thô.
- **Chrome bản thương mại (từ 137) bỏ qua `--load-extension`**: test dùng Chromium của Playwright (`channel: 'chromium'`); trên máy người dùng phải *Load unpacked* bằng tay.
- **SVG parse bằng `DOMParser('image/svg+xml')` phải có `xmlns`**, nếu không icon toolbar có kích thước 0.
- **`New-Item -Force` trên registry key đã tồn tại sẽ tạo lại key và xoá hết value** (ví dụ `.md\OpenWithProgids` đang chứa VS Code, Cursor). Script chỉ tạo key khi chưa có.
- **Mô tả manifest tối đa 132 ký tự** (cả bản `vi`); build kiểm tra.
- **Content script không đọc lại được file `file://`** (`fetch` không hỗ trợ scheme `file`), nên live reload chỉ có trên `viewer.html`.
- **Gist privacy policy đặt tên `.md` nhưng nội dung là text thường** sẽ bị GitHub dồn dòng; dán bản có tiêu đề Markdown.
- **Store không nhận version thấp hơn hoặc bằng bản đã upload**; nếu đã upload 1.0.1 thì không quay về 1.0.0 được.

## Verification of the Readown extension
```bash
npm test
```
Kết quả mong đợi: `# tests 11`, `# pass 10`, `# fail 0`, `# skipped 1` (test "store screenshots" chỉ chạy khi `SCREENSHOTS=1`). Bộ test nạp extension thật vào Chromium và kiểm tra: render toàn bộ corpus thật (`.claude/rules/*.md`, `.claude/skills/*/SKILL.md`, README của marked/dompurify/playwright), highlight/front matter/slug/chặn XSS, liên kết tương đối giữa các file `.md`, UTF-8 tiếng Việt, sửa charset windows-1252 trên host raw, trang HTML và host ngoài danh sách không bị đụng tới, một README thật trên raw.githubusercontent.com (`OFFLINE=1` để bỏ qua), theme, thanh trượt cỡ chữ (phím mũi tên + click chuột + đồng bộ tab + reset), Raw, trang viewer, popup.

```bash
npm run package
```
Kết quả mong đợi: `package: dist\readown-1.0.0.zip (24 files)`; `unzip -t dist/readown-1.0.0.zip` không lỗi; manifest trong zip không có `*://` hay `http://*`.

```bash
powershell -ExecutionPolicy Bypass -File windows/install.ps1
```
Kết quả mong đợi: `Readown: File Explorer integration installed (...)`; chuột phải file `.md` có mục **Open with Readown**.
