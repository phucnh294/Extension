# Chrome extensions: Readown & Docdown

Repo này chứa hai extension Chrome dùng chung bộ build, test và quy trình phát hành:

| Extension | Thư mục | Làm gì | Trạng thái |
|---|---|---|---|
| **Readown – Markdown file viewer** | `extension/` | Đọc file `.md` (trên máy và raw GitHub/GitLab/Bitbucket) thành trang đẹp | [Đã có trên Chrome Web Store](https://chromewebstore.google.com/detail/daijgajeokdjadflfcchplafdiaffoab) |
| **Docdown – Web page to Markdown** | `docdown/` | Chuyển trang web / bài viết / đoạn chọn thành Markdown sạch cho LLM, ghi chú, RAG | Sẵn sàng nộp store ([chi tiết bên dưới](#docdown--web-page-to-markdown)) |

```bash
npm install
```

```bash
npm run test:all
```

# Readown — Markdown file viewer

Hiển thị file Markdown (`.md`) ngay trong Chrome: file trên máy (`file:///…`) và file raw trên GitHub, Gist, GitLab, Bitbucket
(ví dụ `raw.githubusercontent.com/…/README.md`). Các trang web khác không bị đụng tới.

**Tính năng**

- Giao diện kiểu GitHub (github-markdown-css), GFM: bảng, task list, gạch ngang, autolink
- Mục lục (TOC) bên cạnh, tự đánh dấu mục đang đọc; link `#` cho từng heading
- Tô màu code (highlight.js, ~40 ngôn ngữ phổ biến) + nút **Copy** cho mỗi khối code
- Thanh trượt chỉnh cỡ chữ ngay trên thanh công cụ (12–28px, bấm vào số để về 16px) và trong popup
- Chế độ Sáng / Tối / Tự động, độ rộng nội dung (lưu bằng `chrome.storage.sync`)
- Xem mã nguồn (Raw), hiển thị YAML front matter dạng gập
- Trang **Mở file**: chọn hoặc kéo thả file, **tự render lại khi file được lưu** (không cần quyền file URL)
- Sửa lỗi font khi Chrome đoán sai mã hoá file UTF-8 không có BOM (tiếng Việt)
- An toàn: HTML trong Markdown được lọc bằng DOMPurify, trang đã render có CSP `script-src 'none'`
- Giao diện tiếng Anh + tiếng Việt (`_locales/`)
- Không thu thập dữ liệu, không gọi mạng, không dùng code từ xa

Tài liệu chi tiết (các bước build, kiến trúc, quyết định thiết kế, các bẫy đã gặp, checklist phát hành):
[rag-ai-local/functionality-docs/10072026/01_readown-build-architecture-gotchas.md](rag-ai-local/functionality-docs/10072026/01_readown-build-architecture-gotchas.md)

## Cấu trúc

```
extension/            ← thư mục để "Load unpacked" và để đóng gói
  manifest.json       Manifest V3, quyền duy nhất: "storage"
  src/render.js       renderer + giao diện viewer dùng chung
  src/content.js      biến trang text .md thành trang đã render
  src/viewer.html/js  trang "Mở file" (chọn / kéo thả, tự reload)
  src/popup.*         popup cài đặt
  _locales/en, vi     chuỗi giao diện
  vendor/, icons/     do `npm run build` tạo ra
windows/              tích hợp File Explorer: install.cmd / uninstall.cmd / install.ps1 + icon .ico
scripts/              build, đóng gói zip, tạo ảnh promo
test/e2e.test.mjs     test e2e: nạp extension thật vào Chromium
store/                ảnh chụp, promo tile, nội dung listing, privacy policy
```

## Chạy trên máy (local)

Cần Node.js 20+.

```bash
npm install
```

```bash
npm run build
```

1. Mở `chrome://extensions`, bật **Developer mode** (góc phải trên).
2. Bấm **Load unpacked** → chọn thư mục `extension/`.
3. Bấm **Details** của extension → bật **Allow access to file URLs**
   (bắt buộc để đọc file `.md` mở trực tiếp từ ổ đĩa).
4. Kéo một file `.md` vào Chrome, hoặc mở `file:///D:/duong-dan/README.md`.

Không bật quyền file URL vẫn dùng được: bấm icon extension → **Mở file Markdown…**.

> Nút **Mở file Markdown…** chỉ hoạt động trong popup của extension đã cài (icon trên thanh Chrome),
> không hoạt động khi mở `popup.html` như một trang thường.

## Mở từ File Explorer (Windows)

Double-click `windows\install.cmd` (hoặc chạy lệnh dưới). Script chỉ ghi vào `HKCU`, không cần admin:

```bash
powershell -ExecutionPolicy Bypass -File windows/install.ps1
```

- Chuột phải file `.md` → **Open with Readown** (Windows 11: nằm trong *Show more options*).
  Lệnh này mở file bằng Chrome, extension sẽ render.
- Muốn double-click là mở luôn: chuột phải `.md` → *Open with* → *Choose another app* →
  **Readown** → *Always*. Windows không cho script tự đặt app mặc định.
- Gỡ: `windows\uninstall.cmd`.
- Vẫn cần nạp extension vào Chrome và bật *Allow access to file URLs* (các bước ở trên). Nếu chưa
  nạp, script sẽ cảnh báo.

Sau khi sửa code: chạy lại `npm run build` (nếu đổi vendor) rồi bấm nút ↻ của extension trong
`chrome://extensions` và tải lại tab `.md`.

## Test

```bash
npm test
```

Test nạp extension vào Chromium của Playwright (headless), mở các file `.md` thật trong repo
(`.claude/rules`, `.claude/skills`, README của các thư viện) qua `file://` và kiểm tra: đã render,
heading id không trùng, TOC, front matter, tô màu code, chặn XSS, tiếng Việt UTF-8, theme lưu giữa
các tab, chế độ Raw, trang Mở file, popup lưu cài đặt. Lần đầu có thể cần `npx playwright install chromium`.

## Publish lên Chrome Web Store

1. **Đóng gói**

   ```bash
   npm run package
   ```

   Tạo `dist/readown-<version>.zip` (chỉ chứa nội dung `extension/`).
   Ảnh cho store: `npm run store-assets` (ảnh chụp 1280×800 + promo tile 440×280 và 1400×560 trong `store/`).

2. **Tài khoản developer**: vào <https://chrome.google.com/webstore/devconsole>, đăng nhập Google,
   trả phí đăng ký một lần (5 USD), xác minh email liên hệ.

3. **New item** → upload file zip.

4. **Store listing**: lấy nội dung trong `store/listing.txt`; category *Developer Tools*;
   icon 128 lấy từ `extension/icons/icon128.png`; ảnh chụp trong `store/screenshots/`;
   small promo tile `store/promo-small-440x280.png`.

5. **Privacy practices** (tab Privacy):
   - *Single purpose*: "Render Markdown files as formatted pages."
   - *Permission justification*:
     - `storage`: lưu cài đặt hiển thị (theme, cỡ chữ, độ rộng, mục lục).
     - *Host permissions*: content script chỉ chạy trên file `.md` cục bộ và file raw `.md` của
       raw.githubusercontent.com, gist.githubusercontent.com, gitlab.com (`/-/raw/`), bitbucket.org (`/raw/`).
       Ghi chú cho reviewer (tiếng Anh) nằm trong `store/listing.txt`.
   - *Remote code*: **No** — mọi thư viện được đóng gói trong extension.
   - *Data usage*: không thu thập dữ liệu nào → tick các cam kết tuân thủ.
   - *Privacy policy URL*: đăng `store/privacy-policy.txt` lên một URL công khai
     (GitHub repo / GitHub Pages / Gist) và dán link.

6. **Distribution**: Public (hoặc Unlisted để thử trước) → **Submit for review**.
   Content script chỉ khớp file cục bộ và 4 host raw cụ thể (không còn quyền host rộng), nên không bị
   cảnh báo "Broad Host Permissions".

**Cập nhật phiên bản**: tăng `version` trong `extension/manifest.json` → `npm run package` →
dev console → *Package* → *Upload new package* → Submit.

## Giới hạn đã biết

- Trang `file://` không tự reload khi file thay đổi (Chrome không cho content script đọc lại file);
  dùng trang **Mở file** nếu cần live reload.
- Chưa hỗ trợ Mermaid / công thức toán (KaTeX).
- File không phải UTF-8 cũng không phải Windows-1252 có thể hiển thị sai dấu nếu Chrome đoán sai mã hoá.

# Docdown — Web page to Markdown

Chuyển trang đang xem, bài viết chính của trang, hoặc đoạn đang chọn thành Markdown sạch để dán vào
ChatGPT / Claude / Cursor / Obsidian / Notion hoặc kho tài liệu RAG.

**Tính năng**

- 3 chế độ: **Article** (tự tìm nội dung chính, Mozilla Readability) · **Whole page** · **Selection**
- Khối code giữ đúng ngôn ngữ (` ```js `, ` ```python ` …), bỏ số dòng, nút Copy, dấu nhắc lệnh;
  đọc được code nằm trong **shadow DOM** (ví dụ MDN)
- Hộp ghi chú của Docusaurus / MkDocs / Sphinx / MDN / GitHub → GitHub alert `> [!NOTE]`, `> [!WARNING]`…
- Bảng → bảng Markdown; link và ảnh → địa chỉ tuyệt đối; bỏ permalink, link "sửa" của wiki
- Popup: xem trước (alert hiển thị như GitHub) hoặc sửa Markdown, ước tính token, **Copy**,
  **Copy as prompt** (kèm link nguồn), **Download .md**
- Front matter: none / basic / template riêng với `{title} {url} {domain} {date} {datetime} {lang} {excerpt}`
  (giá trị luôn hợp lệ YAML)
- Mở bằng nút trên thanh công cụ, menu chuột phải hoặc **Alt+Shift+M**
- Chỉ xin `activeTab, scripting, contextMenus, storage` — **không có quyền host**, không gửi dữ liệu,
  không code từ xa

Luồng chi tiết từng bước, kiến trúc, các lỗi đã gặp trên trang thật và cách kiểm chứng:
[rag-ai-local/functionality-docs/10072026/02_docdown-implementation-log.md](rag-ai-local/functionality-docs/10072026/02_docdown-implementation-log.md)

## Docdown: cấu trúc

```
docdown/                  ← thư mục "Load unpacked" và để đóng gói
  manifest.json           MV3; activeTab, scripting, contextMenus, storage; lệnh Alt+Shift+M
  src/clip.js             engine: clone theo cây hiển thị (cả shadow DOM) → Readability → Turndown
  src/popup.html/js/css   popup: chế độ, front matter, xem trước / sửa, copy, download
  src/frontmatter.js      template front matter + cài đặt (dùng chung popup và options)
  src/options.html/js     trang cài đặt
  src/background.js       menu chuột phải → mở popup với chế độ tương ứng
  _locales/en, vi         chuỗi giao diện
  vendor/, icons/         do `npm run build:docdown` tạo ra
scripts/build-docdown.mjs build; scripts/lib.mjs = helper dùng chung với Readown
scripts/capture-docdown-fixtures.mjs   chụp lại trang thật làm dữ liệu test
test/docdown.engine.test.mjs           engine trên 7 trang thật (offline)
test/docdown.e2e.test.mjs              extension thật: popup, menu, options
store/docdown/            listing, privacy policy, ảnh store
```

## Docdown: chạy trên máy

```bash
npm run build:docdown
```

`chrome://extensions` → **Developer mode** → **Load unpacked** → chọn thư mục `docdown/`.
Mở một trang tài liệu bất kỳ → bấm icon M↓ màu xanh lá (hoặc **Alt+Shift+M**, hoặc chuột phải →
*Clip page to Markdown*). Không cần bật quyền gì thêm.

## Docdown: test, đóng gói, publish

```bash
npm run test:docdown
```

18 test: 9 test engine trên 7 trang thật đã chụp (MDN, React, Docusaurus, MkDocs, GitHub README,
Python docs, Wikipedia tiếng Việt) và 9 test end-to-end của extension. Chụp lại dữ liệu thật:
`node scripts/capture-docdown-fixtures.mjs`.

```bash
npm run package:docdown
```

Tạo `dist/docdown-<version>.zip`. Ảnh store (cần mạng): `npm run store-assets:docdown`.
Publish giống Readown: đăng `store/docdown/privacy-policy.txt` lên một Gist → Developer Dashboard →
*New item* → upload zip → dán nội dung và phần giải thích quyền từ `store/docdown/listing.txt` →
ảnh trong `store/docdown/` → *Submit for review*.

## Docdown: giới hạn đã biết

- Không đọc được trang `chrome://`, Chrome Web Store, trình xem PDF (Chrome chặn) — popup báo rõ.
- Đoạn chọn bên trong shadow DOM hoặc iframe chưa được hỗ trợ.
- Số token là ước tính (ký tự / 4), không theo tokenizer của model cụ thể.
- Clipboard trên Windows trả về xuống dòng CRLF khi dán; file tải về luôn là LF.
