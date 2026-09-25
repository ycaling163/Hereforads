import Link from "next/link";

export function StatCard({
  label,
  value,
  href,
  badge,
  badgeTone = "red",
}: {
  label: string;
  value: string;
  href?: string;
  /** 右上角的小标签,比如 "3 new"、"+2 today";不传就不显示。 */
  badge?: string;
  badgeTone?: "red" | "green";
}) {
  const content = (
    <div className="relative rounded-2xl border border-zinc-200 p-6">
      {badge && (
        <span
          className={`absolute right-4 top-4 rounded-full px-2 py-0.5 text-xs font-semibold ${
            badgeTone === "red" ? "bg-red-600 text-white" : "bg-green-100 text-green-800"
          }`}
        >
          {badge}
        </span>
      )}
      <p className={`text-sm text-zinc-500 ${badge ? "pr-20" : ""}`}>{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
        {value}
      </p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
