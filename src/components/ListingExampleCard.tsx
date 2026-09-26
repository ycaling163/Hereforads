import { AD_TYPE_LABELS, PRICING_UNIT_LABELS } from "@/lib/supabase/enums";
import type { ListingExample } from "@/lib/listingExamples";

// 一个发布示例的完整展示:帮助页和发布页的示例面板共用(README"发布示例与帮助页")。
export function ListingExampleCard({
  example,
  compact = false,
}: {
  example: ListingExample;
  compact?: boolean;
}) {
  return (
    <article id={example.id} className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5">
      <h3 className="text-lg font-semibold tracking-tight text-zinc-900">{example.name}</h3>
      <p className="mt-1 text-sm text-zinc-600">{example.summary}</p>
      <p className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 font-medium text-zinc-700">
          Ad type: {AD_TYPE_LABELS[example.adType]}
        </span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 font-medium text-zinc-700">
          Pricing: {PRICING_UNIT_LABELS[example.pricing]}
        </span>
      </p>

      <div className="mt-4 rounded-xl bg-zinc-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Example title</p>
        <p className="mt-1 font-medium text-zinc-900">{example.title}</p>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Example description
        </p>
        <p className="mt-1 whitespace-pre-line text-sm leading-6 text-zinc-700">
          {example.description}
        </p>
      </div>

      {!compact && (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-zinc-900">Proof of delivery</dt>
            <dd className="mt-0.5 text-zinc-600">{example.proof}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900">Tip</dt>
            <dd className="mt-0.5 text-zinc-600">{example.tip}</dd>
          </div>
        </dl>
      )}
    </article>
  );
}
