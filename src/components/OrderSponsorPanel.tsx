import {
  setSponsorHiddenBySellerAction,
  setSponsorPublicByBuyerAction,
} from "@/app/dashboard/sponsorActions";
import { SponsorLink } from "@/components/Sponsors";
import type { OrderSponsor } from "@/lib/sponsorData";

const buttonClass =
  "rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-900";

// 订单卡片上的"买家品牌展示"(README"赞助商展示"一节):卖家可以隐藏/重新显示,
// 买家可以撤回/重新打开;管理员隐藏的两边都打不开。只有付款成功的订单才会真正展示。
export function OrderSponsorPanel({
  orderId,
  sponsor,
  role,
}: {
  orderId: string;
  sponsor: OrderSponsor;
  role: "seller" | "buyer";
}) {
  if (!sponsor.name) return null;

  const status = sponsor.hiddenByAdmin
    ? "Hidden by HereForAds (breaks our rules)"
    : !sponsor.isPublic
      ? role === "buyer"
        ? "Not shown — you turned this off"
        : "Not shown — the buyer turned this off"
      : sponsor.hiddenBySeller
        ? role === "seller"
          ? "Hidden by you"
          : "Hidden by the seller"
        : "Shown on the listing once paid";

  let action: React.ReactNode = null;
  if (!sponsor.hiddenByAdmin) {
    if (role === "seller" && sponsor.isPublic) {
      action = (
        <form action={setSponsorHiddenBySellerAction.bind(null, orderId, !sponsor.hiddenBySeller)}>
          <button className={buttonClass}>
            {sponsor.hiddenBySeller ? "Show again" : "Hide from listing"}
          </button>
        </form>
      );
    }
    if (role === "buyer") {
      action = (
        <form action={setSponsorPublicByBuyerAction.bind(null, orderId, !sponsor.isPublic)}>
          <button className={buttonClass}>{sponsor.isPublic ? "Stop showing" : "Show again"}</button>
        </form>
      );
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-50 p-3 text-sm">
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">
          {role === "seller" ? "Buyer's brand on your listing" : "Your brand on this listing"} ·{" "}
          {status}
        </p>
        <SponsorLink name={sponsor.name} url={sponsor.url} />
        {role === "seller" && sponsor.url && (
          <p className="break-all text-xs text-zinc-400">{sponsor.url}</p>
        )}
      </div>
      {action}
    </div>
  );
}
