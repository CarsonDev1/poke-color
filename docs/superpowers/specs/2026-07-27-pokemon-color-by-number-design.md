# Spec — Web app tô màu theo số từ ảnh tự upload

- **Ngày**: 2026-07-27
- **Trạng thái**: chờ review
- **Tên dự án**: pokemon-color

---

## 1. Mục tiêu

Một web app biến **một tấm tranh minh hoạ bất kỳ do người dùng upload** (mục đích chính: tranh Pokémon có cả môi trường sống — kiểu trang sách *Coloriages mystères Pokémon*) thành một **bức tranh tô màu theo số**: ảnh được thuật toán cắt thành các vùng hình dạng bất kỳ, mỗi vùng có một con số, người dùng chọn màu rồi tô từng vùng cho tới khi bức tranh hoàn chỉnh hiện ra.

Nguồn tham chiếu về hình thức mong muốn:

- <https://www.amazon.in/Coloriages-myst%C3%A8res-Pok%C3%A9mon-chiffres-d%C3%A9couvre/dp/2017276693>
- <https://www.scribd.com/document/932281489/Pokemon> — sách 111 trang, tranh Pokémon kèm bảng mã màu, "color and discover hidden images"

**Không dùng nguồn ảnh tự động (PokeAPI/pokesprite).** Lý do: sprite chỉ có con Pokémon trên nền trong suốt, không có khung cảnh/môi trường — không đạt được hình thức tranh trong sách. Toàn bộ nội dung đến từ ảnh người dùng cấp.

## 2. Người dùng & phạm vi sử dụng

Công cụ cá nhân, một chủ sở hữu tự upload ảnh của mình, có thể chia sẻ puzzle cho người khác cùng tô. Không có nội dung Pokémon nào được đóng gói trong repo → không phát sinh vấn đề bản quyền IP từ phía sản phẩm; trách nhiệm về ảnh upload thuộc người upload.

## 3. Quyết định đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Cắt ảnh thành **vùng hình dạng bất kỳ** (region segmentation), không phải lưới ô vuông | Đúng hình thức trang sách tham chiếu: trời là một vùng lớn, thân Pokémon một vùng, má đỏ một vùng nhỏ. Lưới ô vuông ra mosaic thô, và với tranh có môi trường thì cần rất nhiều ô mới nhận ra chi tiết |
| D2 | **Chặn tô sai màu** | Chọn màu 3 thì chỉ vùng số 3 nhận màu; bấm vùng khác không ăn, chỉ nháy phản hồi. Hình hiện ra luôn đúng → cảm giác reveal trọn vẹn, không cần tẩy. Kéo theo: trạng thái mỗi vùng chỉ cần 1 bit |
| D3 | **Toàn bộ xử lý ảnh chạy client-side trong Web Worker** | Supabase Edge Function chạy Deno, image processing ở đó khổ và tốn tiền. Client làm miễn phí, không giới hạn, ảnh không cần round-trip |
| D4 | **Vite + React + TypeScript**, build ra static | Cần Node sẵn cho test; Vitest test được toàn bộ `core/` trong milliseconds không cần browser |
| D5 | **Supabase Storage + Postgres + Auth magic-link + RLS** | Đồng bộ đa thiết bị (tô dở trên máy tính, tô tiếp trên điện thoại) và dữ liệu được bảo vệ đúng cách. Không auth thì anon key trong JS client cho phép bất kỳ ai đọc/xoá/upload toàn bộ ảnh |
| D6 | **Bước preview-và-tinh-chỉnh trước khi lưu là bắt buộc** | Segmentation tự động về bản chất không đoán trước được: cùng tham số, ảnh nền phẳng ra 300 vùng đẹp, ảnh nhiều cỏ/mây gradient ra 6000 vùng vụn. Không có vòng xem-rồi-chỉnh thì người dùng lưu ra hàng loạt puzzle không tô được |
| D7 | **Ảnh gốc không dùng để reveal** — tranh hoàn chỉnh render từ `regionMap` + palette | Bỏ được nhu cầu phân quyền phức tạp cho `original.webp`; ảnh gốc chỉ chủ sở hữu đọc |
| D8 | **Vector hoá qua "crack graph"**, đơn giản hoá mỗi chuỗi biên đúng một lần | Trace contour từng vùng rồi Douglas-Peucker độc lập sẽ làm hai vùng kề nhau đơn giản hoá đường biên chung theo hai cách khác nhau → in ra hở kẽ và chồng nét |
| D9 | **Không có Undo khi tô**, chỉ có "Tô lại từ đầu" | Đã chặn tô sai thì không thể tô sai → không có gì để hoàn tác. (Editor sửa vùng *có* undo/redo, xem §9) |
| D10 | Không đóng gói thư viện Pokémon sẵn | Xem §1 |
| D11 | Không có leaderboard toàn cầu; thay bằng **thống kê cá nhân + bảng hoàn thành cho từng puzzle được chia sẻ** | Xếp hạng toàn cầu vô nghĩa khi mỗi puzzle là ảnh riêng của một người. "Ai đã tô xong puzzle tôi share, mất bao lâu" thì có nghĩa |
| D12 | Sửa vùng thủ công gồm **gộp + đổi màu**, không có cắt vùng bằng đường vẽ | Gộp + đổi màu xử lý đúng hai lỗi thực tế (vùng vụn, vùng bị gán sai màu). Cắt vùng cần vẽ đường cắt + tách lại thành phần liên thông, chi phí lớn, không giải quyết lỗi nào mà hai thao tác kia bỏ sót |

