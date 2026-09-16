"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface ReplyState {
  error?: string;
}

export async function replyToThreadAction(
  listingId: string,
  otherUserId: string,
  _prevState: ReplyState,
  formData: FormData
): Promise<ReplyState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const body = String(formData.get("body") ?? "").trim();
  if (!body) {
    return { error: "Message can't be empty" };
  }

  const { error } = await supabase.from("listing_messages").insert({
    listing_id: listingId,
    sender_id: user.id,
    receiver_id: otherUserId,
    body,
  });

  if (error) {
    return { error: error.message };
  }

  redirect(`/dashboard/messages/${listingId}/${otherUserId}`);
}
