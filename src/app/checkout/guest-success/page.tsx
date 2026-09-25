import type { Metadata } from "next";
import Link from "next/link";
import { stripe } from "@/lib/stripe/server";

export const metadata: Metadata = {
  title: "Payment received",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;

/** "kc•••@hotmail.co.uk":只露出前两个字符和域名。 */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your email";
  return `${local.slice(0, 2)}•••@${domain}`;
}

async function checkoutEmail(sessionId: string | undefined): Promise<string | null> {
  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const email = session.customer_details?.email ?? session.customer_email;
    return email ? maskEmail(email) : null;
  } catch {
    return null;
  }
}

// Guest(没登录)下单付款成功后的落地页 —— 不能像登录用户那样跳
// /dashboard/purchases(guest 这个浏览器里没有 session,会被弹去 /login),
// 用这个不需要登录的页面告诉他们付款成功、去邮箱点登录链接才能追踪订单。
export default async function GuestCheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const email = await checkoutEmail(session_id);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Payment received
      </h1>
      <p className="mt-3 text-zinc-600">
        It&apos;s held in escrow until the seller delivers.
        {email ? (
          <>
            {" "}
            We&apos;ll email your order confirmation to{" "}
            <span className="font-medium">{email}</span> — it has your order number and a
            link to view your order, no login needed.
          </>
        ) : (
          " We'll email your order confirmation with your order number and a link to view your order."
        )}
      </p>
      <p className="mt-3 text-sm text-zinc-500">
        Can&apos;t find the email?{" "}
        <Link href="/orders/find" className="underline">
          Find your order
        </Link>{" "}
        with your order number and email.
      </p>
      <Link
        href="/listings"
        className="mt-8 rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
      >
        Keep browsing
      </Link>
    </div>
  );
}
