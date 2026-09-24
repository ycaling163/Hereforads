import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight text-zinc-900">
          Log in to HereForAds
        </h1>
        {error === "invalid_link" && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
            That link is invalid or has expired — log in below, or ask for a new sign-in link.
          </p>
        )}
        {error === "oauth_failed" && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
            That sign-in didn&apos;t go through — please try again below.
          </p>
        )}
        <LoginForm next={next} />
      </div>
    </div>
  );
}
