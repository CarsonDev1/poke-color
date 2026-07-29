import { describe, expect, it } from 'vitest'
import { readSupabaseConfig } from '@/data/supabase'

describe('readSupabaseConfig', () => {
  it('đọc được cấu hình hợp lệ', () => {
    const cfg = readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_xyz',
    })
    expect(cfg).toEqual({ url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_xyz' })
  })

  it('thiếu URL ⇒ lỗi NÊU TÊN biến, không phải "Failed to fetch" lúc gọi request', () => {
    expect(() =>
      readSupabaseConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_xyz' }),
    ).toThrow(/VITE_SUPABASE_URL/)
  })

  it('thiếu key ⇒ lỗi nêu tên biến', () => {
    expect(() => readSupabaseConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co' })).toThrow(
      /VITE_SUPABASE_PUBLISHABLE_KEY/,
    )
  })

  it('thiếu cả hai ⇒ nêu CẢ HAI, không chỉ cái đầu', () => {
    let msg = ''
    try {
      readSupabaseConfig({})
    } catch (e) {
      msg = (e as Error).message
    }
    expect(msg).toMatch(/VITE_SUPABASE_URL/)
    expect(msg).toMatch(/VITE_SUPABASE_PUBLISHABLE_KEY/)
  })

  it('chuỗi rỗng bị coi là thiếu — env rỗng không phải là cấu hình hợp lệ', () => {
    expect(() =>
      readSupabaseConfig({ VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }),
    ).toThrow(/VITE_SUPABASE_URL/)
  })

  /**
   * Đây là test quan trọng nhất trong file. service_role key bỏ qua RLS, và biến
   * VITE_* bị Vite nhúng thẳng vào bundle JS gửi cho MỌI khách truy cập. Dán sai
   * khoá vào đây là biến toàn bộ RLS thành vô nghĩa mà không có dấu hiệu gì.
   */
  it('secret / service_role key bị TỪ CHỐI, không âm thầm ship ra bundle công khai', () => {
    expect(() =>
      readSupabaseConfig({
        VITE_SUPABASE_URL: 'https://abc.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdef',
      }),
    ).toThrow(/service_role|secret/i)

    expect(() =>
      readSupabaseConfig({
        VITE_SUPABASE_URL: 'https://abc.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOi.service_role.xxx',
      }),
    ).toThrow(/service_role|secret/i)
  })
})
