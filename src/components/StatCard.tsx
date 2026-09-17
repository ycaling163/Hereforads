import Link from "next/link";

export function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-2xl border border-zinc-200 p-6">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
        {value}
      </p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
