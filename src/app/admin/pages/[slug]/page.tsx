import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import type { SitePage } from "@/lib/supabase/types";
import { EditPageForm } from "./EditPageForm";
import type { EditableSlug } from "./actions";

const EDITABLE_SLUGS: readonly EditableSlug[] = ["terms", "privacy"];

function isEditableSlug(value: string): value is EditableSlug {
  return (EDITABLE_SLUGS as readonly string[]).includes(value);
}

export default async function AdminEditPagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isEditableSlug(slug)) {
    notFound();
  }

  const admin = createServiceClient();
  const { data } = await admin
    .from("site_pages")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) notFound();
  const page = data as SitePage;

  return (
    <div>
      <Link href="/admin/pages" className="text-sm text-zinc-500 underline">
        ← Back to site pages
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
        Edit {page.title}
      </h1>
      <p className="mt-2 text-zinc-600">
        Changes go live immediately on{" "}
        <Link href={`/${page.slug}`} target="_blank" className="underline">
          /{page.slug}
        </Link>
        .
      </p>

      <EditPageForm
        slug={page.slug}
        initialTitle={page.title}
        initialContentHtml={page.content_html}
      />
    </div>
  );
}
