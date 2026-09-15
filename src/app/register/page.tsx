import { RegisterForm } from "./RegisterForm";

export default function RegisterPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight text-zinc-900">
          注册 Here For Ads
        </h1>
        <RegisterForm />
      </div>
    </div>
  );
}
