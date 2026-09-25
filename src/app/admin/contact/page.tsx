import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
import { MarkContactRead } from "./MarkContactRead";
import { deleteContactMessageAction } from "./actions";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at: string;
  read_at: string | null;
}

const RECENT_LIMIT = 200;

// Read-only list of contact form submissions. Since 2026-09-25 each new
// message also emails ADMIN_ALERT_EMAIL, and opening this page marks every
// message shown as read (clears the red count on the admin nav) — see
// MarkContactRead. Messages that were unread when the page loaded get a
// "New" tag for this view. Uses the service client: anon/authenticated have
// no access to contact_messages at all (security batch 2).
export default async function AdminContactPage() {
  await requireAdmin();
  const admin = createServiceClient();
  const loadedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);

  const messages = (data ?? []) as ContactMessage[];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Contact messages
      </h1>
      <p className="mt-2 text-zinc-600">
        Submissions from the footer contact form — the {RECENT_LIMIT} most
        recent. Reply directly to the sender&rsquo;s email; there&rsquo;s no
        in-app reply flow. Deleting a message removes it permanently.
      </p>

      {error && <p className="mt-8 text-sm text-red-600">{error.message}</p>}
      {messages.some((msg) => !msg.read_at) && <MarkContactRead before={loadedAt} />}

      <div className="mt-6 flex flex-col gap-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="rounded-xl border border-zinc-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-medium text-zinc-900">
                {msg.name}
                {!msg.read_at && (
                  <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                    New
                  </span>
                )}
              </span>
              <a
                href={`mailto:${msg.email}`}
                className="text-sm text-zinc-500 hover:underline"
              >
                {msg.email}
              </a>
              <span className="text-xs text-zinc-400">
                {new Date(msg.created_at).toLocaleString()}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
              {msg.message}
            </p>
            <div className="mt-3 flex justify-end">
              <ConfirmSubmitForm
                action={deleteContactMessageAction.bind(null, msg.id)}
                confirmMessage={`Delete this message from ${msg.name}? This can't be undone.`}
                label="Delete"
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-red-600 hover:text-red-600"
              />
            </div>
          </div>
        ))}
        {messages.length === 0 && !error && (
          <p className="mt-8 text-center text-zinc-500">
            No messages yet.
          </p>
        )}
      </div>
    </div>
  );
}
