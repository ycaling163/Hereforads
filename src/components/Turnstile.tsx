"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

// Cloudflare Turnstile 人机校验(安全核查第 2 批,见 README"安全核查 · 第 2 批")。
// 放在 <form> 里面,Cloudflare 会在表单里生成隐藏字段 cf-turnstile-response,服务端
// 从 formData 里读(src/lib/security/turnstile.ts)。Managed 模式 + interaction-only:
// 大多数访客看不到任何东西,Cloudflare 觉得可疑时才在这里出现一个勾选框。
// 没配 NEXT_PUBLIC_TURNSTILE_SITE_KEY(本地开发)时什么都不渲染。

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * `resetKey` 变化时重置组件拿新 token:同一个 token 只能验证一次,表单提交后(比如
 * useActionState 返回了错误、用户要再提交一次)必须换新的。传 action 的 state 即可。
 */
export function Turnstile({ resetKey }: { resetKey?: unknown }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderWidget = () => {
    const container = containerRef.current;
    if (!SITE_KEY || !container || !window.turnstile || widgetIdRef.current) return;
    widgetIdRef.current =
      window.turnstile.render(container, {
        sitekey: SITE_KEY,
        theme: "light",
        appearance: "interaction-only",
        size: "flexible",
      }) ?? null;
  };

  useEffect(() => {
    // 脚本已经加载过(同一页面的第二个组件、或者客户端跳转回来)时 onReady 之前就能渲染。
    renderWidget();
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, []);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  if (!SITE_KEY) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
      />
      <div ref={containerRef} />
    </>
  );
}
