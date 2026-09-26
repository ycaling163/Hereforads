import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { LISTING_ORDER_STATUS_LABELS } from "@/lib/supabase/enums";
import type { ListingOrder } from "@/lib/supabase/types";
import { formatOrderNumber } from "@/lib/orders/orderNumber";
import { SPONSOR_VISIBLE_STATUSES } from "@/lib/sponsors";
import { setHouseAdHiddenByAdminAction, setOrderSponsorHiddenByAdminAction } from "./actions";

const buttonClass =
  "rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-900";

// 赞助商展示监管(README"赞助商展示"一节):买家在订单上填的品牌/链接、卖家的空档自选展示。
// 管理员看到完整链接,违规的直接隐藏。
export default async function AdminSponsorsPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [orders, houseAds] = await Promise.all([
    service
      .from("listing_orders")
      .select(
        "id,order_number,listing_id,status,paid_at,created_at,sponsor_name,sponsor_url,sponsor_public,sponsor_hidden_by_seller_at,sponsor_hidden_by_admin_at"
      )
      .not("sponsor_name", "is", null)
      .order("created_at", { ascending: false })
      .limit(200),
    service
      .from("seller_house_ads")
      .select("id,user_id,name,url,hidden_by_admin_at,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (orders.error || houseAds.error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Sponsors</h1>
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Not set up yet — run the SQL in README &ldquo;赞助商展示&rdquo; first.
          ({orders.error?.message ?? houseAds.error?.message})
        </p>
      </div>
    );
  }

  const listingIds = [...new Set((orders.data ?? []).map((o) => o.listing_id as string))];
  const sellerIds = [...new Set((houseAds.data ?? []).map((a) => a.user_id as string))];
  const [{ data: listings }, { data: sellers }] = await Promise.all([
    listingIds.length
      ? service.from("listings").select("id,title").in("id", listingIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    sellerIds.length
      ? service.from("profiles").select("id,display_name,username").in("id", sellerIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; username: string | null }[] }),
  ]);
  const titleById = new Map((listings ?? []).map((l) => [l.id, l.title as string]));
  const sellerById = new Map(
    (sellers ?? []).map((p) => [p.id, (p.display_name as string | null) ?? (p.username as string | null) ?? p.id])
  );

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Sponsors</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Brand names and links buyers chose to show on listings, and sellers&apos; picks for
          open calendar days. Hide anything unsafe, misleading or against the rules — sellers
          and buyers can&apos;t turn it back on.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Buyer brands</h2>
        <div className="mt-4 flex flex-col gap-3">
          {(orders.data ?? []).length === 0 && (
            <p className="text-sm text-zinc-500">None yet.</p>
          )}
          {(orders.data ?? []).map((o) => {
            const paid = (SPONSOR_VISIBLE_STATUSES as readonly string[]).includes(o.status as string);
            const hiddenByAdmin = o.sponsor_hidden_by_admin_at !== null;
            const live = paid && o.sponsor_public && !o.sponsor_hidden_by_seller_at && !hiddenByAdmin;
            return (
              <div
                key={o.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900">{o.sponsor_name}</p>
                  <p className="break-all text-xs text-zinc-600">{o.sponsor_url ?? "No link"}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatOrderNumber(o.order_number as number | null)} ·{" "}
                    <Link href={`/listings/${o.listing_id}`} className="underline">
                      {titleById.get(o.listing_id as string) ?? "Listing"}
                    </Link>{" "}
                    · {LISTING_ORDER_STATUS_LABELS[o.status as ListingOrder["status"]] ?? o.status}
                  </p>
                  <p className="mt-1 text-xs">
                    {live ? (
                      <span className="text-emerald-700">Live on listing</span>
                    ) : (
                      <span className="text-zinc-500">
                        Not shown
                        {!paid && " · not paid"}
                        {!o.sponsor_public && " · buyer turned off"}
                        {o.sponsor_hidden_by_seller_at && " · hidden by seller"}
                        {hiddenByAdmin && " · hidden by admin"}
                      </span>
                    )}
                  </p>
                </div>
                <form action={setOrderSponsorHiddenByAdminAction.bind(null, o.id as string, !hiddenByAdmin)}>
                  <button className={buttonClass}>{hiddenByAdmin ? "Unhide" : "Hide"}</button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Sellers&apos; picks for open days</h2>
        <div className="mt-4 flex flex-col gap-3">
          {(houseAds.data ?? []).length === 0 && (
            <p className="text-sm text-zinc-500">None yet.</p>
          )}
          {(houseAds.data ?? []).map((a) => {
            const hidden = a.hidden_by_admin_at !== null;
            return (
              <div
                key={a.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900">{a.name}</p>
                  <p className="break-all text-xs text-zinc-600">{a.url ?? "No link"}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Seller: {sellerById.get(a.user_id as string) ?? a.user_id}
                    {hidden && <span className="ml-2 text-red-600">Hidden by admin</span>}
                  </p>
                </div>
                <form action={setHouseAdHiddenByAdminAction.bind(null, a.id as string, !hidden)}>
                  <button className={buttonClass}>{hidden ? "Unhide" : "Hide"}</button>
                </form>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
