"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { buyListingAction, type BuyListingState } from "@/app/listings/[id]/actions";

const primaryButtonClass =
  "w-full rounded-full bg-zinc-900 px-6 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50";
const secondaryButtonClass =
  "w-full rounded-full border border-zinc-300 bg-white px-6 py-3 text-center text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-900";

// 未登录买家点 Buy now 后,才出现"登录 / 注册 / 以访客身份购买"三个选项(常见网店
// 结账页的做法),广告页上不主动宣传"不用注册"——优先引导注册/登录,guest 结账
// 作为兜底保留(见 README"Guest 结账"一节)。
export function BuyListingButton({
  listingId,
  isLoggedIn,
}: {
  listingId: string;
  isLoggedIn: boolean;
}) {
  const [state, formAction, pending] = useActionState<BuyListingState, FormData>(
    buyListingAction,
    {}
  );
  const [showOptions, setShowOptions] = useState(false);
  // 登录/注册完回到这条广告,并带 resume=buy 让页面提示"接着付款"。
  const returnTo = encodeURIComponent(`/listings/${listingId}?resume=buy`);

  const escrowNote = (
    <p className="text-center text-xs text-zinc-500">
      Payment is held in escrow until you confirm delivery.
    </p>
  );

  if (!isLoggedIn && !showOptions) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowOptions(true)}
          className={primaryButtonClass}
        >
          Buy now
        </button>
        {escrowNote}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!isLoggedIn && (
        <>
          <Link href={`/login?next=${returnTo}`} className={primaryButtonClass}>
            Log in to buy
          </Link>
          <Link href={`/register?next=${returnTo}`} className={secondaryButtonClass}>
            Create an account
          </Link>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200" />
            or
            <span className="h-px flex-1 bg-zinc-200" />
          </div>
        </>
      )}
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="listing_id" value={listingId} />
        {!isLoggedIn && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="guest_email" className="text-xs font-medium text-zinc-700">
              Buy as guest — your email
            </label>
            <input
              id="guest_email"
              name="guest_email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
            />
            <p className="text-xs text-zinc-500">
              We&apos;ll email you a link to track this order.
            </p>
          </div>
        )}
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className={isLoggedIn ? primaryButtonClass : secondaryButtonClass}
        >
          {pending
            ? "Redirecting to checkout…"
            : isLoggedIn
              ? "Buy now"
              : "Continue as guest"}
        </button>
        {escrowNote}
      </form>
    </div>
  );
}
