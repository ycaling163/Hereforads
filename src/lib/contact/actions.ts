"use server";

import { after } from "next/server";
import { sendAdminAlert } from "@/lib/email/send";

import { createServiceClient } from "@/lib/supabase/service";
import { LIMITS, checkRateLimits, clientIp } from "@/lib/security/rateLimit";
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
  const limit = await checkRateLimits(LIMITS.contact(ip));
  if (!limit.allowed) {
    return { error: limit.message };
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

  // 每条新留言立刻发邮件给管理员(产品负责人 2026-09-25 确认),点"回复"直接回给留言人。
  // 放在 after() 里,发信不拖慢提交;sendEmail 本身出错只记日志。
  after(() =>
    sendAdminAlert(
      `New contact message from ${name.replace(/\s+/g, " ").slice(0, 80)}`,
      [message.length > 2000 ? `${message.slice(0, 2000)}…` : message],
      [
        ["Name", name],
        ["Email", email],
      ],
      { cta: { label: "Open contact messages", path: "/admin/contact" }, replyTo: email }
    )
  );

  return { success: true };
}
