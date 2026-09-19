import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
import {
  LISTING_CATEGORY_LABELS,
  LISTING_STATUS_LABELS,
  PRICING_UNIT_LABELS,
} from "@/lib/supabase/enums";
import type { ListingStatus } from "@/lib/supabase/enums";
import type { Listing, Profile } from "@/lib/supabase/types";
import {
  approveListingAction,
  rejectListingAction,
  removeListingAction,
  setFeaturedAction,
} from "./actions";

const TABS: { label: string; status: ListingStatus | "all" }[] = [
  { label: "Pending review", status: "pending_review" },
  { label: "Live", status: "active" },
  { label: "All", status: "all" },
  { label: "Rejected", status: "rejected" },
  { label: "Removed", status: "removed" },
];

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const activeTab = TABS.some((t) => t.status === statusParam)
    ? (statusParam as ListingStatus | "all")
    : "active";

  // 管理员这几个页面用 service_role client 查全站数据,绕过 RLS(RLS 本来就只让
  // 卖家看自己的 listing),访问权限完全靠上面 AdminLayout 的 requireAdmin() 把关,
  // 不是靠数据库策略。
  const admin = createServiceClient();
  let query = admin.from("listings").select("*").order("created_at", { ascending: false });
  if (activeTab !== "all") {
    query = query.eq("status", activeTab);
  }
  const { data: listingRows, error } = await query;
  const listings = (listingRows ?? []) as Listing[];

  const sellerIds = [...new Set(listings.map((l) => l.seller_id))];
  const { data: sellerRows } = sellerIds.length
    ? await admin.from("profiles").select("id,display_name").in("id", sellerIds)
    : { data: [] as Pick<Profile, "id" | "display_name">[] };
  const sellerNameById = new Map(
    ((sellerRows ?? []) as Pick<Profile, "id" | "display_name">[]).map((p) => [
      p.id,
      p.display_name ?? "Anonymous seller",
    ])
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Moderate listings
      </h1>
      <p className="mt-2 text-zinc-600">
        Listings go live the moment a seller publishes them — no pre-publish
        review anymore (2026-09-19). Use this page to spot-check or act on
        reports: Remove takes any listing down immediately, in any status.
        &ldquo;Pending review&rdquo;/&ldquo;Rejected&rdquo; only show older
        listings from before this change.
      </p>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-zinc-200 pb-4">
        {TABS.map((tab) => (
          <Link
            key={tab.status}
            href={`/admin/listings?status=${tab.status}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.status
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {error && <p className="mt-8 text-sm text-red-600">{error.message}</p>}

      {!error && listings.length === 0 && (
        <p className="mt-16 text-center text-zinc-500">Nothing here.</p>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {listings.map((listing) => (
          <div key={listing.id} className="rounded-xl border border-zinc-200 p-5">
            <div className="flex gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                {listing.media_urls[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={listing.media_urls[0]}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-zinc-900">
                    {listing.is_featured ? "⭐ " : ""}
                    {listing.title}
                  </p>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                    {LISTING_STATUS_LABELS[listing.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  Seller: {sellerNameById.get(listing.seller_id) ?? "Anonymous seller"}
                  {" · "}
                  {listing.price_amount} {listing.price_currency}
                  {listing.pricing_unit !== "one_time"
                    ? ` / ${PRICING_UNIT_LABELS[listing.pricing_unit].toLowerCase()}`
                    : ""}
                </p>
                {listing.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
                    {listing.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {listing.categories.map((category) => (
                    <span
                      key={category}
                      className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
                    >
                      {LISTING_CATEGORY_LABELS[category] ?? category}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href={`/listings/${listing.id}`}
                target="_blank"
                className="text-sm text-zinc-500 underline"
              >
                View public page
              </Link>

              {listing.status === "pending_review" && (
                <>
                  <form action={approveListingAction.bind(null, listing.id)}>
                    <button
                      type="submit"
                      className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                  </form>
                  <ConfirmSubmitForm
                    action={rejectListingAction.bind(null, listing.id)}
                    confirmMessage="Reject this listing? The seller will see it as rejected."
                    label="Reject"
                    className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400"
                  />
                </>
              )}

              {listing.status === "active" && (
                <form action={setFeaturedAction.bind(null, listing.id, !listing.is_featured)}>
                  <button
                    type="submit"
                    className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400"
                  >
                    {listing.is_featured ? "Unfeature" : "Feature"}
                  </button>
                </form>
              )}

              {listing.status !== "removed" && (
                <ConfirmSubmitForm
                  action={removeListingAction.bind(null, listing.id)}
                  confirmMessage="Remove this listing? It disappears from the site immediately, but the seller can still see it was removed."
                  label="Remove"
                  className="rounded-full border border-red-200 px-4 py-1.5 text-sm font-medium text-red-600 transition-colors hover:border-red-400"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
