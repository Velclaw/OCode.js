# OCode.js Cloud Agent — MVP

Ứng dụng Next.js PWA độc lập trong `apps/cloud-agent`; không thay đổi package hay module gốc của thư viện OCode.js.

## Có trong MVP
- Chat responsive/PWA, đăng nhập GitHub OAuth và allowlist username, cookie HttpOnly ký HMAC.
- Chat API, lịch sử, task status, health check và OpenAPI contract.
- PostgreSQL làm persistent store/queue; worker chạy process riêng.
- Skills allowlist: `/status`, `/echo ...`, mặc định tạo kế hoạch. Runtime không có shell tùy ý, sửa repository hoặc deploy production.
- Không có DATABASE_URL: demo trong bộ nhớ cùng process, mất dữ liệu khi restart; health trả 503 và worker không chạy. Không dùng chế độ này cho cloud.

## Chạy local
Yêu cầu Node.js >=20.9 và npm.
```sh
cd apps/cloud-agent
cp .env.example .env
# Tạo GitHub OAuth App; callback URL: http://localhost:3000/api/auth/callback
# Điền GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_ALLOWED_USERS và SESSION_SECRET.
npm install
npm run dev
```
Mở http://localhost:3000. Để queue/history bền vững, đặt DATABASE_URL tới PostgreSQL sẵn có rồi chạy `npm run worker` ở terminal khác. Không tự tạo database hoặc dịch vụ trả phí. Trên cloud, web và worker phải là hai process dùng chung PostgreSQL.

## Kiểm tra
```sh
npm test
npm run typecheck
npm run build
```

## Trước production
Cấu hình OAuth client secret và SESSION_SECRET qua dashboard host; allowlist chỉ các GitHub username được duyệt. APP_ORIGIN phải là origin HTTPS chính xác và callback URL của GitHub OAuth App phải khớp tuyệt đối. Xác minh TLS và backup PostgreSQL; bật HTTPS; bổ sung rate limit dùng chung cho nhiều instance, audit/logging/alerting; thêm approval workflow và sandbox riêng trước khi mở skill có tác động. Không commit secrets.
