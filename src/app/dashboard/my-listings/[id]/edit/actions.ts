"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseListingFormFields } from "@/lib/listingFormValidation";
import { storagePathFromPublicUrl } from "@/lib/storage";
import type { ListingFormState } from "@/components/ListingForm";
import type { Listing } from "@/lib/supabase/types";

const MEDIA_BUCKET = "ad-space-photos";

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
  const ownedMediaMarker = `/object/public/${MEDIA_BUCKET}/${user.id}/`;
  const keptMediaUrls = formData
    .getAll("existing_media")
    .map(String)
    .filter((url) => url.includes(ownedMediaMarker));

  const mediaUrls: string[] = [...keptMediaUrls];
  try {
    for (const file of mediaFiles) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/listings/${randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });

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
      price_amount: fields.priceAmount,
      price_currency: fields.priceCurrency,
      pricing_unit: fields.pricingUnit,
      media_urls: mediaUrls,
      social_account_id: fields.socialAccountId,
      is_website_placement: fields.isWebsitePlacement,
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
  if (removedUrls.length > 0) {
    const removedPaths = removedUrls
      .map((url) => storagePathFromPublicUrl(url, MEDIA_BUCKET))
      .filter((path): path is string => path !== null);
    if (removedPaths.length > 0) {
      await supabase.storage.from(MEDIA_BUCKET).remove(removedPaths);
    }
  }

  // Editing a live listing sends it back for review — content can change
  // after approval, so silently keeping it `active` would let a seller
  // bypass moderation entirely by editing post-approval. `status` is
  // revoked from `authenticated` for exactly this reason (see README
  // "顺手补的一个安全洞"), so this needs the service-role client — still
  // scoped to this row/owner/prior status, not a general status-setting hole.
  if (original.status === "active") {
    await createServiceClient()
      .from("listings")
      .update({ status: "pending_review" })
      .eq("id", listingId)
      .eq("seller_id", user.id)
      .eq("status", "active");
  }

  redirect(`/listings/${listingId}`);
}
