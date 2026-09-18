import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        Terms of Service
      </h1>
      <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Draft — this page summarizes the platform rules we&rsquo;ve settled on
        so far. It hasn&rsquo;t been reviewed by a lawyer yet and shouldn&rsquo;t be
        treated as final legal terms until it has.
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-6 text-zinc-700">
        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            1. What HereForAds is
          </h2>
          <p className="mt-2">
            HereForAds is a marketplace where publishers list ad placements
            (a spot on a social account, website, or other digital space) and
            buyers pay to advertise there. We provide the listing, payment,
            and messaging tools — we don&rsquo;t create, sell, or manage ad
            inventory ourselves, and we don&rsquo;t guarantee the performance or
            results of any ad placement.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            2. Payments and escrow
          </h2>
          <p className="mt-2">
            Payments are processed through Stripe. When you buy a listing,
            your payment is held in escrow until the publisher marks the
            order as delivered and you confirm receipt — or a fixed number
            of days pass after delivery with no response, at which point
            funds are released automatically. Publishers must complete
            Stripe&rsquo;s identity verification (KYC) before they can publish a
            live listing.
          </p>
          <p className="mt-2">
            HereForAds charges a platform commission on completed
            transactions, deducted from the publisher&rsquo;s payout alongside
            Stripe&rsquo;s own processing fees.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            3. What we don&rsquo;t review or guarantee
          </h2>
          <p className="mt-2">
            Listings are published by users, not vetted by us for ad
            performance or business outcomes. We review new listings before
            they go live and can remove listings or suspend accounts that
            violate these terms, but that review doesn&rsquo;t amount to
            certifying the quality or results of any ad placement.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            4. Staying on-platform
          </h2>
          <p className="mt-2">
            Escrow protection, payment security, and any dispute assistance
            we offer only cover transactions completed through HereForAds
            checkout. If you and another user agree to pay or deliver
            outside the platform, that transaction isn&rsquo;t protected by us in
            any way — we strongly recommend keeping the full transaction on
            HereForAds.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            5. Disputes and refunds
          </h2>
          <p className="mt-2">
            We don&rsquo;t arbitrate disagreements about ad content or quality.
            If a payment itself is disputed (for example, a Stripe chargeback
            or fraud claim), that&rsquo;s handled through Stripe&rsquo;s dispute
            process. Contact us using the form below if you run into a
            problem and we&rsquo;ll help where we can.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            6. Account suspension
          </h2>
          <p className="mt-2">
            We can suspend or ban accounts that violate these terms, commit
            fraud, or otherwise abuse the platform. Banned accounts lose
            access immediately.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            7. Availability
          </h2>
          <p className="mt-2">
            HereForAds is only available where our payment processor
            (Stripe) supports payouts — this currently excludes mainland
            China.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            8. Contact
          </h2>
          <p className="mt-2">
            Questions about these terms? Use the contact form in the footer
            of any page.
          </p>
        </section>
      </div>
    </div>
  );
}
