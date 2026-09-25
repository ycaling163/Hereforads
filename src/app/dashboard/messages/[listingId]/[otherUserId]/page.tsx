import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReplyForm } from "@/components/ReplyForm";
import { replyToThreadAction } from "../../actions";
import type { ListingMessage } from "@/lib/supabase/types";
import { UUID_PATTERN } from "@/lib/messages";
import { ListingThumb, coverOf } from "@/components/ListingThumb";

export default async function MessageThreadPage({
  params,
}: PageProps<"/dashboard/messages/[listingId]/[otherUserId]">) {
  const { listingId, otherUserId } = await params;
  // 这两个值会拼进下面的 .or() 过滤条件,先确认是 UUID(安全核查第 3 批第 17 条)。
  if (!UUID_PATTERN.test(listingId) || !UUID_PATTERN.test(otherUserId)) {
    notFound();
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: listing }, { data: otherProfile }, { data: messageRows }] =
    await Promise.all([
      supabase.from("listings").select("id,title,media_urls").eq("id", listingId).maybeSingle(),
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

  // 打开这个会话就代表看过了,把对方发来、自己还没读过的消息标记已读,
  // 好让账号头像/侧边栏的未读数字降下去。不等用户交互,静默做就行。
  const unreadIncomingIds = messages
    .filter((m) => m.sender_id === otherUserId && !m.read_at)
    .map((m) => m.id);
  if (unreadIncomingIds.length > 0) {
    await supabase
      .from("listing_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIncomingIds);
  }

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
          className="mt-1 flex items-center gap-2 text-sm text-zinc-500 hover:underline"
        >
          <ListingThumb url={coverOf(listing.media_urls)} size={40} />
          Re: {listing.title}
        </Link>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex max-w-[80%] flex-col gap-2 rounded-2xl px-4 py-2 text-sm ${
              message.sender_id === user.id
                ? "self-end bg-zinc-900 text-white"
                : "self-start bg-zinc-100 text-zinc-900"
            }`}
          >
            {message.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={message.image_url}
                alt=""
                className="max-h-64 rounded-lg object-cover"
              />
            )}
            {message.body && <p>{message.body}</p>}
          </div>
        ))}
      </div>

      <ReplyForm action={replyToThreadAction.bind(null, listingId, otherUserId)} />
    </div>
  );
}
