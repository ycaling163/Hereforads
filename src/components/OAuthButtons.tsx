import { FcGoogle } from "react-icons/fc";
import { oauthSignIn } from "@/app/auth/oauth-actions";

// Login/RegisterForm 共用:同一个 signInWithOAuth 调用既处理登录也处理注册
// (Supabase 那边按邮箱自动判断是建新用户还是登录已有用户),不用分开两套按钮。
//
// Facebook 按钮暂时没上:Supabase 那边的 Facebook provider 还没配置(要先去
// Facebook for Developers 建应用、填 Client ID/Secret),按钮点了会直接报错。
// oauth-actions.ts 里 "facebook" 这个 provider 分支已经写好了,配置好之后把
// 下面这个 <form> 加回来就行,不用再改逻辑代码。
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
    </div>
  );
}
