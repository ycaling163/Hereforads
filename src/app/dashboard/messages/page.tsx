import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Listing, ListingMessage, Profile } from "@/lib/supabase/types";

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
  const threads = new Map<
    string,
    { listingId: string; otherUserId: string; lastMessage: ListingMessage }
  >();
  for (const message of messages) {
    const otherUserId =
      message.sender_id === user.id ? message.receiver_id : message.sender_id;
    const key = `${message.listing_id}:${otherUserId}`;
    if (!threads.has(key)) {
      threads.set(key, { listingId: message.listing_id, otherUserId, lastMessage: message });
    }
  }
  const threadList = [...threads.values()];

  const listingIds = [...new Set(threadList.map((t) => t.listingId))];
  const otherUserIds = [...new Set(threadList.map((t) => t.otherUserId))];

  const [{ data: listingRows }, { data: profileRows }] = await Promise.all([
    listingIds.length
      ? supabase.from("listings").select("id,title").in("id", listingIds)
      : Promise.resolve({ data: [] as Pick<Listing, "id" | "title">[] }),
    otherUserIds.length
      ? supabase.from("profiles").select("id,display_name").in("id", otherUserIds)
      : Promise.resolve({ data: [] as Pick<Profile, "id" | "display_name">[] }),
  ]);

  const listingsById = new Map((listingRows ?? []).map((l) => [l.id, l.title]));
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
            className="rounded-xl border border-zinc-200 p-4 transition-colors hover:bg-zinc-50"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-zinc-900">
                {namesById.get(thread.otherUserId) ?? "Anonymous"}
              </p>
              <span className="text-xs text-zinc-400">
                {listingsById.get(thread.listingId) ?? "Listing"}
              </span>
            </div>
            <p className="mt-1 line-clamp-1 text-sm text-zinc-500">
              {thread.lastMessage.body || (thread.lastMessage.image_url ? "📷 Photo" : "")}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