## 4. Giả định (không cần hỏi lại, nêu rõ để review bắt lỗi)

- **A1** — Ảnh input là PNG/JPEG/WebP. HEIC không hỗ trợ (browser không decode được), báo lỗi rõ ràng.
- **A2** — "Bí ẩn" là **luật chơi mềm, không phải bảo mật**. Người nhận link chia sẻ về lý thuyết có thể mở devtools render ra tranh giải. Chấp nhận.
- **A3** — Người nhận link chia sẻ **chơi được không cần đăng nhập**; tiến độ của họ lưu IndexedDB. Nếu sau đó họ đăng nhập, tiến độ local được migrate lên tài khoản.
- **A4** — Âm thanh **mặc định bật**, tổng hợp bằng WebAudio oscillator (không có file asset nào), có nút tắt lưu vào localStorage. AudioContext khởi tạo/resume ở lần `pointerdown` đầu tiên (browser bắt buộc user gesture).
- **A5** — Sửa vùng trên puzzle đã có tiến độ sẽ **reset tiến độ của puzzle đó** (id vùng thay đổi ⇒ bitset cũ vô nghĩa). Có cảnh báo xác nhận trước khi lưu.
- **A6** — In: mặc định vừa **1 trang A4**, có tuỳ chọn chia **2×2 trang** cho tranh chi tiết cao. Không làm tiling tuỳ ý N×M.
- **A7** — Ngôn ngữ UI: tiếng Việt, hardcode (không dựng i18n).

## 5. Kiến trúc

```
                       ┌──────────────── Browser ────────────────┐
  Ảnh upload  ──────▶  │  UI (React)                             │
                       │    │                                    │
                       │    ▼  postMessage                       │
                       │  generate.worker  ── pipeline 7 stage ─┐ │
                       │  vectorize.worker ── crack graph ─────┐│ │
                       │    │                                  ││ │
                       │    ▼                                  ▼▼ │
                       │  render/ (canvas layers, hit-test)       │
                       │  audio/ (WebAudio synth)                 │
                       │  data/  ── local-cache (IndexedDB) ──┐   │
                       └──────────────────────────────────────┼───┘
                                                             ▼
                                          Supabase: Auth · Storage · Postgres+RLS
```

Luồng nghiệp vụ:

```
Upload → chuẩn hoá → làm phẳng → quantize → tách vùng → gộp vùng vụn
       → đặt số → vẽ viền → đóng gói
       → PREVIEW (tinh chỉnh, sinh lại, sửa vùng thủ công)
       → Lưu Supabase → Chơi ⇄ Sync → Hoàn thành → In / Chia sẻ
```

## 6. Pipeline sinh puzzle

Chạy trong `generate.worker.ts`, phát tiến độ theo từng stage để UI hiện progress bar có tên bước.

### Stage 0 — Chuẩn hoá

- `createImageBitmap` decode.
- Scale cạnh dài về `maxDim` (mặc định 1400px, cho phép 800–2000). Cap để giới hạn khối lượng tính và giữ vùng đủ to để tô bằng ngón tay.
- Ghép alpha lên nền trắng → RGBA `Uint8ClampedArray`.

### Stage 1 — Làm phẳng (bỏ bước này là vỡ trận ở Stage 3)

- Median 3×3, 2 lượt — diệt noise JPEG và dithering.
- Bilateral filter (σ_không_gian = 3, σ_màu = 25) — làm phẳng gradient **mà không phá cạnh**.
- Cường độ điều chỉnh được qua tham số `smoothing` (0–3 lượt bilateral).

### Stage 2 — Quantize về K màu

- Làm việc trong **không gian Lab** (sRGB → linear → XYZ → Lab). RGB không phản ánh khoảng cách màu theo mắt người.
- k-means, khởi tạo bằng kết quả **median-cut**, **seed cố định**, cap 20 vòng lặp.
- ⇒ **Deterministic**: cùng input + cùng params luôn ra byte-identical. Đây là điều kiện để (a) sinh lại puzzle từ `params` đã lưu, (b) test bằng snapshot.
- `K` mặc định 12, cho phép 6–24.
- Output: `labels: Uint8Array(w*h)`, `palette: RGB[K]` (lưu dạng hex).

### Stage 3 — Tách vùng

