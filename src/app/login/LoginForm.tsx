"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PasswordInput } from "@/components/PasswordInput";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-zinc-700">
          邮箱
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
        />
      </div>
      <PasswordInput
        id="password"
        name="password"
        label="密码"
        autoComplete="current-password"
      />

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "登录中..." : "登录"}
      </button>

      <p className="text-center text-sm text-zinc-600">
        还没有账号?{" "}
        <Link href="/register" className="font-medium text-zinc-900 underline">
          去注册
        </Link>
      </p>
    </form>
  );
}
