import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ListingForm } from "@/components/ListingForm";
import { ListingExamplesAside } from "@/components/ListingExamplesAside";
import type { Listing, SocialAccount } from "@/lib/supabase/types";
import { updateListingAction } from "./actions";

export default async function EditListingPage({
  params,
}: PageProps<"/dashboard/my-listings/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: listingRow }, { data: sellerProfile }, { data: socialAccounts }] =
    await Promise.all([
      supabase.from("listings").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("seller_profiles")
        .select("website_url")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("social_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

  const listing = listingRow as Listing | null;
  if (!listing || listing.seller_id !== user.id) {
    notFound();
  }

  return (
    // 大屏右侧放发布示例(产品负责人 2026-09-26),小屏排到表单下面。
    <div className="grid gap-10 xl:grid-cols-[minmax(0,42rem)_18rem]">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Edit listing
        </h1>
        <p className="mt-2 text-zinc-600">
          {/* 2026-09-19 起编辑不再退回审核(README"发布免审核 + KYC 后置"),原来的提示过时了。 */}
          {listing.status === "active"
            ? "This listing is live. Changes show to buyers as soon as you save."
            : "Update the details below."}
        </p>

        <div className="mt-8">
          <ListingForm
            userId={user.id}
            action={updateListingAction.bind(null, listing.id)}
            initialListing={listing}
            socialAccounts={(socialAccounts ?? []) as SocialAccount[]}
            websiteUrl={sellerProfile?.website_url ?? null}
            submitLabel="Save changes"
            pendingLabel="Saving…"
          />
        </div>
      </div>
      <ListingExamplesAside />
    </div>
  );
}
