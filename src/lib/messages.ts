import type { SupabaseClient } from "@supabase/supabase-js";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 私信规则(安全核查第 3 批第 18 条,产品负责人已确认):
 * - 只有注册用户能发(调用方已经要求登录);
 * - 买家只能发给这条广告的卖家;
 * - 卖家只能回复在这条广告下给他发过消息的人。
 * 数据库的 insert 策略也按同样规则检查(见 README 第 3 批的 SQL),这里先挡一次,给出
 * 看得懂的报错。返回 null 表示可以发,否则是报错文案。
 */
export async function checkMessageAllowed(
  supabase: SupabaseClient,
  listingId: string,
  senderId: string,
  receiverId: string
): Promise<string | null> {
  if (!UUID_PATTERN.test(listingId) || !UUID_PATTERN.test(receiverId)) {
    return "Conversation not found";
  }
  if (senderId === receiverId) {
    return "You can't message yourself";
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("seller_id")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) {
    return "Listing not found";
  }

  if (listing.seller_id !== senderId) {
    return listing.seller_id === receiverId
      ? null
      : "You can only message the seller of this listing";
  }

  const { data: earlier } = await supabase
    .from("listing_messages")
    .select("id")
    .eq("listing_id", listingId)
    .eq("sender_id", receiverId)
    .eq("receiver_id", senderId)
    .limit(1);
  return earlier && earlier.length > 0
    ? null
    : "You can only reply to people who have messaged you about this listing";
}
