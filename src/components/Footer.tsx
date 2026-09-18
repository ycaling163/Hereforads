import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 sm:grid-cols-2">
        <div>
          <span className="text-lg font-bold tracking-tight text-zinc-900">
            Here<span className="text-blue-600">For</span>Ads
          </span>
          <p className="mt-3 text-sm text-zinc-500">
            Turn your space into ad space.
          </p>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400">
            Links
          </h3>
          <div className="mt-3 flex flex-col gap-2 text-sm text-zinc-600">
            <Link href="/terms" className="hover:text-zinc-900">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-zinc-900">
              Privacy Policy
            </Link>
            <Link href="/contact" className="hover:text-zinc-900">
              Contact us
            </Link>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-200 px-6 py-4 text-center text-xs text-zinc-400">
        © HereForAds. All rights reserved.
      </div>
    </footer>
  );
}
