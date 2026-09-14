import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewSpaceForm } from "./NewSpaceForm";

export default async function NewSpacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        发布广告位
      </h1>
      <p className="mt-2 text-zinc-600">
        填写你的实体空间信息,发布后买家就能在广告位列表中看到。
      </p>
      <div className="mt-8">
        <NewSpaceForm />
      </div>
    </div>
  );
}
