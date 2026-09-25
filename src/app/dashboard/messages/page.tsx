import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Listing, ListingMessage, Profile } from "@/lib/supabase/types";
import { ListingThumb, coverOf } from "@/components/ListingThumb";

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: messageRows, error } = await supabase
    .from("listing_messages")
    .select("*")
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const messages = (messageRows ?? []) as ListingMessage[];

  // 按 (listing_id, 对方 id) 分组,已经按时间倒序,第一条命中的就是每个会话最新的一条。
  // hasUnread 要扫这个会话里的每一条(不只是最新一条)——卖家可能在买家发完新消息
  // 后自己又回了一句,这样"最新一条"是自己发的、read_at 天然是 null,但会话本身
  // 还有更早一条对方发的未读消息,不能因为看最新一条就漏掉。
  const threads = new Map<
    string,
    { listingId: string; otherUserId: string; lastMessage: ListingMessage; hasUnread: boolean }
  >();
  for (const message of messages) {
    const otherUserId =
      message.sender_id === user.id ? message.receiver_id : message.sender_id;
    const key = `${message.listing_id}:${otherUserId}`;
    const isUnreadForMe = message.receiver_id === user.id && !message.read_at;
    const existing = threads.get(key);
    if (!existing) {
      threads.set(key, {
        listingId: message.listing_id,
        otherUserId,
        lastMessage: message,
        hasUnread: isUnreadForMe,
      });
    } else if (isUnreadForMe) {
      existing.hasUnread = true;
    }
  }
  const threadList = [...threads.values()];

  const listingIds = [...new Set(threadList.map((t) => t.listingId))];
  const otherUserIds = [...new Set(threadList.map((t) => t.otherUserId))];

  const [{ data: listingRows }, { data: profileRows }] = await Promise.all([
    listingIds.length
      ? supabase.from("listings").select("id,title,media_urls").in("id", listingIds)
      : Promise.resolve({ data: [] as Pick<Listing, "id" | "title" | "media_urls">[] }),
    otherUserIds.length
      ? supabase.from("profiles").select("id,display_name").in("id", otherUserIds)
      : Promise.resolve({ data: [] as Pick<Profile, "id" | "display_name">[] }),
  ]);

  const listingsById = new Map((listingRows ?? []).map((l) => [l.id, l.title]));
  const coversById = new Map((listingRows ?? []).map((l) => [l.id, coverOf(l.media_urls)]));
  const namesById = new Map(
    (profileRows ?? []).map((p) => [p.id, p.display_name ?? "Anonymous"])
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Messages
      </h1>

      {error && <p className="mt-8 text-sm text-red-600">{error.message}</p>}

      {!error && threadList.length === 0 && (
        <p className="mt-16 text-center text-zinc-500">No conversations yet.</p>
      )}

      <div className="mt-8 flex flex-col gap-3">
        {threadList.map((thread) => (
          <Link
            key={`${thread.listingId}:${thread.otherUserId}`}
            href={`/dashboard/messages/${thread.listingId}/${thread.otherUserId}`}
            className={`flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-zinc-50 ${
              thread.hasUnread ? "border-zinc-300 bg-zinc-50" : "border-zinc-200"
            }`}
          >
            <ListingThumb url={coversById.get(thread.listingId)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-medium text-zinc-900">
                  {namesById.get(thread.otherUserId) ?? "Anonymous"}
                  {thread.hasUnread && (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      New
                    </span>
                  )}
                </p>
                <span className="text-xs text-zinc-400">
                  {listingsById.get(thread.listingId) ?? "Listing"}
                </span>
              </div>
              <p
                className={`mt-1 line-clamp-1 text-sm ${
                  thread.hasUnread ? "font-semibold text-zinc-800" : "text-zinc-500"
                }`}
              >
                {thread.lastMessage.body || (thread.lastMessage.image_url ? "📷 Photo" : "")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
