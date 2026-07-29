-- Plan 3 — schema + RLS + storage cho pokemon-color.
-- Nguồn: §13 "Data model", §"RLS", §"Storage", §"RPC" của design spec.
--
-- ⚠️ SỬA MỘT LỖ BẢO MẬT TRONG SPEC: phần SQL của spec định nghĩa policy nhưng
-- KHÔNG hề `enable row level security` trên bảng nào. Trong Postgres, policy là
-- VÔ HIỆU cho tới khi RLS được bật — bảng vẫn mở hoàn toàn. Vì publishable key
-- được gửi tới mọi browser, chạy đúng SQL của spec sẽ khiến bất kỳ ai cũng đọc,
-- sửa, xoá được toàn bộ dữ liệu của mọi người. Mỗi `create table` dưới đây đi
-- kèm một `enable row level security`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);
alter table profiles enable row level security;

-- ---------------------------------------------------------------- puzzles
create table if not exists puzzles (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  width         int  not null check (width  > 0),
  height        int  not null check (height > 0),
  -- 32, không phải 30: trần bảng nhãn là 30 (MAX_LABELLED_COLORS) nhưng để
  -- 32 cho khớp spec §13 và có chỗ nới nếu bảng nhãn dài ra
  color_count   int  not null check (color_count between 2 and 32),
  region_count  int  not null check (region_count > 0),
  palette       jsonb not null,
  params        jsonb not null,
  edits         jsonb not null default '[]',
  original_path text not null,
  puzzle_path   text not null,
  regions_path  text not null,
  share_token   uuid unique,
  shared_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table puzzles enable row level security;
create index if not exists puzzles_owner_created_idx on puzzles (owner_id, created_at desc);

-- ---------------------------------------------------------------- progress
-- Khoá chính (puzzle_id, user_id): hai người tô cùng một puzzle được chia sẻ
-- thì tiến độ phải độc lập.
create table if not exists progress (
  puzzle_id      uuid not null references puzzles(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  filled         bytea not null,
  filled_count   int not null default 0,
  active_seconds int not null default 0,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (puzzle_id, user_id)
);
alter table progress enable row level security;

-- ---------------------------------------------------------- daily_activity
create table if not exists daily_activity (
  user_id        uuid not null references auth.users(id) on delete cascade,
  day            date not null,
  regions_filled int not null default 0,
  active_seconds int not null default 0,
  primary key (user_id, day)
);
alter table daily_activity enable row level security;

-- ---------------------------------------------------------------- policies
-- profiles: ai cũng đọc được (để hiện tên ở bảng hoàn thành), chỉ tự sửa mình
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select using (true);

drop policy if exists profiles_write on profiles;
create policy profiles_write on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- puzzles: chỉ chủ sở hữu. Người nhận share đi qua RPC security definer.
drop policy if exists puzzles_owner on puzzles;
create policy puzzles_owner on puzzles for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- progress: tự đọc/ghi của mình
drop policy if exists progress_own on progress;
create policy progress_own on progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- đọc được bản ĐÃ HOÀN THÀNH của người khác nếu puzzle đang được chia sẻ
-- (phục vụ bảng hoàn thành)
drop policy if exists progress_read_shared on progress;
create policy progress_read_shared on progress for select using (
  completed_at is not null
  and exists (
    select 1 from puzzles p
    where p.id = progress.puzzle_id and p.share_token is not null
  )
);

drop policy if exists activity_own on daily_activity;
create policy activity_own on daily_activity for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- updated_at
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists puzzles_touch on puzzles;
create trigger puzzles_touch before update on puzzles
  for each row execute function touch_updated_at();

drop trigger if exists progress_touch on progress;
create trigger progress_touch before update on progress
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------- storage
-- Bucket PRIVATE. Layout: <owner_id>/<puzzle_id>/{original.webp, puzzle.bin, regions.json.gz}
insert into storage.buckets (id, name, public)
values ('puzzles', 'puzzles', false)
on conflict (id) do nothing;

drop policy if exists puzzle_files_owner on storage.objects;
create policy puzzle_files_owner on storage.objects for all using (
  bucket_id = 'puzzles' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'puzzles' and (storage.foldername(name))[1] = auth.uid()::text
);

-- puzzle đang chia sẻ: ai cũng đọc được data puzzle, TRỪ ảnh gốc (D7/§11 —
-- người nhận share tô để KHÁM PHÁ bức tranh, thấy ảnh gốc là mất hết ý nghĩa)
drop policy if exists puzzle_files_shared on storage.objects;
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

-- ---------------------------------------------------------------- RPC
-- KHÔNG trả original_path — giữ đúng D7/§11.
create or replace function get_shared_puzzle(token uuid)
returns table (id uuid, owner_id uuid, title text, width int, height int,
               color_count int, region_count int, palette jsonb,
               puzzle_path text, regions_path text)
language sql security definer set search_path = public as $$
  select p.id, p.owner_id, p.title, p.width, p.height, p.color_count,
         p.region_count, p.palette, p.puzzle_path, p.regions_path
  from puzzles p where p.share_token = token;
$$;

-- security definer + search_path đã ghim: thu hồi execute của public rồi chỉ
-- cấp lại cho người đã đăng nhập và khách ẩn danh — mặc định của Postgres là
-- cấp execute cho public, rộng hơn mức cần.
revoke all on function get_shared_puzzle(uuid) from public;
grant execute on function get_shared_puzzle(uuid) to anon, authenticated;