- Connected components 4-hướng trên `labels` → `regionMap: Uint32Array(w*h)`.
- Flood fill dùng **stack tường minh**, không đệ quy — ảnh 1400px sẽ tràn call stack.
- Metadata mỗi vùng: `{ id, colorIndex, area, bbox }`.

### Stage 4 — Gộp vùng vụn *(núm điều chỉnh quan trọng nhất của cả sản phẩm)*

- Dựng bảng kề (adjacency) kèm **độ dài biên chung** giữa từng cặp vùng.
- Vùng có `area < minArea` → gộp vào láng giềng **chung biên dài nhất**, nhận `colorIndex` của láng giềng đó.
- Lặp tối đa 8 lượt (mỗi lượt vùng nhỏ có thể sinh ra vùng nhỏ mới sau khi gộp), sau đó force-merge phần còn lại.
- Thêm: gộp 2 vùng kề nhau nếu ΔE(Lab) giữa hai màu palette của chúng < `mergeDeltaE` (mặc định 6) — giảm việc palette bị dùng lặp cho hai màu mắt không phân biệt được.
- `minArea` mặc định suy ra từ preset; đây là thứ biến 6000 blob thành ~400 vùng tô được.

### Stage 5 — Đặt số

- Với mỗi vùng: **distance transform** (chamfer 2 lượt) trên mask vùng → lấy điểm xa biên nhất (`pole of inaccessibility`) làm chỗ ghi số, kèm bán kính nội tiếp `anchorR`.
- **Không dùng centroid**: centroid của vùng hình chữ C nằm ngoài vùng.
- `anchorR < minLabelRadius` (mặc định 7px ở scale 1) ⇒ `hasLabel = false`, vùng đó không in số. Bù bằng helper highlight-theo-màu (§8).

### Stage 6 — Vẽ viền

- Pixel nào có `regionMap` khác pixel phải hoặc pixel dưới ⇒ pixel biên.
- Bake thành mask alpha 1px, cache `ImageBitmap`, vẽ một lần dùng lại mọi frame.

### Stage 7 — Đóng gói

- `puzzle.bin`: header `{ magic, version, w, h, K, regionCount }` + palette + `regionMap` mã hoá **RLE theo dòng** (`[runLength, regionId]`), rồi gzip qua `CompressionStream('gzip')`. Vùng phẳng lớn nên RLE ăn rất mạnh — ảnh 1400×1000 ước 60–150 KB sau nén.
- `regions.json.gz`: mảng `{ id, colorIndex, area, anchorX, anchorY, anchorR, hasLabel }`.
- **Pixel-runs mỗi vùng** derive được từ RLE khi decode → tô một vùng chỉ cần vài lệnh `fillRect`, không quét cả ảnh.

### Preset

| Preset | K | Số vùng mục tiêu |
|---|---|---|
| Dễ | 8 | ~200 |
| Vừa | 12 | ~500 |
| Khó | 16 | ~1000 |

Kèm slider tay cho `số màu` và `độ chi tiết` (điều khiển `minArea`). `minArea` được **tự động dò** bằng bisection để số vùng rơi vào ±25% mục tiêu của preset; slider tay ghi đè giá trị dò được.

Bisection chỉ chạy lại **Stage 3 → 4** từ `labels` đã cache của Stage 2 (Stage 0–2 là phần đắt nhất và không phụ thuộc `minArea`), tối đa 6 vòng. Ngân sách hiệu năng cho toàn bộ lệnh sinh (gồm cả bisection) là timeout 60s ở §17. Đổi `số màu` mới phải chạy lại từ Stage 2.

## 7. Vector hoá & in ấn

Chạy trong `vectorize.worker.ts`, chỉ khi vào màn in hoặc xuất SVG.

1. **Crack lattice**: đỉnh tại góc pixel, lưới `(w+1)×(h+1)`. Mỗi đoạn "crack" nằm giữa 2 pixel khác vùng.
2. **Node**: điểm góc nơi có **≥3 vùng khác nhau gặp nhau**, hoặc điểm nằm trên biên ảnh nơi vùng đổi. Các đỉnh còn lại là điểm giữa chuỗi.
3. **Chain**: chuỗi crack giữa 2 node, thuộc đúng 2 vùng (hoặc 1 vùng + ngoài ảnh).
4. **Đơn giản hoá mỗi chain đúng một lần**: Douglas-Peucker ε ≈ 0.75px, giữ nguyên 2 đầu.
5. **Làm mềm**: Chaikin subdivision 1–2 lượt trên chain đã đơn giản hoá, giữ nguyên 2 đầu → nét mềm giống vẽ tay.
6. **Ghép path từng vùng**: đi vòng các chain quanh vùng thành ring; vùng có lỗ ⇒ nhiều subpath, `fill-rule="evenodd"`.
   - Vì mỗi chain dùng chung cho đúng 2 vùng và chỉ được đơn giản hoá một lần ⇒ **không hở kẽ, không chồng nét**.
