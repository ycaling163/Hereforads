import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";
import { oauthSignIn } from "@/app/auth/oauth-actions";

// Login/RegisterForm 共用:同一个 signInWithOAuth 调用既处理登录也处理注册
// (Supabase 那边按邮箱自动判断是建新用户还是登录已有用户),不用分开两套按钮。
export function OAuthButtons({ next }: { next?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <form action={oauthSignIn.bind(null, "google", next)}>
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <FcGoogle className="h-5 w-5" />
          Continue with Google
        </button>
      </form>
      <form action={oauthSignIn.bind(null, "facebook", next)}>
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <FaFacebook className="h-5 w-5 text-[#1877F2]" />
          Continue with Facebook
        </button>
      </form>
    </div>
  );
}
