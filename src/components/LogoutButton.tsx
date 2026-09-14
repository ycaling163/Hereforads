import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export function LogoutButton() {
  async function logout() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <form action={logout}>
      <button type="submit" className="hover:text-zinc-900">
        退出登录
      </button>
    </form>
  );
}
