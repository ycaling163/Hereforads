import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-32 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
        hereforads
      </p>
      <h1 className="mt-4 max-w-2xl text-5xl font-semibold tracking-tight text-zinc-900">
        把你的空间,变成广告位
      </h1>
      <p className="mt-6 max-w-md text-lg text-zinc-600">
        墙面、橱窗、门店、车身——发布你的实体空间,让品牌找到你。
      </p>
      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
        <Link
          href="/spaces"
          className="rounded-full bg-zinc-900 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          浏览广告位
        </Link>
        <Link
          href="/dashboard/new-space"
          className="rounded-full border border-zinc-300 px-8 py-3 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400"
        >
          发布你的广告位
        </Link>
      </div>
    </div>
  );
}
