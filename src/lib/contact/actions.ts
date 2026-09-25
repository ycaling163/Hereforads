"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { LIMITS, RATE_LIMITED_MESSAGE, checkRateLimits, clientIp } from "@/lib/security/rateLimit";
import {
  TURNSTILE_FAILED_MESSAGE,
  turnstileToken,
  verifyTurnstile,
} from "@/lib/security/turnstile";

export interface ContactFormState {
  error?: string;
  success?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Anonymous visitors (not just logged-in users) can submit this — it's the
// site's general "get in touch" form, not tied to any listing/order. Written
// to `contact_messages` (see README's "MVP v2 数据库变更" for the table) with
// the service_role client: since security batch 2 anon/authenticated can't
// insert into the table directly (that let anyone spam it through the REST
// API with the public anon key), so every submission goes through the
// per-IP rate limit and Turnstile check below.
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

  const ip = await clientIp();
  if (!(await checkRateLimits(LIMITS.contact(ip)))) {
    return { error: RATE_LIMITED_MESSAGE };
  }
  if (!(await verifyTurnstile(turnstileToken(formData), ip))) {
    return { error: TURNSTILE_FAILED_MESSAGE };
  }

  const { error } = await createServiceClient().from("contact_messages").insert({
    name,
    email,
    message,
  });

  if (error) {
    console.error("Contact message insert failed:", error.message);
    return { error: "Couldn't send your message, please try again." };
  }

  return { success: true };
}
