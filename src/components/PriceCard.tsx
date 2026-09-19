import { AD_TYPE_LABELS } from "@/lib/supabase/enums";
import type { PriceCardItem } from "@/lib/supabase/types";

// Public-facing rate card on a seller's profile (see README"Price Card"一节)
// —— purely informational, not tied to any actual bookable listing. Only
// rendered when there's at least one row (see SellerProfileView.tsx).
//
// 2026-09-19 去掉了可选的自定义背景图:自由上传的图片很容易跟站内其他卡片
// 的极简 zinc/white 风格不搭、还可能压低价格文字的可读性(见 README 同名
// 一节),改成这版纯列表样式,跟"Social reach"旁边那栏保持一致的视觉语言。
export function PriceCard({ items }: { items: PriceCardItem[] }) {
  return (
    <div>
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        Price list
      </h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200">
        <ul className="divide-y divide-zinc-100">
          {items.map((item, index) => (
            <li
              key={item.id}
              className={`flex items-start justify-between gap-3 px-4 py-3 text-sm ${
                index % 2 === 1 ? "bg-zinc-50" : "bg-white"
              }`}
            >
              <div className="min-w-0">
                <p className="font-medium text-zinc-900">
                  {AD_TYPE_LABELS[item.ad_type]}
                </p>
                {item.platform && (
                  <p className="mt-0.5 text-xs text-zinc-500">{item.platform}</p>
                )}
                {item.note && (
                  <p className="mt-1 text-xs italic text-zinc-400">{item.note}</p>
                )}
              </div>
              <p className="shrink-0 whitespace-nowrap font-semibold text-zinc-900">
                From {item.price_currency} {item.price_amount}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Reference pricing — book and pay through one of the listings below.
      </p>
    </div>
  );
}
