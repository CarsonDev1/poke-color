-- Chế độ MỘT NGƯỜI DÙNG, KHÔNG ĐĂNG NHẬP.
--
-- ⚠️⚠️ ĐỌC TRƯỚC KHI CHẠY ⚠️⚠️
--
-- Migration này MỞ TOÀN BỘ DỮ LIỆU CHO CÔNG CHÚNG. Publishable key nằm trong
-- bundle JS nên ai mở DevTools cũng đọc được, và sau khi chạy file này thì chỉ
-- cần key đó là đọc/sửa/XOÁ SẠCH được mọi thứ — bằng một lệnh curl, không cần
-- mở app.
--
-- Chỉ chạy khi: app KHÔNG deploy công khai (chỉ localhost / mạng nội bộ), hoặc
-- bạn chấp nhận rủi ro trên. Muốn đảo lại thì chạy 0003_restore_auth.sql.
--
-- RLS vẫn được BẬT (không `disable row level security`) và policy vẫn tồn tại,
-- chỉ là cho phép `anon`. Làm vậy để đảo lại chỉ cần thay policy, và để
-- `\dp` vẫn cho thấy rõ bảng đang mở cho ai — tắt RLS hẳn sẽ không còn dấu vết
-- nào trong danh sách policy.

-- ---------------------------------------------------------------- FK tới auth
-- Không có đăng nhập ⇒ không có hàng nào trong auth.users ⇒ mọi insert sẽ vi
-- phạm khoá ngoại. Bỏ FK, dùng một UUID cố định phía app (SOLO_USER_ID).
alter table profiles       drop constraint if exists profiles_id_fkey;
alter table puzzles        drop constraint if exists puzzles_owner_id_fkey;
alter table progress       drop constraint if exists progress_user_id_fkey;
alter table daily_activity drop constraint if exists daily_activity_user_id_fkey;

-- ---------------------------------------------------------------- policies
-- Thay policy dựa trên auth.uid() bằng policy cho anon + authenticated.
-- `using (true) with check (true)` = mở hoàn toàn.

drop policy if exists profiles_read  on profiles;
drop policy if exists profiles_write on profiles;
create policy profiles_solo on profiles for all
  to anon, authenticated using (true) with check (true);

drop policy if exists puzzles_owner on puzzles;
create policy puzzles_solo on puzzles for all
  to anon, authenticated using (true) with check (true);

drop policy if exists progress_own         on progress;
drop policy if exists progress_read_shared on progress;
create policy progress_solo on progress for all
  to anon, authenticated using (true) with check (true);

drop policy if exists activity_own on daily_activity;
create policy activity_solo on daily_activity for all
  to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------- storage
-- Policy cũ so (storage.foldername(name))[1] với auth.uid()::text — luôn sai
-- khi không đăng nhập, nên upload sẽ bị chặn hết.
drop policy if exists puzzle_files_owner  on storage.objects;
drop policy if exists puzzle_files_shared on storage.objects;

create policy puzzle_files_solo on storage.objects for all
  to anon, authenticated
  using (bucket_id = 'puzzles')
  with check (bucket_id = 'puzzles');

-- Bucket vẫn PRIVATE: đọc tệp phải đi qua API kèm apikey, không phải URL công
-- khai đoán được. Đây không phải bảo mật thật (key là công khai) nhưng chặn
-- được crawler tình cờ.
update storage.buckets set public = false where id = 'puzzles';
