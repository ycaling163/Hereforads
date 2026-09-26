import type { Metadata } from "next";
import Link from "next/link";
import { ListingExampleCard } from "@/components/ListingExampleCard";
import { ESCROW_HOLD_DAYS } from "@/config/site";
import { LISTING_EXAMPLES } from "@/lib/listingExamples";

export const metadata: Metadata = {
  title: "Help & listing examples",
  description:
    "Not sure what you can sell as ad space? See 10 example listings creators publish on HereForAds, and how to write your own.",
};

const WRITING_TIPS: { title: string; body: string }[] = [
  {
    title: "Say what and where in the title",
    body: "\"Your brand logo in my daily Instagram photo\" tells a buyer more than \"Ad space for sale\".",
  },
  {
    title: "List exactly what the buyer gets",
    body: "How many posts, photos or seconds of video, where they appear, and how long they stay up.",
  },
  {
    title: "Give real audience numbers",
    body: "Followers, average views or story views. Buyers compare listings on these.",
  },
  {
    title: "Say what you need from the brand",
    body: "A logo file, the product, a size, key messages — and whether items are returned.",
  },
  {
    title: "Set a delivery time",
    body: "\"Within 7 days of receiving the product\" or \"on the booked day\". Use the booking calendar for daily or weekly ads.",
  },
  {
    title: "Explain how you'll prove it",
    body: "When you mark an order delivered you add a link — usually the post or video. Say this up front.",
  },
];

// 帮助页(产品负责人 2026-09-26):给不知道自己有哪些广告位可以卖的创作者看示例。
// 示例内容在 src/lib/listingExamples.ts,发布页的示例面板用的是同一份。
export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        What can I sell as ad space?
      </h1>
      <p className="mt-3 max-w-2xl text-zinc-600">
        More than you think. If people see you, your content, your clothes, your car or your
        artwork, a brand can pay to be part of it. Here are 10 kinds of listings creators publish,
        each with an example you can copy and adapt.
      </p>

      <nav aria-label="Examples" className="mt-6 flex flex-wrap gap-2">
        {LISTING_EXAMPLES.map((example, index) => (
          <a
            key={example.id}
            href={`#${example.id}`}
            className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-700 hover:border-zinc-900"
          >
            {index + 1}. {example.name}
          </a>
        ))}
      </nav>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
          How to write a listing that sells
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WRITING_TIPS.map((tip, index) => (
            <div key={tip.title} className="rounded-2xl bg-zinc-50 p-5">
              <p className="text-sm font-medium text-zinc-900">
                {index + 1}. {tip.title}
              </p>
              <p className="mt-1 text-sm text-zinc-600">{tip.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">How a sale works</h2>
        <ol className="mt-4 grid gap-3 text-sm text-zinc-700 sm:grid-cols-2">
          <li className="rounded-2xl bg-zinc-50 p-5">
            <span className="font-medium text-zinc-900">1. Publish your listing.</span> It goes
            live straight away.
          </li>
          <li className="rounded-2xl bg-zinc-50 p-5">
            <span className="font-medium text-zinc-900">2. A brand buys it.</span> Their payment
            is held safely by HereForAds — not paid out yet.
          </li>
          <li className="rounded-2xl bg-zinc-50 p-5">
            <span className="font-medium text-zinc-900">3. You deliver.</span> Post the ad, then
            mark the order delivered with a link to it.
          </li>
          <li className="rounded-2xl bg-zinc-50 p-5">
            <span className="font-medium text-zinc-900">4. You get paid.</span> When the buyer
            confirms — or automatically {ESCROW_HOLD_DAYS} days after you mark it delivered. For
            calendar bookings, after the booked dates end.
          </li>
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">10 example listings</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Change the details to match what you actually offer — your platform, audience, sizes and
          timing.
        </p>
        <div className="mt-6 flex flex-col gap-6">
          {LISTING_EXAMPLES.map((example) => (
            <ListingExampleCard key={example.id} example={example} />
          ))}
        </div>
      </section>

      <div className="mt-12 flex flex-wrap items-center gap-4 rounded-2xl bg-zinc-900 p-6 text-white">
        <p className="flex-1 text-lg font-medium">Ready to list your own ad space?</p>
        <Link
          href="/dashboard/new-listing"
          className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
        >
          Publish a listing
        </Link>
        <Link href="/contact" className="text-sm text-zinc-300 underline hover:text-white">
          Still have questions? Contact us
        </Link>
      </div>
    </div>
  );
}
