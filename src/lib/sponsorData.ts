import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { SPONSOR_BLOCKING_HOLDS, SPONSOR_VISIBLE_STATUSES } from "@/lib/sponsors";

// 赞助商展示的读操作(README"赞助商展示"一节)。新字段/新表不在买卖双方用户态 client 能读
// 的列里,一律用 service_role 在服务端读、按规则过滤后再给页面。
//
// 线上库还没执行那一节的 SQL 时查询会报"列/表不存在"——这里只记一条警告、当作没有数据,
// 不影响页面其它部分。

export interface PublicSponsor {
  orderId: string;
  name: string;
  url: string | null;
  startDate: string | null;
  endDate: string | null;
  paidAt: string | null;
}

export interface HouseAd {
  id: string;
  name: string;
  url: string | null;
}

export interface OrderSponsor {
  name: string | null;
  url: string | null;
  isPublic: boolean;
  hiddenBySeller: boolean;
  hiddenByAdmin: boolean;
}

/** 某条广告可以公开展示的买家(付款成功、买家同意、卖家和管理员都没隐藏)。 */
export async function getListingSponsors(listingId: string): Promise<PublicSponsor[]> {
  const { data, error } = await createServiceClient()
    .from("listing_orders")
    .select("id,sponsor_name,sponsor_url,start_date,end_date,paid_at,payout_hold")
    .eq("listing_id", listingId)
    .eq("sponsor_public", true)
    .not("sponsor_name", "is", null)
    .is("sponsor_hidden_by_seller_at", null)
    .is("sponsor_hidden_by_admin_at", null)
    .in("status", [...SPONSOR_VISIBLE_STATUSES])
    .order("paid_at", { ascending: false })
    .limit(200);
  if (error) {
    console.warn("Sponsors unavailable:", error.message);
    return [];
  }
  return (data ?? [])
    .filter(
      (row) =>
        !(SPONSOR_BLOCKING_HOLDS as readonly string[]).includes(row.payout_hold as string)
    )
    .map((row) => ({
      orderId: row.id as string,
      name: row.sponsor_name as string,
      url: (row.sponsor_url as string | null) ?? null,
      startDate: (row.start_date as string | null) ?? null,
      endDate: (row.end_date as string | null) ?? null,
      paidAt: (row.paid_at as string | null) ?? null,
    }));
}

/** 卖家的空档自选展示;includeHidden 给卖家自己的管理页用。 */
export async function getHouseAds(
  sellerId: string,
  { includeHidden = false }: { includeHidden?: boolean } = {}
): Promise<(HouseAd & { hiddenByAdmin: boolean })[]> {
  let query = createServiceClient()
    .from("seller_house_ads")
    .select("id,name,url,hidden_by_admin_at")
    .eq("user_id", sellerId)
    .order("created_at", { ascending: true });
  if (!includeHidden) query = query.is("hidden_by_admin_at", null);
  const { data, error } = await query;
  if (error) {
    console.warn("House ads unavailable:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    url: (row.url as string | null) ?? null,
    hiddenByAdmin: row.hidden_by_admin_at !== null,
  }));
}

/**
 * 一批订单上的买家展示信息,给"我的销售"/"我的购买"页用。调用方必须已经确认这些订单
 * 属于当前用户(那两个页面的订单本来就是按用户查出来的)。
 */
export async function getOrderSponsors(orderIds: string[]): Promise<Map<string, OrderSponsor>> {
  const result = new Map<string, OrderSponsor>();
  if (orderIds.length === 0) return result;
  const { data, error } = await createServiceClient()
    .from("listing_orders")
    .select(
      "id,sponsor_name,sponsor_url,sponsor_public,sponsor_hidden_by_seller_at,sponsor_hidden_by_admin_at"
    )
    .in("id", orderIds)
    .not("sponsor_name", "is", null);
  if (error) {
    console.warn("Order sponsors unavailable:", error.message);
    return result;
  }
  for (const row of data ?? []) {
    result.set(row.id as string, {
      name: row.sponsor_name as string | null,
      url: row.sponsor_url as string | null,
      isPublic: row.sponsor_public === true,
      hiddenBySeller: row.sponsor_hidden_by_seller_at !== null,
      hiddenByAdmin: row.sponsor_hidden_by_admin_at !== null,
    });
  }
  return result;
}
