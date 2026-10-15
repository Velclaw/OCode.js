<div align="center">

<img src="assets/ocode-logo-black.gif" alt="OCode.js animated logo" width="420" />

**A lightweight, dependency-free JavaScript and TypeScript utility toolkit for modern web apps.**

[![npm version](https://img.shields.io/npm/v/ocode-js.svg?label=npm)](https://www.npmjs.com/package/ocode-js)
[![CI](https://github.com/Velclaw/OCode.js/actions/workflows/ci.yml/badge.svg)](https://github.com/Velclaw/OCode.js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-4f8cff.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D18-43853d?logo=node.js&logoColor=white)](https://nodejs.org/)

[English](#english) · [Tiếng Việt](#tiếng-việt) · [API reference](docs/API.md) · [Logo preview](assets/logo-preview.html)

</div>

> **Status:** early development, version 0.1.0. Source code and initial tests are included. The npm badge may remain empty until the package is actually published.

---

## English

OCode.js provides small, composable helpers for common application tasks without runtime dependencies. It is framework-agnostic and can be used with JavaScript, TypeScript, Node.js, and modern web applications including Next.js.

### Features

- **Strings:** slug generation, case conversion, HTML escaping, safe truncation.
- **Objects:** pick, omit, plain-object checks, recursive merge, nested-path reads, JSON cloning.
- **Async:** sleep with abort support, retry with exponential backoff, async deduplication, timeouts.
- **URLs:** query parameter updates, URL joining, safe parsing, tracking-parameter removal.
- **Validation:** email/HTTP URL checks, record/range checks, assertion helpers.
- **HTTP:** typed JSON fetch, JSON headers and request helpers.
- **Browser storage:** guarded localStorage access and JSON read/write helpers.
- **Environment:** read required/optional values and parse booleans/integers.
- **Logging:** a small logger with levels and an injectable output sink.
- **Quality:** strict TypeScript, declarations, source maps, Node test runner and GitHub Actions CI.

### Install

The package is not published to npm yet. After a release is published, install it with:

~~~bash
npm install ocode-js
~~~

For now, clone this repository and build it locally:

~~~bash
git clone https://github.com/Velclaw/OCode.js.git
cd OCode.js
npm install
npm test
~~~

### Quick start

~~~ts
import { slugify, retry, withQuery, isHttpUrl } from "ocode-js";

const slug = slugify("Build a better web");
const docs = withQuery("https://example.com/docs", { source: "app", page: 2 });

const result = await retry(async () => {
  const response = await fetch("https://example.com/api/status");
  if (!response.ok) throw new Error("Request failed: " + response.status);
  return response.json();
}, { attempts: 3, delayMs: 200 });

console.log({ slug, docs, valid: isHttpUrl(docs), result });
~~~

### Import specific modules

~~~
import { slugify } from "ocode-js/string";
import { deepMerge } from "ocode-js/object";
import { retry, withTimeout } from "ocode-js/async";
import { withQuery } from "ocode-js/url";
import { fetchJson } from "ocode-js/http";
~~~

### Next.js compatibility

OCode.js does not require Next.js and does not replace Next.js or Vercel. It is a small utility package that can be used inside a Next.js project. Most helpers are safe for server-side use; browser storage helpers must only be called in the browser. See the [Next.js example](examples/nextjs/README.md).

### API reference

Full module descriptions and safety notes are in the [API reference](docs/API.md).

| Module | Exports |
| --- | --- |
| string | slugify, capitalize, toKebabCase, escapeHtml, truncate, toStringSafe |
| object | isPlainObject, pick, omit, deepMerge, getPath, cloneJson |
| async | sleep, retry, dedupeAsync, withTimeout |
| url | withQuery, joinUrl, parseUrl, stripTrackingParams |
| validation | isNonEmptyString, isEmail, isHttpUrl, isRecord, isWithinRange, assertNonEmptyString |
| http | fetchJson, jsonHeaders, jsonRequest |
| browser | getLocalStorage, readStorage, writeStorage, removeStorage |
| env | getEnv, requireEnv, getEnvBoolean, getEnvNumber |
| logger | createLogger |

### Development

Requirements: Node.js 18 or newer and npm.

~~~
npm install
npm test
npm run build
~~~

Tests use Node's built-in test runner. CI builds the package and runs the test suite on pushes and pull requests to main.

### Roadmap

- [x] Establish project structure and brand assets
- [x] Implement initial TypeScript utility modules
- [x] Add automated tests and CI workflow
- [x] Add initial API reference
- [x] Add tag-triggered npm release workflow
- [ ] Verify npm package-name availability and configure the `NPM_TOKEN` repository secret
- [ ] Run the release checklist and publish the first version
- [ ] Add broader API test coverage and coverage reporting

### Security

Never commit API keys, passwords, private keys, or production environment files. Validate untrusted input at application boundaries. escapeHtml is a basic text escaping helper and is not a substitute for a context-aware HTML sanitizer when rendering untrusted rich HTML.

### License

MIT. See [LICENSE](LICENSE).

---

## Tiếng Việt

OCode.js là bộ tiện ích JavaScript/TypeScript gọn nhẹ, không có dependency lúc chạy, dành cho các tác vụ thường gặp trong ứng dụng web hiện đại. Thư viện không phụ thuộc framework và có thể dùng cùng Node.js, Next.js hoặc dự án web khác.

### Tính năng ban đầu

- **Chuỗi:** tạo slug, chuyển kiểu chữ, escape HTML, cắt chuỗi an toàn.
- **Object:** chọn/bỏ thuộc tính, kiểm tra plain object, merge đệ quy, đọc đường dẫn lồng nhau, sao chép dữ liệu JSON.
- **Bất đồng bộ:** sleep có AbortSignal, retry exponential backoff, gộp lời gọi trùng, timeout.
- **URL:** cập nhật query, nối URL, parse an toàn, xóa tham số tracking.
- **Validation:** kiểm tra email, URL HTTP(S), object và khoảng số.
- **HTTP:** fetch JSON có kiểu, tạo headers và request JSON.
- **Browser storage:** truy cập localStorage có kiểm tra môi trường và xử lý lỗi.
- **Environment:** đọc biến môi trường tùy chọn/bắt buộc và parse boolean/số nguyên.
- **Logger:** log theo cấp độ, hỗ trợ prefix và sink tùy chỉnh.
- **Chất lượng mã:** TypeScript strict, file khai báo kiểu, source map, kiểm thử tự động và GitHub Actions CI.

### Cài đặt và chạy thử

Gói chưa được phát hành lên npm. Hiện tại, clone repository và chạy:

~~~
git clone https://github.com/Velclaw/OCode.js.git
cd OCode.js
npm install
npm test
~~~

Khi phát hành npm thành công, hướng dẫn cài đặt bằng npm install ocode-js sẽ có hiệu lực.

### Dùng với Next.js

OCode.js **không thay thế Next.js hoặc Vercel**; đây là bộ tiện ích có thể nhập vào dự án Next.js. Các tiện ích thông thường có thể dùng phía server. Chỉ gọi hàm localStorage ở phía trình duyệt.

### Tài liệu API

Xem [tài liệu API đầy đủ](docs/API.md) để biết các module, hàm chính và lưu ý an toàn.

### Phát triển

Yêu cầu Node.js 18+ và npm. Chạy npm install, sau đó npm test để build TypeScript và chạy kiểm thử.

### Lộ trình

- [x] Tạo cấu trúc dự án và tài nguyên thương hiệu
- [x] Viết các module tiện ích TypeScript ban đầu
- [x] Bổ sung kiểm thử và CI
- [x] Bổ sung tài liệu API ban đầu
- [x] Tạo workflow phát hành npm theo tag
- [ ] Xác minh tên package npm và cấu hình secret repository `NPM_TOKEN`
- [ ] Chạy checklist release và phát hành phiên bản đầu tiên
- [ ] Mở rộng kiểm thử API và báo cáo coverage

### Bảo mật

Không commit API key, mật khẩu, private key hoặc file môi trường production. Kiểm tra dữ liệu không tin cậy tại ranh giới ứng dụng. Hàm escapeHtml cơ bản không thay thế một HTML sanitizer chuyên dụng khi render HTML không tin cậy.

### Giấy phép

MIT. Xem LICENSE.

---

## Brand assets

- [Animated GIF logo](assets/ocode-logo.gif)
- [Transparent SVG logo](assets/ocode-logo.svg)
- [Responsive animated logo preview](assets/logo-preview.html)
