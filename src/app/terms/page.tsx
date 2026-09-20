import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_TERMS_HTML,
  DEFAULT_TERMS_TITLE,
  LEGAL_CONTENT_CLASSNAME,
} from "@/lib/legalPageDefaults";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default async function TermsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_pages")
    .select("title, content_html")
    .eq("slug", "terms")
    .maybeSingle();

  const title = data?.title || DEFAULT_TERMS_TITLE;
  const contentHtml = data?.content_html || DEFAULT_TERMS_HTML;

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
