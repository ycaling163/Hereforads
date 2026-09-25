"use client";

import { useEffect, useState } from "react";

export const ADMIN_CONTACT_READ_EVENT = "admin-contact-read";

// 管理后台导航 "Contact" 上的未读红点。数量由服务端 layout 算好传进来;在
// /admin/contact 标成已读后收到事件就清零(layout 在站内跳转时不会重新渲染)。
export function AdminNavBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  useEffect(() => {
    const clear = () => setCount(0);
    window.addEventListener(ADMIN_CONTACT_READ_EVENT, clear);
    return () => window.removeEventListener(ADMIN_CONTACT_READ_EVENT, clear);
  }, []);
  if (count <= 0) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
