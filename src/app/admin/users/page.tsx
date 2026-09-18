import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
import type { Profile } from "@/lib/supabase/types";
import { banUserAction, unbanUserAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  cannot_ban_self: "You can't ban your own admin account.",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorParam } = await searchParams;
  const currentAdmin = await requireAdmin();

  const admin = createServiceClient();
  const { data: profileRows, error } = await admin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  const profiles = (profileRows ?? []) as Profile[];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Users
      </h1>
      <p className="mt-2 text-zinc-600">
        {profiles.length} accounts. Banning revokes their login and blocks
        access site-wide.
      </p>

      {errorParam && ERROR_MESSAGES[errorParam] && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {ERROR_MESSAGES[errorParam]}
        </p>
      )}
      {error && <p className="mt-8 text-sm text-red-600">{error.message}</p>}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Joined</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id} className="border-b border-zinc-100">
                <td className="py-2 pr-4 text-zinc-900">
                  {profile.display_name ?? "Anonymous"}
                  {profile.id === currentAdmin.id && (
                    <span className="ml-1 text-xs text-zinc-400">(you)</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-zinc-600">{profile.role}</td>
                <td className="py-2 pr-4 text-zinc-500">
                  {new Date(profile.created_at).toLocaleDateString()}
                </td>
                <td className="py-2 pr-4">
                  {profile.is_banned ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Banned
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Active
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {profile.id === currentAdmin.id ? null : profile.is_banned ? (
                    <form action={unbanUserAction.bind(null, profile.id)}>
                      <button
                        type="submit"
                        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-900 transition-colors hover:border-zinc-400"
                      >
                        Unban
                      </button>
                    </form>
                  ) : (
                    <ConfirmSubmitForm
                      action={banUserAction.bind(null, profile.id)}
                      confirmMessage="Ban this user? They'll be signed out and won't be able to log back in."
                      label="Ban"
                      className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:border-red-400"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
