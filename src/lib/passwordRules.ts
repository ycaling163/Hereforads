// 密码规则(安全核查第 3 批第 19 条,产品负责人已确认):至少 8 位,同时包含数字、大写字母
// 和小写字母。Supabase → Auth → Password 也要设成同样的规则(见 README 第 3 批)。
export const PASSWORD_HINT = "At least 8 characters, with a number, an uppercase and a lowercase letter.";

/** 不符合规则时返回报错文案,符合返回 null。 */
export function passwordProblem(password: string): string | null {
  if (
    password.length < 8 ||
    !/[0-9]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password)
  ) {
    return `Password must be ${PASSWORD_HINT.charAt(0).toLowerCase()}${PASSWORD_HINT.slice(1)}`;
  }
  return null;
}
