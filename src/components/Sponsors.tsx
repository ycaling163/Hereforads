import type { DateRange } from "@/lib/booking";
import { addDays, formatBookingDate } from "@/lib/booking";
import type { HouseAd, PublicSponsor } from "@/lib/sponsorData";
import { pickHouseAd, sponsorLinkLabel } from "@/lib/sponsors";

// 广告详情页的赞助商展示(README"赞助商展示"一节)。所有外链都新开窗口,标
// rel="sponsored nofollow ..."(付费链接),旁边显示域名,点之前就知道要去哪。

const LINK_REL = "sponsored nofollow noopener noreferrer ugc";

export function SponsorLink({ name, url }: { name: string; url: string | null }) {
  if (!url) {
    return <span className="block truncate font-medium text-zinc-900">{name}</span>;
  }
  return (
    <a href={url} target="_blank" rel={LINK_REL} className="group block min-w-0">
      <span className="block truncate font-medium text-zinc-900 group-hover:underline">
        {name}
      </span>
      <span className="block truncate text-xs text-zinc-500">{sponsorLinkLabel(url)} ↗</span>
    </a>
  );
}

function weekdayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
  });
}

/**
 * 开了日历预订的广告:按天列出——过去 7 天里有展示的买家、今天起 30 天每一天(已预订的
 * 显示买家品牌,没被预订的显示 Available,卖家设了自选展示的同时显示并标 Creator's pick)。
 */
export function SponsorCalendar({
  listingId,
  today,
  bookedRanges,
  sponsors,
  houseAds,
  days = 30,
  pastDays = 7,
}: {
  listingId: string;
  today: string;
  bookedRanges: DateRange[];
  sponsors: PublicSponsor[];
  houseAds: HouseAd[];
  days?: number;
  pastDays?: number;
}) {
  const dated = sponsors.filter((s) => s.startDate && s.endDate);
  const cells = [];
  for (let offset = -pastDays; offset < days; offset++) {
    const date = addDays(today, offset);
    const sponsor = dated.find((s) => date >= s.startDate! && date <= s.endDate!);
    const booked = bookedRanges.some((r) => date >= r.start && date <= r.end);
    if (offset < 0 && !sponsor) continue;
    cells.push({ date, sponsor, booked, past: offset < 0 });
  }

  return (
    <section className="mt-8 min-w-0">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        Sponsor calendar
      </h2>
      <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
        {cells.map(({ date, sponsor, booked, past }) => {
          const houseAd = !sponsor && !booked && !past ? pickHouseAd(houseAds, listingId, date) : null;
          return (
            <div
              key={date}
              className={`flex w-36 shrink-0 snap-start flex-col gap-1.5 rounded-xl border p-3 text-sm ${
                date === today ? "border-zinc-900" : "border-zinc-200"
              } ${past ? "opacity-70" : ""}`}
            >
              <p className="text-xs text-zinc-500">
                {weekdayLabel(date)} · {formatBookingDate(date, false)}
                {date === today && <span className="ml-1 font-medium text-zinc-900">Today</span>}
              </p>
              {sponsor ? (
                <SponsorLink name={sponsor.name} url={sponsor.url} />
              ) : booked ? (
                <span className="text-zinc-400">Booked</span>
              ) : (
                <>
                  <span className="font-medium text-emerald-700">Available</span>
                  {houseAd && (
                    <div className="border-t border-zinc-100 pt-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                        Creator&apos;s pick
                      </span>
                      <SponsorLink name={houseAd.name} url={houseAd.url} />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** 没开日历的广告:自愿展示的历史买家,同一品牌去重,最多 max 个。 */
export function SponsorList({ sponsors, max = 12 }: { sponsors: PublicSponsor[]; max?: number }) {
  const seen = new Set<string>();
  const unique = sponsors.filter((s) => {
    const key = `${s.name.toLowerCase()}|${s.url ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length === 0) return null;

  return (
    <section className="mt-8 min-w-0">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Sponsors</h2>
      <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
        {unique.slice(0, max).map((s) => (
          <div
            key={s.orderId}
            className="flex w-40 shrink-0 snap-start flex-col gap-1 rounded-xl border border-zinc-200 p-3 text-sm"
          >
            <SponsorLink name={s.name} url={s.url} />
            {s.paidAt && (
              <span className="text-xs text-zinc-400">
                {new Date(s.paidAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
