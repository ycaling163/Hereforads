"use client";

import { useActionState } from "react";
import { createSpaceAction, type NewSpaceState } from "./actions";

const initialState: NewSpaceState = {};

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700";

export function NewSpaceForm() {
  const [state, formAction, pending] = useActionState(
    createSpaceAction,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className={labelClass}>
          标题
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          placeholder="例如:市中心咖啡馆橱窗广告位"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={labelClass}>
          描述
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          placeholder="介绍一下这个空间的位置、人流量、展示条件等"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="city" className={labelClass}>
          城市(选填)
        </label>
        <input id="city" name="city" type="text" className={inputClass} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price_amount" className={labelClass}>
            价格
          </label>
          <input
            id="price_amount"
            name="price_amount"
            type="number"
            step="0.01"
            min="0"
            required
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price_currency" className={labelClass}>
            币种
          </label>
          <input
            id="price_currency"
            name="price_currency"
            type="text"
            required
            placeholder="CNY / USD"
            defaultValue="CNY"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="duration_days" className={labelClass}>
            租期(天)
          </label>
          <input
            id="duration_days"
            name="duration_days"
            type="number"
            min="1"
            required
            defaultValue={30}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="photo_urls" className={labelClass}>
          图片链接(选填,每行一个)
        </label>
        <textarea
          id="photo_urls"
          name="photo_urls"
          rows={3}
          placeholder={"https://example.com/photo1.jpg\nhttps://example.com/photo2.jpg"}
          className={inputClass}
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 self-start rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "发布中..." : "发布广告位"}
      </button>
    </form>
  );
}
