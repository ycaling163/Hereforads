import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SpaceForm } from "@/components/SpaceForm";
import { updateSpaceAction } from "./actions";
import type { AdSpace } from "@/lib/supabase/types";

export default async function EditSpacePage({
  params,
}: PageProps<"/dashboard/spaces/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: space } = await supabase
    .from("ad_spaces")
    .select("*")
    .eq("id", id)
    .single();

  if (!space) {
    notFound();
  }

  const adSpace = space as AdSpace;

  if (adSpace.seller_id !== user.id) {
    redirect("/dashboard/spaces");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        编辑广告位
      </h1>
      <p className="mt-2 text-zinc-600">
        修改信息后保存,买家会立刻看到最新内容。
      </p>
      <div className="mt-8">
        <SpaceForm
          action={updateSpaceAction.bind(null, id)}
          initialSpace={adSpace}
          submitLabel="保存修改"
          pendingLabel="保存中..."
        />
      </div>
    </div>
  );
}
