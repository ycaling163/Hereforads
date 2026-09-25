-- Storage:图片/视频 bucket 和上传策略。以 2026-09-25 线上导出为准。
-- ⚠️ 只给新建的空项目用,不要在 HereForAds 线上库执行。
--
-- bucket 名 ad-space-photos 跟代码里的 MEDIA_BUCKET 对应(src/config/site.ts),
-- 新站点想换名字要两边一起改。文件按上传者分文件夹:{user_id}/...
-- 广告媒体、头像、横幅、私信图片都放在这里;单个文件最大 10MB,只收下面这些类型
-- (代码里另外按文件头再校验一遍,见 src/lib/uploads.ts)。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ad-space-photos', 'ad-space-photos', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "public can view ad space photos" on storage.objects
  for select to public
  using (bucket_id = 'ad-space-photos');

create policy "authenticated can upload their own ad space photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ad-space-photos'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
