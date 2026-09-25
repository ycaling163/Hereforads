"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkMessageAllowed } from "@/lib/messages";
import { checkUpload } from "@/lib/uploads";

// 私信图片复用已有的 ad-space-photos bucket,不用新建。
const MESSAGE_MEDIA_BUCKET = "ad-space-photos";

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
  const imageFile = formData.get("image");
  const hasImage = imageFile instanceof File && imageFile.size > 0;

  if (!body && !hasImage) {
    return { error: "Write a message or attach a photo" };
  }

  const notAllowed = await checkMessageAllowed(supabase, listingId, user.id, otherUserId);
  if (notAllowed) {
    return { error: notAllowed };
  }

  let imageUrl: string | null = null;
  if (hasImage && imageFile instanceof File) {
    const checked = await checkUpload(imageFile, "image");
    if (!checked.ok) {
      return { error: checked.error };
    }
    const path = `${user.id}/messages/${randomUUID()}.${checked.ext}`;
    const { error: uploadError } = await supabase.storage
      .from(MESSAGE_MEDIA_BUCKET)
      .upload(path, imageFile, { contentType: checked.contentType });

    if (uploadError) {
      return { error: `Photo upload failed: ${uploadError.message}` };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(MESSAGE_MEDIA_BUCKET).getPublicUrl(path);
    imageUrl = publicUrl;
  }

  const { error } = await supabase.from("listing_messages").insert({
    listing_id: listingId,
    sender_id: user.id,
    receiver_id: otherUserId,
    body,
    image_url: imageUrl,
  });

  if (error) {
    return { error: error.message };
  }

  redirect(`/dashboard/messages/${listingId}/${otherUserId}`);
}
