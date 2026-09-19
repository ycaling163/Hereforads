import { AD_TYPE_LABELS } from "@/lib/supabase/enums";
import type { PriceCardItem } from "@/lib/supabase/types";

// Public-facing rate card on a seller's profile (see README"Price Card"一节)
// —— purely informational, not tied to any actual bookable listing. Only
// rendered when there's at least one row (see SellerProfileView.tsx).
export function PriceCard({
  items,
  imageUrl,
}: {
  items: PriceCardItem[];
  imageUrl: string | null;
}) {
  return (
    <div>
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        Price list
      </h2>
      <div
        className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-cover bg-center"
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
      >
        <div className={imageUrl ? "bg-white/90 p-4 backdrop-blur-sm" : "bg-zinc-50 p-4"}>
          <ul className="flex flex-col divide-y divide-zinc-200">
            {items.map((item) => (
              <li key={item.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-700">
                    {AD_TYPE_LABELS[item.ad_type]}
                    {item.platform ? ` — ${item.platform}` : ""}
                  </span>
                  <span className="shrink-0 font-medium text-zinc-900">
                    From {item.price_currency} {item.price_amount}
                  </span>
                </div>
                {item.note && <p className="mt-0.5 text-xs text-zinc-500">{item.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Reference pricing — book and pay through one of the listings below.
      </p>
    </div>
  );
}
