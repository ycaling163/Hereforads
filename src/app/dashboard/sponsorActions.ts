"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MAX_HOUSE_ADS, normalizeSponsorName, normalizeSponsorUrl } from "@/lib/sponsors";

// 赞助商展示的写操作(README"赞助商展示"一节)。新字段/新表只有 service_role 能写,
// 所以每个 action 先确认身份,再在 update 条件里带上 seller_id / buyer_id / user_id,
// 改不到别人的数据。

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

/** 卖家审查买家填的品牌/链接:隐藏或重新显示(管理员隐藏的另算,卖家打不开)。 */
export async function setSponsorHiddenBySellerAction(orderId: string, hidden: boolean) {
  const userId = await requireUserId();
  await createServiceClient()
    .from("listing_orders")
    .update({ sponsor_hidden_by_seller_at: hidden ? new Date().toISOString() : null })
    .eq("id", orderId)
    .eq("seller_id", userId);
  revalidatePath("/dashboard/sales");
}

/** 买家撤回或重新打开展示。名字和链接付款后不能改,只能开关。 */
export async function setSponsorPublicByBuyerAction(orderId: string, isPublic: boolean) {
  const userId = await requireUserId();
  await createServiceClient()
    .from("listing_orders")
    .update({ sponsor_public: isPublic })
    .eq("id", orderId)
    .eq("buyer_id", userId)
    .not("sponsor_name", "is", null);
  revalidatePath("/dashboard/purchases");
}

export interface HouseAdFormState {
  error?: string;
  success?: boolean;
}

/** 卖家的空档自选展示:最多 MAX_HOUSE_ADS 条。 */
export async function addHouseAdAction(
  _prevState: HouseAdFormState,
  formData: FormData
): Promise<HouseAdFormState> {
  const userId = await requireUserId();
  const name = normalizeSponsorName(String(formData.get("name") ?? ""));
  if ("error" in name) return { error: name.error };
  const rawUrl = String(formData.get("url") ?? "").trim();
  let url: string | null = null;
  if (rawUrl) {
    const normalized = normalizeSponsorUrl(rawUrl);
    if ("error" in normalized) return { error: normalized.error };
    url = normalized.url;
  }

  const service = createServiceClient();
  const { count, error: countError } = await service
    .from("seller_house_ads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) {
    return { error: "This feature isn't available yet — please try again later" };
  }
  if ((count ?? 0) >= MAX_HOUSE_ADS) {
    return { error: `You can add up to ${MAX_HOUSE_ADS} entries` };
  }
  const { error } = await service
    .from("seller_house_ads")
    .insert({ user_id: userId, name: name.name, url });
  if (error) return { error: "Couldn't save, please try again" };
  revalidatePath("/dashboard/profile");
  return { success: true };
}

export async function deleteHouseAdAction(id: string) {
  const userId = await requireUserId();
  await createServiceClient().from("seller_house_ads").delete().eq("id", id).eq("user_id", userId);
  revalidatePath("/dashboard/profile");
}
