"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteUnusedMedia } from "@/lib/mediaCleanup";
import type { Listing } from "@/lib/supabase/types";

export async function deleteListingAction(listingId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: listingRow } = await supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .eq("seller_id", user.id)
    .maybeSingle();

  const listing = listingRow as Listing | null;
  if (!listing) {
    redirect("/dashboard/my-listings?error=delete_failed");
  }

  const { error } = await supabase
    .from("listings")
    .delete()
    .eq("id", listingId)
    .eq("seller_id", user.id);

  if (error) {
    // listing_orders.listing_id has no ON DELETE CASCADE by design (see
    // README) — a listing with any order history, even old/completed ones,
    // fails here with a foreign-key violation rather than silently vanishing
    // out from under a buyer's order.
    const code = error.message.includes("foreign key")
      ? "delete_blocked_by_orders"
      : "delete_failed";
    redirect(`/dashboard/my-listings?error=${code}`);
  }

  // Delete only after the row itself is gone — never risk deleting files a
  // listing still points to. Files another listing still uses (Duplicate
  // shares them) are kept, see deleteUnusedMedia.
  await deleteUnusedMedia(user.id, listing.media_urls);

  redirect("/dashboard/my-listings");
}
