// 订单号(2026-09-24 产品负责人定):连续编号,从 HFA-000118 开始,数据库里存的是
// listing_orders.order_number(bigint,序列自增),展示时加前缀补零。买家查订单要订单号
// + 邮箱两个都对上(见 /orders/find),所以连续编号可以被猜到也没关系。
import { SITE } from "@/config/site";

const PREFIX = SITE.orderNumberPrefix;
// 查订单时也认不带连字符/带空格的写法("hfa000118"、"hfa 118"),所以匹配时去掉结尾的 "-"。
const PREFIX_LETTERS = PREFIX.replace(/[-\s]+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ORDER_NUMBER_PATTERN = new RegExp(`^(?:#|${PREFIX_LETTERS}[-\\s]?)?0*(\\d{1,12})$`, "i");

export function formatOrderNumber(orderNumber: number | null | undefined): string {
  if (orderNumber === null || orderNumber === undefined) return "";
  return `${PREFIX}${String(orderNumber).padStart(6, "0")}`;
}

/** 接受 "HFA-000118"、"hfa000118"、"#118"、"118",返回 118;看不懂返回 null。 */
export function parseOrderNumber(input: string): number | null {
  const match = input.trim().match(ORDER_NUMBER_PATTERN);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
