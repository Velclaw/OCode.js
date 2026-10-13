# Velclaw Cloud Agent — MVP

Next.js PWA độc lập trong thư mục mới, không thay đổi package hay module gốc của thư viện OCode.js.

## Có trong MVP
- Chat responsive/PWA, login bằng mật khẩu cấu hình, cookie HttpOnly ký HMAC.
- Chat API, lịch sử, task status, health check và OpenAPI contract.
- PostgreSQL làm persistent store/queue; worker chạy process riêng.
- Skills allowlist: `/status`, `/echo ...`, mặc định tạo kế hoạch. Không có LLM/API key, shell tùy ý, sửa repository hoặc deploy production.
- Không có DATABASE_URL: demo trong bộ nhớ cùng process, mất dữ liệu khi restart; health trả 503 và worker không chạy. Không dùng chế độ này cho cloud.

## Chạy local
Yêu cầu Node.js >=20.9 và npm.
```sh
cd apps/cloud-agent
cp .env.example .env
# Đặt ADMIN_PASSWORD >=16 ký tự và SESSION_SECRET >=32 ký tự.
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
Cấu hình secret qua dashboard host; xác minh TLS và backup PostgreSQL; bật HTTPS; bổ sung rate limit dùng chung cho nhiều instance, audit/logging/alerting; thêm OIDC/passkeys nếu có nhiều người dùng; thêm approval workflow và sandbox riêng trước khi mở skill có tác động. DATABASE_SSL=true bật TLS với kiểm tra chứng chỉ theo CA tin cậy của runtime. Chưa deploy trong PR này.
