import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPassword, usesSocialLogin } from "@/lib/supabase/password";
import { SetPasswordForm } from "./SetPasswordForm";

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const hasPw = await hasPassword(supabase);
  const social = usesSocialLogin(user);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {hasPw === false ? "Set a password" : "Password"}
      </h1>
      <p className="mt-2 max-w-xl text-zinc-600">
        {hasPw === false
          ? `You've been signing in with email links. Set a password so next time you can log in with ${user.email} and your password. You can still use email links any time.`
          : social
            ? "You sign in with Google or Facebook. You can also set a password to log in with your email."
            : "Change the password you use to log in."}
      </p>
      {saved && (
        <p className="mt-4 max-w-xl rounded-xl bg-green-50 px-4 py-2 text-sm text-green-700">
          Password saved. Next time you can log in with your email and this password.
        </p>
      )}
      <div className="mt-8">
        <SetPasswordForm submitLabel={hasPw === false ? "Set password" : "Save password"} />
      </div>
    </div>
  );
}
