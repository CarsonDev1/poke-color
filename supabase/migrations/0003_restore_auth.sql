-- ĐẢO LẠI 0002 — khôi phục bảo mật theo người dùng.
--
-- KHÔNG chạy file này trong chế độ một-người-dùng: nó khoá dữ liệu theo
-- auth.uid(), nên app không đăng nhập sẽ không đọc/ghi được gì nữa.
--
-- Chạy khi bạn muốn deploy công khai. Cần làm THÊM ở phía app:
--   1. Bật lại route /login và `useSession` (xem git history trước commit
--      "chế độ một người dùng").
--   2. Thay SOLO_USER_ID bằng session.userId thật ở progress-repo / puzzle-repo
--      / drain / use-sync.
--
-- ⚠️ Dữ liệu đã tạo ở chế độ solo mang owner_id = SOLO_USER_ID, KHÔNG khớp
-- auth.uid() của bạn. Sau khi chạy file này, chúng sẽ vô hình. Đổi chủ trước:
--
--   update puzzles        set owner_id = '<uid-thật-của-bạn>' where owner_id = '00000000-0000-0000-0000-000000000001';
--   update progress       set user_id  = '<uid-thật-của-bạn>' where user_id  = '00000000-0000-0000-0000-000000000001';
--   update daily_activity set user_id  = '<uid-thật-của-bạn>' where user_id  = '00000000-0000-0000-0000-000000000001';
--
-- Lấy uid thật: đăng nhập rồi chạy `select auth.uid();`, hoặc xem
-- Authentication → Users trong dashboard.

-- ---------------------------------------------------------------- FK tới auth
alter table profiles
  add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
alter table puzzles
  add constraint puzzles_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade;
alter table progress
  add constraint progress_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table daily_activity
  add constraint daily_activity_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

-- ---------------------------------------------------------------- policies
drop policy if exists profiles_solo on profiles;
create policy profiles_read on profiles for select using (true);
create policy profiles_write on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists puzzles_solo on puzzles;
create policy puzzles_owner on puzzles for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists progress_solo on progress;
create policy progress_own on progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy progress_read_shared on progress for select using (
  completed_at is not null
  and exists (
    select 1 from puzzles p
    where p.id = progress.puzzle_id and p.share_token is not null
  )
);

drop policy if exists activity_solo on daily_activity;
create policy activity_own on daily_activity for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- storage
drop policy if exists puzzle_files_solo on storage.objects;

create policy puzzle_files_owner on storage.objects for all using (
  bucket_id = 'puzzles' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'puzzles' and (storage.foldername(name))[1] = auth.uid()::text
);

create policy puzzle_files_shared on storage.objects for select using (
  bucket_id = 'puzzles'
  and storage.filename(name) <> 'original.webp'
  and exists (
    select 1 from puzzles p
    where p.share_token is not null
      and (storage.foldername(name))[1] = p.owner_id::text
      and (storage.foldername(name))[2] = p.id::text
  )
);
