import Link from "next/link";

// Guest(没登录)下单付款成功后的落地页 —— 不能像登录用户那样跳
// /dashboard/purchases(guest 这个浏览器里没有 session,会被弹去 /login),
// 用这个不需要登录的页面告诉他们付款成功、去邮箱点登录链接才能追踪订单。
export default async function GuestCheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

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
            We&apos;ve sent a login link to <span className="font-medium">{email}</span> —
            open it to track this order and confirm delivery.
          </>
        ) : (
          " We've emailed you a login link to track this order and confirm delivery."
        )}
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
