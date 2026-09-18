import { createServiceClient } from "@/lib/supabase/service";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at: string;
}

const RECENT_LIMIT = 200;

// Read-only, same as /admin/orders — there's no email notification hooked up
// yet (see README's "已知欠缺"), so this is currently the only way anyone
// sees a footer contact form submission. Uses the service client because
// contact_messages only has an insert policy (anyone can submit, nobody can
// read it back), on purpose — admin reads deliberately bypass RLS instead of
// opening up a select policy to authenticated users.
export default async function AdminContactPage() {
  const admin = createServiceClient();
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
        in-app reply flow.
      </p>

      {error && <p className="mt-8 text-sm text-red-600">{error.message}</p>}

      <div className="mt-6 flex flex-col gap-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="rounded-xl border border-zinc-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-medium text-zinc-900">{msg.name}</span>
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
