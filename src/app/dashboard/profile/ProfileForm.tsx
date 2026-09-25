"use client";

import { useActionState } from "react";
import { LISTING_CATEGORIES, LISTING_CATEGORY_LABELS } from "@/lib/supabase/enums";
import type { ListingCategory } from "@/lib/supabase/enums";
import { updateProfileAction, type ProfileFormState } from "./actions";
import { FileInput } from "@/components/FileInput";
import { SITE_DOMAIN } from "@/config/site";

const initialState: ProfileFormState = {};

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700";

export function ProfileForm({
  initialDisplayName,
  initialUsername,
  initialBio,
  initialAvatarUrl,
  initialBannerUrl,
  initialContentCategories,
  initialWebsiteUrl,
}: {
  initialDisplayName: string;
  initialUsername: string;
  initialBio: string;
  initialAvatarUrl: string | null;
  initialBannerUrl: string | null;
  initialContentCategories: ListingCategory[];
  initialWebsiteUrl: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="banner" className={labelClass}>
          Profile banner (optional)
        </label>
        <p className="text-xs text-zinc-500">
          Shown across the top of your public profile page. Uploading a new
          one replaces and deletes the old one.
        </p>
        <div className="h-24 w-full overflow-hidden rounded-xl bg-zinc-100">
          {initialBannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={initialBannerUrl}
              alt="Banner"
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <FileInput id="banner" name="banner" accept="image/*" />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-zinc-400">
          {initialAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={initialAvatarUrl}
              alt="Avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            "None"
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="avatar" className={labelClass}>
            Change avatar (optional)
          </label>
          <FileInput id="avatar" name="avatar" accept="image/*" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="display_name" className={labelClass}>
          Display name
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          defaultValue={initialDisplayName}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className={labelClass}>
          Public profile link (optional)
        </label>
        <p className="text-xs text-zinc-500">
          A link that&rsquo;s easier to share than a random ID — lowercase
          letters, numbers, and hyphens only.
        </p>
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 focus-within:border-zinc-900">
          <span className="flex shrink-0 items-center bg-zinc-50 px-3 text-sm text-zinc-500">
            {SITE_DOMAIN}/
          </span>
          <input
            id="username"
            name="username"
            type="text"
            defaultValue={initialUsername}
            placeholder="your-name"
            className="min-w-0 flex-1 px-3 py-2 text-sm outline-none"
          />
        </div>
        {initialUsername && (
          <a
            href={`/${initialUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
          >
            View your public profile →
          </a>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bio" className={labelClass}>
          Seller bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={initialBio}
          placeholder="Tell buyers about yourself and your space to build trust"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="website_url" className={labelClass}>
          Website (optional)
        </label>
        <p className="text-xs text-zinc-500">
          Shown on your public profile page only — not on listing cards or
          listing pages, where buyers care more about platform follower
          counts.
        </p>
        <input
          id="website_url"
          name="website_url"
          type="text"
          defaultValue={initialWebsiteUrl}
          placeholder="e.g. example.com"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className={labelClass}>Your content niche</p>
        <p className="text-xs text-zinc-500">
          What kind of creator are you? This is about your own content — not
          the same as the ad categories a listing accepts (set those when you
          publish a listing, since one placement can take ads from brands
          outside your niche).
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {/* "any"(接任何类目的广告)只对 listings.categories 有意义,这里是
              创作者自己的内容领域,不该出现这个选项。 */}
          {LISTING_CATEGORIES.filter((category) => category !== "any").map((category) => (
            <label
              key={category}
              className="flex items-center gap-2 text-sm text-zinc-700"
            >
              <input
                type="checkbox"
                name="content_categories"
                value={category}
                defaultChecked={initialContentCategories.includes(category)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              {LISTING_CATEGORY_LABELS[category]}
            </label>
          ))}
        </div>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">Saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 self-start rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
