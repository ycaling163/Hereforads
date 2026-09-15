import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
import { AD_SPACE_STATUS_LABELS } from "@/lib/supabase/enums";
import { deleteSpaceAction } from "./actions";
import type { AdSpace } from "@/lib/supabase/types";

export default async function MySpacesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("ad_spaces")
    .select("*")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const spaces = (data ?? []) as AdSpace[];

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          我的广告位
        </h1>
        <Link
          href="/dashboard/new-space"
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          + 发布新广告位
        </Link>
      </div>

      {spaces.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500">还没有发布任何广告位。</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {spaces.map((space) => (
            <div
              key={space.id}
              className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-4 sm:flex-row sm:items-center"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                {space.photo_urls?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={space.photo_urls[0]}
                    alt={space.title}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/spaces/${space.id}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {space.title}
                  </Link>
                  <span className="rounded-full bg-zinc-900/5 px-2 py-0.5 text-xs font-medium text-zinc-600">
                    {AD_SPACE_STATUS_LABELS[space.status] ?? space.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  {space.price_amount} {space.price_currency}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/dashboard/spaces/${space.id}/edit`}
                  className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400"
                >
                  编辑
                </Link>
                <ConfirmSubmitForm
                  action={deleteSpaceAction.bind(null, space.id)}
                  confirmMessage="确定要删除这个广告位吗?此操作无法撤销。"
                  label="删除"
                  className="rounded-full border border-transparent px-4 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
