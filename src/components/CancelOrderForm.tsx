import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
import { cancelWithin24hAction } from "@/lib/orders/actions";

// 付款后 24 小时内的免费取消按钮(README"费用、取消与退款规则"第 4 条),买家的
// Purchases 页和卖家的 Sales 页共用。是否还在 24 小时内由页面判断后才渲染这个组件,
// 真正的校验在 cancelWithin24hAction 里服务端再做一遍。
export function CancelOrderForm({
  orderId,
  returnTo,
  deadline,
}: {
  orderId: string;
  returnTo: "sales" | "purchases";
  deadline: Date;
}) {
  const refundee = returnTo === "sales" ? "the buyer" : "you";
  return (
    <div className="mt-3 flex flex-col gap-1">
      <ConfirmSubmitForm
        action={cancelWithin24hAction.bind(null, orderId, returnTo)}
        confirmMessage={`Cancel this order? A full refund goes to ${refundee}. This can't be undone.`}
        label="Cancel order"
        className="self-start rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-900"
      />
      <p className="text-xs text-zinc-400">
        Free cancellation until {deadline.toUTCString().replace(" GMT", " UTC")} — full
        refund to {refundee}, no fees.
      </p>
    </div>
  );
}
