import { SpaceForm } from "@/components/SpaceForm";
import { createSpaceAction } from "./actions";

export default function NewSpacePage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        发布广告位
      </h1>
      <p className="mt-2 text-zinc-600">
        填写你的实体空间信息,发布后买家就能在广告位列表中看到。
      </p>
      <div className="mt-8">
        <SpaceForm
          action={createSpaceAction}
          submitLabel="发布广告位"
          pendingLabel="发布中..."
        />
      </div>
    </div>
  );
}
