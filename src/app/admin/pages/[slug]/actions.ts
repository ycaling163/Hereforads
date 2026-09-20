"use server";

import sanitizeHtml from "sanitize-html";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";

export interface EditSitePageState {
  error?: string;
  message?: string;
}

const EDITABLE_SLUGS = ["terms", "privacy"] as const;
export type EditableSlug = (typeof EDITABLE_SLUGS)[number];

// 只放行 Tiptap(RichTextEditor.tsx)StarterKit + Link 实际会产出的这几种标签,
// class/style 不在白名单里,sanitize-html 默认就会把它们连同 script/iframe 之类
// 一起剥掉——即使某天管理员账号被盗、或者粘贴了带脚本的 HTML,存进 site_pages 的
// 也只会是纯语义标签,不会变成前台 dangerouslySetInnerHTML 直接执行的 XSS。
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h2",
    "h3",
    "p",
    "ul",
    "ol",
    "li",
    "strong",
    "b",
    "em",
    "i",
    "s",
    "del",
    "a",
    "br",
    "blockquote",
    "hr",
    "code",
    "pre",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "mailto"],
};

export async function updateSitePageAction(
  slug: EditableSlug,
  _prevState: EditSitePageState,
  formData: FormData
): Promise<EditSitePageState> {
  const user = await requireAdmin();

  if (!EDITABLE_SLUGS.includes(slug)) {
    return { error: "Unknown page" };
  }

  const title = String(formData.get("title") ?? "").trim();
  const rawHtml = String(formData.get("content_html") ?? "");

  if (!title) {
    return { error: "Title is required" };
  }

  const contentHtml = sanitizeHtml(rawHtml, SANITIZE_OPTIONS);

  const { error } = await createServiceClient()
    .from("site_pages")
    .update({
      title,
      content_html: contentHtml,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("slug", slug);

  if (error) {
    return { error: error.message };
  }

  return { message: "Saved." };
}
