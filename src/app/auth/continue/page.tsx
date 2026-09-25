import type { Metadata } from "next";
import { continueSignInAction } from "./actions";
import { SITE } from "@/config/site";

// 带一次性 token 的页面:不收录、不通过 Referer 泄露。
export const metadata: Metadata = {
  title: "Log in",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// 登录邮件链接的落地页(/auth/confirm 把 token_hash 转到这里)。Hotmail/Outlook 的
// Safe Links 等邮箱安全扫描会在用户点之前先打开邮件里的链接;以前一打开就登录,
// 一次性的链接和验证码就被扫描器用掉了,用户再点显示"已过期"。现在要用户点一下按钮
// (POST)才登录,扫描器只打开页面不会点按钮。
export default async function ContinueSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <form action={continueSignInAction} className="flex w-full max-w-sm flex-col gap-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Log in to {SITE.name}
        </h1>
        <p className="text-sm text-zinc-600">Click the button below to finish logging in.</p>
        <input type="hidden" name="token_hash" value={token_hash ?? ""} />
        <input type="hidden" name="type" value={type ?? ""} />
        {next && <input type="hidden" name="next" value={next} />}
        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Log in
        </button>
      </form>
    </div>
  );
}
