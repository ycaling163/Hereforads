export default function BannedPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Account suspended
        </h1>
        <p className="mt-3 max-w-sm text-zinc-600">
          This account has been suspended for violating our terms. If you
          think this is a mistake, contact support.
        </p>
      </div>
    </div>
  );
}
