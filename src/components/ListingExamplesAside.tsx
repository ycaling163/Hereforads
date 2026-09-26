import { LISTING_EXAMPLES } from "@/lib/listingExamples";

// 发布/编辑广告页右侧的示例面板(产品负责人 2026-09-26):不知道能卖什么、怎么写的创作者
// 看一眼就有方向。链接新开窗口,不会丢掉正在填的表单。
export function ListingExamplesAside() {
  const featured = LISTING_EXAMPLES[0];
  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Example listing</p>
        <p className="mt-2 font-semibold text-zinc-900">{featured.title}</p>
        <p className="mt-2 line-clamp-6 whitespace-pre-line text-sm leading-6 text-zinc-600">
          {featured.description}
        </p>
        <a
          href={`/help#${featured.id}`}
          target="_blank"
          rel="noopener"
          className="mt-3 inline-block text-sm font-medium text-zinc-900 underline"
        >
          See the full example ↗
        </a>
      </div>

      <div className="rounded-2xl bg-zinc-50 p-5">
        <p className="text-sm font-medium text-zinc-900">Not sure what to sell?</p>
        <p className="mt-1 text-xs text-zinc-500">Creators on HereForAds sell things like:</p>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {LISTING_EXAMPLES.map((example) => (
            <li key={example.id}>
              <a
                href={`/help#${example.id}`}
                target="_blank"
                rel="noopener"
                className="text-zinc-700 hover:text-zinc-900 hover:underline"
              >
                {example.name}
              </a>
            </li>
          ))}
        </ul>
        <a
          href="/help"
          target="_blank"
          rel="noopener"
          className="mt-4 inline-block text-xs font-medium text-zinc-900 underline"
        >
          All examples &amp; writing tips ↗
        </a>
      </div>
    </aside>
  );
}
