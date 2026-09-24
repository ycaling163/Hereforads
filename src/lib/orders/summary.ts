import { createServiceClient } from "@/lib/supabase/service";
import { AD_TYPE_LABELS, SOCIAL_PLATFORM_LABELS } from "@/lib/supabase/enums";
import type { Listing, ListingOrder, SocialAccount } from "@/lib/supabase/types";

export interface OrderSummary {
  order: ListingOrder;
  listingTitle: string;
  adTypeLabel: string | null;
  // 这条广告投放在哪:"Instagram · @xxx" / "Seller's website";没指定时 null。
  placement: string | null;
  sellerName: string;
}

/**
 * 订单邮件和订单只读页(/orders/<view_token>)共用的订单详情:广告、卖家、投放平台。
 * 用 service_role 读,调用方自己负责确认对方有权看这张订单(知道 view_token、或者
 * 订单号 + 邮箱对得上、或者是订单的买卖双方)。
 */
export async function loadOrderSummary(
  by: { id: string } | { viewToken: string }
): Promise<OrderSummary | null> {
  const service = createServiceClient();
  const query = service.from("listing_orders").select("*");
  const { data: orderRow } = await ("id" in by
    ? query.eq("id", by.id)
    : query.eq("view_token", by.viewToken)
  ).maybeSingle();
  if (!orderRow) return null;
  const order = orderRow as ListingOrder;

  const [{ data: listingRow }, { data: seller }] = await Promise.all([
    service
      .from("listings")
      .select("title,ad_type,social_account_id,is_website_placement")
      .eq("id", order.listing_id)
      .maybeSingle(),
    service.from("profiles").select("display_name").eq("id", order.seller_id).maybeSingle(),
  ]);
  const listing = listingRow as Pick<
    Listing,
    "title" | "ad_type" | "social_account_id" | "is_website_placement"
  > | null;

  let placement: string | null = null;
  if (listing?.social_account_id) {
    const { data: account } = await service
      .from("social_accounts")
      .select("platform,handle")
      .eq("id", listing.social_account_id)
      .maybeSingle();
    const a = account as Pick<SocialAccount, "platform" | "handle"> | null;
    if (a) {
      placement = `${SOCIAL_PLATFORM_LABELS[a.platform] ?? a.platform}${a.handle ? ` · ${a.handle}` : ""}`;
    }
  } else if (listing?.is_website_placement) {
    placement = "Seller's website";
  }

  return {
    order,
    listingTitle: listing?.title ?? "Ad",
    adTypeLabel: listing?.ad_type ? AD_TYPE_LABELS[listing.ad_type] : null,
    placement,
    sellerName: seller?.display_name ?? "Seller",
  };
}
