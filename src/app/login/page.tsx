import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight text-zinc-900">
          Log in to HereForAds
        </h1>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
