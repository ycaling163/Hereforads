"use client";

import { useEffect } from "react";
import { markContactMessagesReadAction } from "./actions";
import { ADMIN_CONTACT_READ_EVENT } from "@/components/AdminNavBadge";

// 页面在浏览器里真正显示后,把这次看到的留言标成已读,并通知顶部导航把红点清掉。
export function MarkContactRead({ before }: { before: string }) {
  useEffect(() => {
    markContactMessagesReadAction(before).then(() => {
      window.dispatchEvent(new Event(ADMIN_CONTACT_READ_EVENT));
    });
  }, [before]);
  return null;
}
