"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PasswordInput } from "@/components/PasswordInput";
import { registerAction, type RegisterState } from "./actions";

const initialState: RegisterState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(
    registerAction,
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
        minLength={6}
        autoComplete="new-password"
      />
      <PasswordInput
        id="confirmPassword"
        name="confirmPassword"
        label="确认密码"
        minLength={6}
        autoComplete="new-password"
      />

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && (
        <p className="text-sm text-green-700">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "注册中..." : "注册"}
      </button>

      <p className="text-center text-sm text-zinc-600">
        已经有账号了?{" "}
        <Link href="/login" className="font-medium text-zinc-900 underline">
          去登录
        </Link>
      </p>
    </form>
  );
}
