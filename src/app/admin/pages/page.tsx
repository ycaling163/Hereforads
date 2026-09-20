import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import type { SitePage } from "@/lib/supabase/types";

export default async function AdminPagesPage() {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("site_pages")
    .select("slug, title, updated_at")
    .order("slug");
  const pages = (data ?? []) as Pick<SitePage, "slug" | "title" | "updated_at">[];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Site pages
      </h1>
      <p className="mt-2 text-zinc-600">
        Edit the content shown at /terms and /privacy — changes go live
        immediately, no deploy needed.
      </p>

      {error && (
        <p className="mt-8 text-sm text-red-600">
          {error.message} — has the <code>site_pages</code> table been
          created yet? See the README&rsquo;s &ldquo;站内页面内容管理&rdquo;
          section for the SQL to run in the Supabase dashboard.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {pages.map((page) => (
          <Link
            key={page.slug}
            href={`/admin/pages/${page.slug}`}
            className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300"
          >
            <div>
              <p className="font-medium text-zinc-900">{page.title}</p>
              <p className="text-sm text-zinc-500">
                /{page.slug} · last updated{" "}
                {new Date(page.updated_at).toLocaleString()}
              </p>
            </div>
            <span className="text-sm font-medium text-zinc-900 underline">
              Edit
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
