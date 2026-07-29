/**
 * Chế độ MỘT NGƯỜI DÙNG, KHÔNG ĐĂNG NHẬP.
 *
 * App không có auth, nên không có `auth.uid()` để làm chủ sở hữu. Mọi hàng dùng
 * chung một UUID cố định này. Nó KHÔNG phải là bí mật và không bảo vệ gì —
 * bảo vệ nằm ở chỗ policy trong `0002_solo_no_auth.sql` mở cho `anon`, tức là
 * không có bảo vệ nào.
 *
 * ⚠️ Ai có URL app đều đọc/sửa/xoá được toàn bộ dữ liệu. Đây là lựa chọn có ý
 * thức cho app dùng riêng. Muốn deploy công khai thì chạy
 * `0003_restore_auth.sql` và thay hằng số này bằng `session.userId` thật.
 *
 * Là UUID hợp lệ (không phải chuỗi tuỳ ý) vì cột `owner_id`/`user_id` có kiểu
 * `uuid` — Postgres sẽ từ chối bất cứ thứ gì khác.
 */
export const SOLO_USER_ID = '00000000-0000-0000-0000-000000000001'
