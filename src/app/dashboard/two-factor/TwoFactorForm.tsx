"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step =
  | { kind: "loading" }
  | { kind: "verify"; factorId: string }
  | { kind: "enroll"; factorId: string; qrCode: string; secret: string }
  | { kind: "error"; message: string };

const inputClass =
  "w-40 rounded-lg border border-zinc-300 px-3 py-2 text-center font-mono text-lg tracking-widest outline-none focus:border-zinc-900";

export function TwoFactorForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        setStep({ kind: "error", message: listError.message });
        return;
      }
      const verified = data.totp.find((factor) => factor.status === "verified");
      if (verified) {
        setStep({ kind: "verify", factorId: verified.id });
        return;
      }
      // 上次绑定到一半(扫了码没验证)留下的未验证因子先删掉,再重新生成二维码。
      for (const factor of data.all) {
        if (factor.factor_type === "totp" && factor.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `HereForAds admin ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enrollError || !enrolled) {
        setStep({ kind: "error", message: enrollError?.message ?? "Couldn't start setup" });
        return;
      }
      setStep({
        kind: "enroll",
        factorId: enrolled.id,
        qrCode: enrolled.totp.qr_code,
        secret: enrolled.totp.secret,
      });
    })();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step.kind !== "verify" && step.kind !== "enroll") return;
    setPending(true);
    setError(null);
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({
      factorId: step.factorId,
      code: code.trim(),
    });
    setPending(false);
    if (verifyError) {
      setError("That code didn't work. Check the time on your phone is correct and try the newest code.");
      setCode("");
      return;
    }
    // 会话已升级到 aal2(新的 cookie 已写好),回后台。
    router.replace("/admin");
    router.refresh();
  }

  if (step.kind === "loading") return <p className="text-sm text-zinc-500">Loading…</p>;
  if (step.kind === "error") {
    return (
      <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        {step.message}. Make sure TOTP is enabled in Supabase → Authentication → Multi-Factor.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {step.kind === "enroll" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-5">
          <p className="text-sm font-medium text-zinc-900">1. Scan this with your authenticator app</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={step.qrCode} alt="QR code for your authenticator app" className="h-48 w-48" />
          <p className="text-xs text-zinc-500">
            Can&apos;t scan? Enter this key instead:{" "}
            <span className="break-all font-mono text-zinc-800">{step.secret}</span>
          </p>
          <p className="text-sm font-medium text-zinc-900">2. Enter the 6-digit code it shows</p>
        </div>
      )}
      {step.kind === "verify" && (
        <p className="text-sm text-zinc-700">Enter the 6-digit code from your authenticator app.</p>
      )}
      <input
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        required
        pattern="\d{6}"
        aria-label="6-digit code"
        className={inputClass}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending || code.length !== 6}
        className="self-start rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Checking…" : step.kind === "enroll" ? "Turn on and continue" : "Verify"}
      </button>
    </form>
  );
}
