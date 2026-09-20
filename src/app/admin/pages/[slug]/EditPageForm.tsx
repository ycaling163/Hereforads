"use client";

import { useActionState } from "react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { updateSitePageAction, type EditableSlug, type EditSitePageState } from "./actions";

const initialState: EditSitePageState = {};

export function EditPageForm({
  slug,
  initialTitle,
  initialContentHtml,
}: {
  slug: EditableSlug;
  initialTitle: string;
  initialContentHtml: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateSitePageAction.bind(null, slug),
    initialState
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium text-zinc-700">
          Page title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={initialTitle}
          className="max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-700">Content</label>
        <RichTextEditor name="content_html" defaultValue={initialContentHtml} />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && (
        <p className="text-sm text-green-700">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 w-fit rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
