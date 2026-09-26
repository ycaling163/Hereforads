"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  addHouseAdAction,
  deleteHouseAdAction,
  type HouseAdFormState,
} from "@/app/dashboard/sponsorActions";
import { MAX_HOUSE_ADS, SPONSOR_NAME_MAX, SPONSOR_URL_MAX, sponsorLinkLabel } from "@/lib/sponsors";

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";

export interface HouseAdItem {
  id: string;
  name: string;
  url: string | null;
  hiddenByAdmin: boolean;
}

// 卖家的空档自选展示(README"赞助商展示"第 3 条):日历上没被预订的日子轮换显示其中一条,
// 标"Creator's pick",那天仍可预订。
export function HouseAdsManager({ items }: { items: HouseAdItem[] }) {
  const [state, formAction, pending] = useActionState<HouseAdFormState, FormData>(
    addHouseAdAction,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-900">{item.name}</p>
                <p className="truncate text-xs text-zinc-500">
                  {item.url ? sponsorLinkLabel(item.url) : "No link"}
                  {item.hiddenByAdmin && (
                    <span className="ml-2 text-red-600">Hidden by HereForAds</span>
                  )}
                </p>
              </div>
              <form action={deleteHouseAdAction.bind(null, item.id)}>
                <button className="text-xs font-medium text-zinc-500 hover:text-red-600">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {items.length < MAX_HOUSE_ADS && (
        <form
          ref={formRef}
          action={formAction}
          className="grid gap-3 rounded-2xl border border-zinc-200 p-4 sm:grid-cols-[1fr_1.5fr_auto]"
        >
          <input
            name="name"
            required
            maxLength={SPONSOR_NAME_MAX}
            placeholder="Brand name"
            aria-label="Brand name"
            className={inputClass}
          />
          <input
            name="url"
            inputMode="url"
            maxLength={SPONSOR_URL_MAX}
            placeholder="One website or social link (optional)"
            aria-label="Link"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add"}
          </button>
          {state.error && <p className="text-sm text-red-600 sm:col-span-3">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
