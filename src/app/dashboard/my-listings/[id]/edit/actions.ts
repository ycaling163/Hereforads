"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteUnusedMedia } from "@/lib/mediaCleanup";
import { checkUpload, isOwnStorageUrl } from "@/lib/uploads";
import { parseListingFormFields } from "@/lib/listingFormValidation";
import { MEDIA_BUCKET } from "@/config/site";
import type { ListingFormState } from "@/components/ListingForm";
import type { Listing } from "@/lib/supabase/types";

export async function updateListingAction(
  listingId: string,
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: existingListingRow }, { data: sellerProfile }, { data: ownAccounts }] =
    await Promise.all([
      supabase.from("listings").select("*").eq("id", listingId).maybeSingle(),
      supabase
        .from("seller_profiles")
        .select("website_url")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("social_accounts").select("id").eq("user_id", user.id),
    ]);

  const original = existingListingRow as Listing | null;
  if (!original || original.seller_id !== user.id) {
    return { error: "Listing not found" };
  }

  const parsed = parseListingFormFields(
    formData,
    (ownAccounts ?? []).map((account) => account.id),
    !!sellerProfile?.website_url
  );
  if ("error" in parsed) {
    return { error: parsed.error };
  }
  const { fields } = parsed;

  const mediaFiles = formData
    .getAll("media")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const keptMediaUrls = formData
    .getAll("existing_media")
    .map(String)
    .filter((url) => isOwnStorageUrl(url, MEDIA_BUCKET, user.id));

  const mediaUrls: string[] = [...keptMediaUrls];
  try {
    for (const file of mediaFiles) {
      const checked = await checkUpload(file, "listing_media");
      if (!checked.ok) {
        return { error: checked.error };
      }
      const path = `${user.id}/listings/${randomUUID()}.${checked.ext}`;
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, { contentType: checked.contentType });

      if (uploadError) {
        return { error: `Media upload failed: ${uploadError.message}` };
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
      mediaUrls.push(publicUrl);
    }
  } catch (err) {
    return {
      error: `Media upload failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  const { data: updatedRows, error } = await supabase
    .from("listings")
    .update({
      title: fields.title,
      description: fields.description,
      categories: fields.categories,
      ad_type: fields.adType,
      price_amount: fields.priceAmount,
      price_currency: fields.priceCurrency,
      pricing_unit: fields.pricingUnit,
      media_urls: mediaUrls,
      social_account_id: fields.socialAccountId,
      is_website_placement: fields.isWebsitePlacement,
      booking_enabled: fields.bookingEnabled,
      min_booking_days: fields.minBookingDays,
    })
    .eq("id", listingId)
    .eq("seller_id", user.id)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Save failed — the database rejected the request" };
  }

  // Only clean up dropped images once the new media_urls is safely saved,
  // so a mid-save failure never leaves the listing pointing at a deleted file.
  const removedUrls = original.media_urls.filter((url) => !keptMediaUrls.includes(url));
  await deleteUnusedMedia(user.id, removedUrls);

  // 发布免审核 + KYC 后置(2026-09-19 决策记录,见 README 同名一节)之后,编辑
  // 已经 active 的 listing 不再退回 pending_review 排队等审核——既然发布本身
  // 都不需要人工批准了,编辑也没道理需要。内容层面的事后监督完全靠
  // /admin/listings 的 Remove(任何状态都能下架),不靠这里拦截编辑。
  redirect(`/listings/${listingId}`);
}
