import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight text-zinc-900">
          Log in to HereForAds
        </h1>
        <LoginForm />
      </div>
    </div>
  );
}