7. **Xuất SVG**:
   - Bản để tô: `<path fill="none" stroke="#000" stroke-width=".6">` + `<text>` số tại `anchor`.
   - Bản giải: `<path>` fill màu palette, không stroke.

**In** (`/print/:id`): `@page { size: A4; margin: 10mm }`, ảnh vừa 1 trang (mặc định) hoặc chia 2×2 trang có nhãn trang và mép chồng 4mm. Kèm **trang legend**: ô màu + số + hex + số vùng của mỗi màu. Tuỳ chọn in kèm trang giải.

## 8. Engine tô màu

**Trạng thái**: `filled: Uint8Array(regionCount)`, mỗi phần tử 0/1 — vì đã chặn tô sai, vùng chỉ có "chưa tô" hoặc "đã tô đúng". Lưu dạng bitset: 800 vùng = 100 byte.

**Hit test**: toạ độ màn hình → nghịch đảo transform viewport → pixel ảnh → tra `regionMap` → `regionId`. O(1).

**Tô**: `tryPaint(regionId, colorIndex)`
- khớp ⇒ `filled[id] = 1`, vẽ lại **đúng các pixel-run của vùng đó**, phát âm thanh, trả `{ status: 'filled' }`
- không khớp ⇒ không đổi state, nháy đỏ vùng đó 150ms, âm thanh reject, trả `{ status: 'rejected', expected }`
- đã tô rồi ⇒ `{ status: 'already' }` (idempotent)

**Layer render**:
1. `base` — vùng đã tô: màu palette; vùng chưa tô: trắng ngà
2. `outline` — `ImageBitmap` viền đen, cache
3. `labels` — số, vẽ ở scale hiện tại nên **luôn đọc được khi zoom**, chỉ vẽ vùng trong viewport + chưa tô + `hasLabel`
4. `highlight` — tint nhẹ các vùng chưa tô của màu đang chọn

**Tương tác**:
- **Kéo để tô**: giữ chuột/ngón rê qua nhiều vùng, vùng nào đúng màu thì tô — cứu khỏi việc bấm 200 lần cho nền trời.
- **Highlight theo màu**: chọn màu 7 ⇒ mọi vùng số 7 chưa tô sáng nhẹ. Đây là thứ bù cho các vùng nhỏ không in được số.
- **Palette bar**: hiện số vùng **còn lại** của từng màu; màu nào xong thì mờ đi + tick.
- **Zoom/pan**: wheel + pinch + kéo bằng 2 ngón; nút fit/100%.
- **"Xem ảnh gốc"** (chỉ chủ sở hữu): mặc định ẩn, bấm mới hiện. Puzzle được chia sẻ: người nhận **không** có nút này và không đọc được `original.webp`.
- **Hoàn thành 100%**: mở tranh không viền + confetti + âm fanfare; chủ sở hữu thấy thêm ảnh gốc cạnh tranh đã tô.
- **Tô lại từ đầu**: xác nhận rồi xoá bitset.

**A11y**: số 1–9 / 0 chọn màu; `[` `]` đổi trang palette khi K > 10; Tab/mũi tên di chuyển con trỏ vùng theo thứ tự đọc; Enter tô; `aria-live` thông báo `"đã tô vùng, còn 214 vùng"`; focus ring vẽ trên layer riêng.

**Autosave**: ghi IndexedDB ngay lập tức; debounce 1.5s đẩy Supabase. Mất mạng vẫn tô được, banner "chưa đồng bộ", online lại tự đẩy.

**Đếm thời gian**: chỉ tính "thời gian hoạt động" — tab visible và có tương tác trong 30s gần nhất, cộng dồn vào `active_seconds`.

## 9. Editor sửa vùng (`/edit/:id`)

Thao tác:
- `mergeRegions(a, b)` — chỉ khi 2 vùng kề nhau; `b` bị hấp thụ vào `a`, nhận `colorIndex` của `a`.
- `setRegionColor(r, colorIndex)` — gán vùng sang màu palette khác.
- `mergeAllSmallerThan(area)` — gộp loạt, dùng lại logic Stage 4.

Sau mỗi *batch* thao tác, **recompute toàn bộ** metadata + anchor + outline từ `regionMap` (~50ms cho 1.4MP) thay vì cập nhật tăng dần — đơn giản và không có nguy cơ lệch trạng thái.

Có **undo/redo** (khác với lúc tô, ở đây sai được nên cần). Lưu `edits` log vào `puzzles.edits` để tái tạo được puzzle từ `params` + `edits`.

Việc replay `edits` chỉ đúng vì pipeline deterministic (D2 §6 Stage 2): cùng ảnh gốc + cùng `params` luôn cho ra cùng tập `regionId`, nên các thao tác gộp/đổi màu tham chiếu theo id vẫn trỏ đúng vùng khi chạy lại. Đây là lý do nghiệp vụ khiến determinism là yêu cầu bắt buộc chứ không phải tiện lợi cho test.

