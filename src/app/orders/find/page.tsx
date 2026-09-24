import type { Metadata } from "next";
import Link from "next/link";
import { FindOrderForm } from "./FindOrderForm";

export const metadata: Metadata = { title: "Find your order" };

// 弄丢了订单邮件的买家(尤其是没设密码的 guest)用订单号 + 邮箱查订单,见 README
// "订单号与订单查询"。
export default async function FindOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Find your order</h1>
        <p className="mt-2 mb-8 text-sm text-zinc-600">
          Enter the order number from your confirmation email (it starts with HFA-) and the
          email you paid with.
        </p>
        <FindOrderForm initialOrderNumber={order} />
        <p className="mt-6 text-center text-sm text-zinc-600">
          Have an account?{" "}
          <Link href="/login?next=/dashboard/purchases" className="font-medium text-zinc-900 underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
