"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function deleteSpaceAction(spaceId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await supabase
    .from("ad_spaces")
    .delete()
    .eq("id", spaceId)
    .eq("seller_id", user.id);

  redirect("/dashboard/spaces");
}