Lưu lại ⇒ cảnh báo reset tiến độ (A5).

## 10. Âm thanh

`src/audio/synth.ts`, tổng hợp bằng WebAudio oscillator, **không có file asset**:

| Sự kiện | Âm |
|---|---|
| tô đúng | sine blip ngắn, cao độ tăng dần theo % hoàn thành |
| tô sai | square thud trầm |
| xong một màu | arpeggio 2 nốt |
| xong 100% | fanfare 5 nốt |

Nút tắt tiếng, lưu localStorage. Khởi tạo/resume AudioContext ở `pointerdown` đầu tiên.

## 11. Chia sẻ

- Chủ sở hữu bật chia sẻ ⇒ sinh `share_token uuid`, link `/s/:token`.
- Người nhận **không cần đăng nhập**: RPC `get_shared_puzzle(token)` (`security definer`) trả metadata; Storage policy cho đọc `puzzle.bin` + `regions.json.gz` của puzzle đang chia sẻ, **không** cho `original.webp`.
- Tiến độ người nhận: IndexedDB nếu chưa đăng nhập; đăng nhập rồi thì lên Postgres, và tiến độ local được migrate.
- **Bí ẩn thật sự** ở đây: người nhận không biết ảnh gì cho tới khi tô xong.
- Tắt chia sẻ ⇒ `share_token = null`, link chết.

## 12. Thống kê (`/stats`)

- Theo puzzle: thời gian hoạt động, vùng/phút, thời điểm hoàn thành.
- Tổng: số puzzle hoàn thành, tổng vùng đã tô, tổng thời gian, chuỗi ngày liên tiếp.
- **Bảng hoàn thành** cho mỗi puzzle mình chia sẻ: `display_name` + thời gian, sắp theo thời gian tăng dần (chỉ những người đã đăng nhập và đã hoàn thành).

## 13. Data model

```sql
create extension if not exists pgcrypto;

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table puzzles (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  width         int  not null check (width  > 0),
  height        int  not null check (height > 0),
  color_count   int  not null check (color_count between 2 and 32),
  region_count  int  not null check (region_count > 0),
  palette       jsonb not null,                 -- [{index, hex}]
  params        jsonb not null,                 -- {maxDim,k,minArea,smoothing,mergeDeltaE}
  edits         jsonb not null default '[]',    -- log thao tác sửa vùng thủ công
  original_path text not null,
  puzzle_path   text not null,
  regions_path  text not null,
  share_token   uuid unique,                    -- null = không chia sẻ
  shared_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on puzzles (owner_id, created_at desc);

create table progress (
  puzzle_id      uuid not null references puzzles(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  filled         bytea not null,                -- bitset, 1 bit/vùng
  filled_count   int not null default 0,
  active_seconds int not null default 0,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (puzzle_id, user_id)
);

create table daily_activity (
  user_id        uuid not null references auth.users(id) on delete cascade,
  day            date not null,
  regions_filled int not null default 0,
  active_seconds int not null default 0,
  primary key (user_id, day)
);
```

Khoá chính của `progress` là `(puzzle_id, user_id)` — bắt buộc, để hai người tô cùng một puzzle được chia sẻ mà tiến độ độc lập.

### RLS

```sql
-- profiles: ai cũng đọc được (để hiện tên ở bảng hoàn thành), chỉ tự sửa mình
create policy profiles_read  on profiles for select using (true);
create policy profiles_write on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- puzzles: chỉ chủ sở hữu. Người nhận share đi qua RPC security definer.
create policy puzzles_owner on puzzles for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- progress: tự đọc/ghi của mình; đọc được bản đã hoàn thành của người khác
-- nếu puzzle đang được chia sẻ (phục vụ bảng hoàn thành)
create policy progress_own on progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy progress_read_shared on progress for select using (
  completed_at is not null
  and exists (select 1 from puzzles p
              where p.id = progress.puzzle_id and p.share_token is not null)
);

create policy activity_own on daily_activity for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

### Storage

Bucket `puzzles`, **private**. Layout: `<owner_id>/<puzzle_id>/{original.webp, puzzle.bin, regions.json.gz}`.

```sql
create policy puzzle_files_owner on storage.objects for all using (
  bucket_id = 'puzzles' and (storage.foldername(name))[1] = auth.uid()::text
);

-- puzzle đang chia sẻ: ai cũng đọc được data puzzle, TRỪ ảnh gốc
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
```

### RPC

```sql
create function get_shared_puzzle(token uuid)
returns table (id uuid, owner_id uuid, title text, width int, height int,
               color_count int, region_count int, palette jsonb,
               puzzle_path text, regions_path text)
language sql security definer set search_path = public as $$
  select p.id, p.owner_id, p.title, p.width, p.height, p.color_count,
         p.region_count, p.palette, p.puzzle_path, p.regions_path
  from puzzles p where p.share_token = token;
