// Turns a public Supabase Storage URL back into the bucket-relative path
// `.remove()` wants, so replacing/deleting a file can clean up the old one.
export function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
}
