import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReplyForm } from "@/components/ReplyForm";
import { replyToThreadAction } from "../../actions";
import type { ListingMessage } from "@/lib/supabase/types";

export default async function MessageThreadPage({
  params,
}: PageProps<"/dashboard/messages/[listingId]/[otherUserId]">) {
  const { listingId, otherUserId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: listing }, { data: otherProfile }, { data: messageRows }] =
    await Promise.all([
      supabase.from("listings").select("id,title").eq("id", listingId).maybeSingle(),
      supabase
        .from("profiles")
        .select("id,display_name")
        .eq("id", otherUserId)
        .maybeSingle(),
      supabase
        .from("listing_messages")
        .select("*")
        .eq("listing_id", listingId)
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true }),
    ]);

  const messages = (messageRows ?? []) as ListingMessage[];

  return (
    <div className="max-w-2xl">
      <Link href="/dashboard/messages" className="text-sm text-zinc-500 hover:underline">
        ← All messages
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
        {otherProfile?.display_name ?? "Anonymous"}
      </h1>
      {listing && (
        <Link
          href={`/listings/${listing.id}`}
          className="text-sm text-zinc-500 hover:underline"
        >
          Re: {listing.title}
        </Link>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
              message.sender_id === user.id
                ? "self-end bg-zinc-900 text-white"
                : "self-start bg-zinc-100 text-zinc-900"
            }`}
          >
            {message.body}
          </div>
        ))}
      </div>

      <ReplyForm action={replyToThreadAction.bind(null, listingId, otherUserId)} />
    </div>
  );
}
