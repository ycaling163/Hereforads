import { LoginForm } from "./LoginForm";
import { SITE } from "@/config/site";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; code?: string }>;
}) {
  const { next, error, code } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight text-zinc-900">
          Log in to {SITE.name}
        </h1>
        {error === "invalid_link" && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
            That link has already been used or has expired. Each sign-in email&apos;s link and
            code work once — if you already entered the code, you&apos;re signed in on that
            device. Otherwise ask for a new sign-in email below.
          </p>
        )}
        {error === "oauth_failed" && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
            That sign-in didn&apos;t go through — please try again below.
          </p>
        )}
        <LoginForm next={next} startWithCode={code === "1"} />
      </div>
    </div>
  );
}
