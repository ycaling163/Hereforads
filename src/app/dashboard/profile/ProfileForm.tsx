"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileFormState } from "./actions";

const initialState: ProfileFormState = {};

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700";

export function ProfileForm({
  initialDisplayName,
  initialBio,
  initialAvatarUrl,
}: {
  initialDisplayName: string;
  initialBio: string;
  initialAvatarUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
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
          <input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/*"
            className={inputClass}
          />
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
