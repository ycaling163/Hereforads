"use client";

import { useEffect, useState } from "react";

function msUntilNextMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function DailyCountdown() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(msUntilNextMidnight());
    const initial = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);

  if (remaining === null) {
    return null;
  }

  return (
    <p className="mt-4 text-sm text-zinc-500">
      距离今日档期刷新还剩{" "}
      <span className="font-medium tabular-nums text-zinc-900">
        {formatDuration(remaining)}
      </span>
    </p>
  );
}