$$;
```

Không trả `original_path` — giữ đúng D7/§11.

## 14. Đồng bộ & offline

- **IndexedDB** là nguồn sự thật cho session đang chơi: `puzzles` (blob đã decode), `progress` (bitset), `outbox` (thay đổi chờ đẩy).
- Ghi local đồng bộ (synchronous với hành động), đẩy Supabase debounce 1.5s.
- `daily_activity` do client **upsert** (`on conflict (user_id, day) do update`, cộng dồn) cùng nhịp debounce 1.5s với `progress`, theo ngày local của người dùng.
- Xung đột (tô trên 2 thiết bị): hợp nhất bằng **OR bitset** — hai người/hai thiết bị đều chỉ *thêm* vùng đã tô, nên OR là phép hợp nhất đúng, không mất dữ liệu. `active_seconds` lấy max, `completed_at` lấy min khác null.
- Mất mạng: banner "chưa đồng bộ · N thay đổi", tự đẩy khi `online`.

## 15. Cấu trúc module & luật phụ thuộc

```
src/
  core/                 ← TypeScript thuần. KHÔNG DOM, KHÔNG window, KHÔNG React
    color/              srgb-lab.ts, delta-e.ts
    filters/            median.ts, bilateral.ts
    quantize/           median-cut.ts, kmeans.ts, quantize.ts
    regions/            connected-components.ts, adjacency.ts, merge-small.ts,
                        distance-transform.ts, label-anchor.ts, outline.ts,
                        region-runs.ts
    vector/             crack-graph.ts, simplify.ts, chaikin.ts,
                        assemble-paths.ts, svg.ts
    editor/             edit-ops.ts, edit-history.ts, recompute.ts
    codec/              rle.ts, bitset.ts, puzzle-encode.ts, puzzle-decode.ts
    engine/             paint-engine.ts, stats.ts
    pipeline.ts         ← xâu 7 stage, phát progress
  worker/               generate.worker.ts, vectorize.worker.ts   (mỏng: postMessage ↔ core)
  render/               viewport.ts, layers.ts, hit-test.ts, label-layer.ts,
                        highlight.ts                              (biết DOM, không biết React)
  audio/                synth.ts
  data/                 supabase.ts, puzzle-repo.ts, progress-repo.ts,
                        share-repo.ts, profile-repo.ts, local-cache.ts, sync.ts
  ui/                   components + hooks
  routes/               login, library, new, play, edit, print, shared, stats
supabase/
  migrations/           *.sql
