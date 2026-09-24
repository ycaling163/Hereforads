import type { ListingOrderProofChange } from "@/lib/supabase/types";

// 卖家交付后改过的旧链接(见 updateProofUrlAction),买卖双方的订单页都显示,出纠纷时有据
// 可查。时间用 UTC 显示,跟免费取消截止时间的写法一致。
export function ProofLinkHistory({ changes }: { changes: ListingOrderProofChange[] }) {
  if (changes.length === 0) return null;
  return (
    <details className="mt-2 text-xs text-zinc-500">
      <summary className="cursor-pointer">
        Link changed {changes.length} time{changes.length === 1 ? "" : "s"}
      </summary>
      <ul className="mt-1 flex flex-col gap-1 pl-4">
        {changes.map((change) => (
          <li key={change.id} className="break-all">
            {new Date(change.changed_at).toUTCString().replace(" GMT", " UTC")}: was{" "}
            {change.old_proof_url ?? "(none)"}
          </li>
        ))}
      </ul>
    </details>
  );
}
