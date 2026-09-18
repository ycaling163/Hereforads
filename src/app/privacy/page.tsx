import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        Privacy Policy
      </h1>
      <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Draft — this page describes what we actually collect and how it&rsquo;s
        actually used today. It hasn&rsquo;t been reviewed by a lawyer yet and
        shouldn&rsquo;t be treated as final legal terms until it has.
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-6 text-zinc-700">
        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            1. What we collect
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Account info: email address and password (via Supabase Auth)</li>
            <li>
              Profile info you add: display name, bio, avatar/banner images,
              website link, content categories
            </li>
            <li>
              Social account info you add: platform, handle, profile URL,
              follower counts
            </li>
            <li>Listing content: titles, descriptions, prices, photos</li>
            <li>
              Messages you send other users through the platform, including
              any images attached
            </li>
            <li>
              Payment and payout info handled directly by Stripe — we don&rsquo;t
              see or store your card number or bank details ourselves
            </li>
            <li>
              Anything you submit through the contact form (name, email,
              message)
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            2. How we use it
          </h2>
          <p className="mt-2">
            To run the marketplace: showing listings, processing payments and
            payouts, connecting buyers and publishers, moderating content,
            and responding to support requests. We don&rsquo;t sell your
            personal data.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            3. Who we share it with
          </h2>
          <p className="mt-2">
            We use Supabase for our database, authentication, and file
            storage, and Stripe for payments and identity verification.
            Both process data on our behalf under their own privacy
            policies. We may also disclose information if legally required
            to.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            4. Cookies and tracking
          </h2>
          <p className="mt-2">
            We use a session cookie to keep you signed in (via Supabase
            Auth). We don&rsquo;t currently use third-party analytics or
            advertising trackers on the site.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            5. Your choices
          </h2>
          <p className="mt-2">
            You can edit or remove most of your profile, listing, and social
            account info directly from your dashboard. To request a copy or
            deletion of your account data, use the contact form in the
            footer.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900">
            6. Contact
          </h2>
          <p className="mt-2">
            Questions about this policy? Use the contact form in the footer
            of any page.
          </p>
        </section>
      </div>
    </div>
  );
}
