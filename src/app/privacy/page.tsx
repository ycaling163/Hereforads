import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PRIVACY_HTML,
  DEFAULT_PRIVACY_TITLE,
  LEGAL_CONTENT_CLASSNAME,
} from "@/lib/legalPageDefaults";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default async function PrivacyPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_pages")
    .select("title, content_html")
    .eq("slug", "privacy")
    .maybeSingle();

  const title = data?.title || DEFAULT_PRIVACY_TITLE;
  const contentHtml = data?.content_html || DEFAULT_PRIVACY_HTML;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        {title}
      </h1>
      <div
        className={LEGAL_CONTENT_CLASSNAME}
        dangerouslySetInnerHTML={{ __html: contentHtml }}
      />
    </div>
  );
}