docs/superpowers/specs/
```

**Luật**: `core/` không import từ `ui/`, `data/`, `render/`, `worker/` và không chạm `window`/`document`. Vào là mảng số + tham số, ra là mảng số. Nhờ vậy phần khó nhất của dự án test được bằng Vitest chạy trong milliseconds, không cần browser.

## 16. Các màn hình

**Thumbnail thư viện** — cần nói rõ vì đây là bẫy hiệu năng: *không* render thumbnail bằng cách tải `puzzle.bin` của từng puzzle khi mở `/library` (20 puzzle × ~100 KB + decode = màn hình treo vài giây). Thay vào đó: khi rời màn chơi, render trạng thái hiện tại xuống WebP 320px và cache vào IndexedDB theo `puzzle_id`. Card nào chưa có thumbnail thì hiện placeholder + thanh %.

| Route | Nội dung |
|---|---|
| `/login` | magic link qua email |
| `/library` | lưới puzzle: thumbnail, tên, %, badge chia sẻ. Hành động: chơi · sửa vùng · in · chia sẻ · xoá |
| `/new` | dropzone → chọn preset → preview line-art + số trên canvas, slider `số màu` / `độ chi tiết`, nút "Sinh lại", cảnh báo nếu > 2000 vùng → "Lưu" |
| `/play/:id` | canvas + palette bar + zoom + xem ảnh gốc + % + tắt tiếng + tô lại |
| `/edit/:id` | gộp 2 vùng kề · đổi màu vùng · gộp mọi vùng < N px · undo/redo · lưu (cảnh báo reset tiến độ) |
| `/print/:id` | preview A4, 1 trang / 2×2 trang, có/không trang giải, trang legend, nút in + tải SVG |
| `/s/:token` | chơi puzzle được chia sẻ, không cần đăng nhập, ảnh gốc bị ẩn hoàn toàn |
| `/stats` | thống kê cá nhân + bảng hoàn thành các puzzle đã chia sẻ |

## 17. Xử lý lỗi

| Tình huống | Xử lý |
|---|---|
| File > 15 MB hoặc không phải ảnh | chặn ngay ở dropzone, thông báo rõ |
| HEIC | "Browser không đọc được HEIC, hãy chuyển sang JPG/PNG" |
| decode thất bại | "Ảnh bị lỗi hoặc không đọc được" |
| worker crash | báo kèm **tên stage** đang chạy |
| pipeline > 60s | dừng, gợi ý giảm `maxDim` |
| kết quả > 2000 vùng | cảnh báo "quá vụn" **ngay ở preview**, gợi ý tăng độ chi tiết / giảm số màu |
| kết quả < 20 vùng | cảnh báo "quá thô", gợi ý ngược lại |
| Supabase offline | chơi tiếp từ IndexedDB, banner chưa đồng bộ, queue outbox |
| session hết hạn | quay về `/login`, **không mất** tiến độ local |
| share token không tồn tại | trang "Link không còn hiệu lực" |
| upload Storage thất bại | rollback row `puzzles`, giữ ảnh trong IndexedDB để thử lại |

## 18. Chiến lược test (Vitest)

**Ưu tiên cao nhất — `core/`, không cần browser:**

- **Ảnh tổng hợp nhỏ**: 8×8 gồm 3 khối phẳng → assert chính xác `labels`, số vùng, kết quả gộp, vị trí anchor.
- **Bất biến (property test)**:
  - mỗi pixel thuộc đúng 1 vùng
  - `Σ area = w*h`
  - sau Stage 4: không còn vùng nào `area < minArea`
  - mọi `colorIndex ∈ [0, K)`
  - điểm đặt số luôn **nằm trong** vùng của nó
  - crack graph: mỗi chain thuộc đúng 2 vùng; tổng chain quanh mỗi vùng tạo ring khép kín
- **Determinism**: chạy pipeline 2 lần cùng input → byte-identical. Chốt chặn cho việc sinh lại từ `params`.
- **Codec**: `decode(encode(x)) === x` cho RLE, bitset, puzzle.
- **Engine**: tô sai → không đổi state + `rejected` + `expected` đúng; tô đúng → `filled`, progress tăng; tô lần 2 → `already`.
- **Vector**: hai vùng kề nhau dùng **cùng một chuỗi điểm** cho biên chung (không hở kẽ) — test trực tiếp trên chain đã đơn giản hoá.
- **Editor**: gộp 2 vùng không kề → bị từ chối; gộp rồi undo → `regionMap` trở về byte-identical.
- **Sync**: OR bitset hợp nhất đúng; outbox replay idempotent.

**Mức thấp hơn:**
- Smoke test màn chơi với puzzle stub (Testing Library).
- 1 fixture ảnh thật nhỏ: assert số vùng nằm trong khoảng + snapshot palette.

## 19. Rủi ro

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| R1 | **Chất lượng segmentation *là* sản phẩm.** Ảnh nhiều texture (cỏ, lá, mây gradient) sẽ ra vùng vụn; có ảnh sẽ không bao giờ đẹp | Stage 1 làm phẳng + Stage 4 `minArea` + auto-dò `minArea` theo preset + **preview bắt buộc** + editor gộp thủ công. Chấp nhận rằng một số ảnh không phù hợp |
| R2 | Vùng nhỏ không đủ chỗ in số | `hasLabel=false` + highlight-theo-màu + số hiện khi zoom sâu |
| R3 | Perf trên điện thoại với ảnh 1400px | cap `maxDim`, chạy trong worker, progress theo stage, timeout 60s có gợi ý |
| R4 | Vector hoá sai topology → in hở kẽ | crack graph + đơn giản hoá mỗi chain một lần (D8) + property test riêng |
| R5 | Sửa vùng làm mất tiến độ | cảnh báo rõ trước khi lưu (A5) |
| R6 | Bí ẩn của puzzle chia sẻ bypass được qua devtools | chấp nhận, đã ghi ở A2 |

## 20. Ngoài phạm vi

Cắt vùng bằng đường vẽ tay (D12) · leaderboard toàn cầu (D11) · thư viện Pokémon đóng gói sẵn (D10) · undo khi tô (D9) · i18n (A7) · in tiling N×M tuỳ ý (A6) · app mobile native · realtime co-op tô cùng lúc.

## 21. Tiêu chí hoàn thành

1. Toàn bộ test `core/` xanh, gồm test determinism và test topology của vector.
2. Chạy tay hết vòng: đăng nhập → upload một tranh Pokémon có môi trường → tinh chỉnh preview → lưu → gộp vài vùng vụn trong editor → tô tới 100% → thấy tranh hoàn chỉnh + ảnh gốc → in ra PDF 1 trang không hở kẽ → bật chia sẻ → mở link ở cửa sổ ẩn danh, ảnh gốc bị ẩn, tô được, tiến độ giữ sau khi refresh.
3. Tắt mạng giữa lúc tô → vẫn tô được, bật lại mạng → tiến độ đẩy lên đủ.
4. Màn chơi dùng được hoàn toàn bằng bàn phím, `aria-live` thông báo tiến độ.

---

## 22. Bổ sung: mật độ chi tiết ngang trang sách + nhãn chữ-số

**Ngày:** 2026-07-28. **Nguồn:** chủ dự án đưa ảnh chụp một trang thật của sách tham chiếu và yêu cầu output phải chi tiết tương đương.

### Vì sao phải sửa spec

Bản spec gốc giả định **vùng vụn là xấu** và dựng cả Stage 1 để diệt nó: median 2 lượt cộng bilateral 2 lượt, `minArea` tự dò về ~500 vùng, và §17 cảnh báo khi vượt 2000 vùng là "quá vụn".

Trang sách thật chứng minh giả định đó sai. Nó có **hàng nghìn vùng nhỏ bám theo texture** của nước, núi và mây — và đó chính là thứ tạo ra sản phẩm. Kiểm chứng trên browser cho thấy pipeline hiện tại ra 303 vùng với vùng lớn phẳng, thô hơn tham chiếu vài bậc.

Vậy đây không phải nới tham số, mà **đảo lại mặc định**: Stage 1 phải giữ chi tiết chứ không xoá nó.

### Bảng nhãn: 30 ký tự, chữ-số

Legend của trang sách chạy `1 2 3 4 5 6 7 8 9 0` rồi `a b c d e f h k l m n p r s t u v x y z` — đúng **30 màu**. Nó **cố tình bỏ `g i j o q w`**, để tránh nhầm lẫn khi in nhỏ: `g`↔`9`, `i`↔`1`, `o`↔`0`, `q`↔`9`, `j`↔`i`, `w`↔`vv`. Sao chép nguyên quy ước này.

```
LABEL_ALPHABET = "1234567890abcdefhklmnprstuvxyz"   // đúng 30 ký tự
labelFor(colorIndex) = LABEL_ALPHABET[colorIndex]
```

**Bắt buộc dùng một hàm duy nhất.** Hiện nhãn được sinh ở bốn chỗ: `label-layer.ts` dùng `String(r.colorIndex + 1)`, và `palette-bar.tsx` dùng `i + 1` ở ba chỗ (nhãn hiển thị và hai nhánh `aria-label`). Bốn chỗ này phải gọi cùng một `labelFor`, vì nhãn in trên tranh mà lệch nhãn trên nút là lỗi không type checker nào bắt được và người dùng thì gặp ngay.

### Giá trị mặc định mới

| Tham số | Cũ | Mới | Lý do |
|---|---|---|---|
| `maxDim` | 1400 | **2000** | Vùng nhỏ cần đủ pixel để tồn tại qua Stage 4 và đủ chỗ đặt nhãn |
| `k` cho phép | 6–24 | **6–30** | Legend tham chiếu có 30 màu |
| `k` mặc định | 12 | **24** | |
| `targetRegions` cho phép | 50–2000 | **200–6000** | |
| `smoothing` mặc định | 2 | **0** | Bilateral mạnh xoá đúng cái texture tạo nên độ chi tiết |
| `minLabelRadius` | 7 | **3** | Ở 7px thì hàng nghìn vùng nhỏ sẽ không có nhãn nào |
| `MAX_GOOD_REGIONS` | 2000 | **8000** | 2000 giờ là mức bình thường, không phải "quá vụn" |
| `MIN_GOOD_REGIONS` | 20 | 20 | Không đổi |

Median 3×3 vẫn giữ 2 lượt: nó khử noise JPEG mà không phá cạnh, và Task 30 đã đảm bảo nó không bịa màu. Chỉ bilateral bị hạ về 0 mặc định.

### Preset mới

| Preset | `k` | `targetRegions` | Dùng cho |
|---|---|---|---|
| Dễ | 10 | 400 | Trẻ nhỏ, tô nhanh |
| Vừa | 16 | 1200 | |
| Khó | 24 | 3000 | |
| **Ngang sách** | **30** | **4500** | Bằng mật độ trang sách tham chiếu |

### Điều spec gốc nói đúng và vẫn giữ

Rủi ro **R1** ("chất lượng segmentation *là* sản phẩm") vẫn đúng, chỉ đổi chiều: trước là lo vụn quá, giờ là lo mất chi tiết. Bước **preview bắt buộc** (D6) trở nên quan trọng hơn, không kém — với 4500 vùng thì xem trước rồi mới lưu là cách duy nhất biết ảnh đó có ra được hay không.

### Hệ quả đã lường trước

- **Điện thoại phải zoom nhiều.** Ở 4500 vùng, mỗi vùng chỉ vài chục pixel. Đã có zoom/pan và nhãn co giãn theo scale, cộng highlight-theo-màu cho vùng quá nhỏ để in nhãn — ba thứ này giờ là thiết yếu chứ không phải tiện nghi.
- **Một tranh mất nhiều giờ.** Đúng như sách thật.
- **Pipeline chậm hơn.** 2000px là gấp ~2× số pixel của 1400px, và bisection chạy lại Stage 3→4 tới 6 lần. Timeout 60s có thể phải nâng — phải đo, không đoán.
