"use server";

import { createClient } from "@/lib/supabase/server";

export interface ContactFormState {
  error?: string;
  success?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Anonymous visitors (not just logged-in users) can submit this — it's the
// site's general "get in touch" form, not tied to any listing/order. Written
// to `contact_messages` (see README's "MVP v2 数据库变更" for the SQL) via
// the normal anon-key client: the table's RLS only grants an insert policy,
// no select, so a submission can't be read back by the visitor or anyone
// without the service_role key used by /admin/contact.
export async function submitContactMessageAction(
  _prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name || !email || !message) {
    return { error: "Please fill in your name, email, and message." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("contact_messages").insert({
    name,
    email,
    message,
  });

  if (error) {
    return { error: "Couldn't send your message, please try again." };
  }

  return { success: true };
}
