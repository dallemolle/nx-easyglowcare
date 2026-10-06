"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCpf } from "@/lib/br/cpf";
import { formatPhone } from "@/lib/br/phone";
import { useHydrated } from "@/lib/use-hydrated";
import { signupSchema, startEntrySchema, verifyCodeSchema, type OtpChannel } from "@/lib/validation/entry";
import type { EntryStepResult } from "@/server/auth/current-client";

import { resendCodeAction, startEntryAction, startSignupAction, verifyCodeAction } from "./actions";
import { ClinicContact } from "./clinic-contact";

type CodeInfo = { maskedPhone: string; channel: OtpChannel; resendAvailableAt: string };

type Step = { name: "cpf" } | { name: "signup"; cpf: string } | { name: "code"; info: CodeInfo };


type EntryFlowProps = {
  slug: string;
  voltar: string | null;
  /** Número para `https://wa.me/<número>` (já com 55), ou `null` sem telefone na clínica. */
  clinicPhone: string | null;
  clinicName: string;
};

const CHANNEL_LABEL: Record<OtpChannel, string> = { whatsapp: "WhatsApp", sms: "SMS" };

function heading(step: Step["name"], clinicName: string): { title: string; description: string } {
  switch (step) {
    case "cpf":
      return { title: "Entrar", description: `Informe seu CPF para entrar ou se cadastrar em ${clinicName}.` };
    case "signup":
      return { title: "Criar cadastro", description: "É rápido: só precisamos de mais alguns dados." };
    case "code":
      return { title: "Digite o código", description: "Confirme que este celular é seu." };
  }
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

function ServerMessage({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

export function EntryFlow({ slug, voltar, clinicPhone, clinicName }: EntryFlowProps) {
  const [step, setStep] = useState<Step>({ name: "cpf" });
  const [message, setMessage] = useState<string | null>(null);

  /** Aplica o resultado de uma etapa: avança, mostra o erro ou volta ao CPF (`restart`). */
  function apply(result: EntryStepResult) {
    if (!result.ok) {
      setMessage(result.error);
      if (result.restart) setStep({ name: "cpf" });
      return;
    }
    setMessage(null);
    if (result.step === "signup") setStep({ name: "signup", cpf: result.cpf });
    else {
      const { maskedPhone, channel, resendAvailableAt } = result;
      setStep({ name: "code", info: { maskedPhone, channel, resendAvailableAt } });
    }
  }

  function restart(error: string | null = null) {
    setMessage(error);
    setStep({ name: "cpf" });
  }

  const { title, description } = heading(step.name, clinicName);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {step.name === "cpf" && <CpfStep slug={slug} message={message} onResult={apply} />}
        {step.name === "signup" && (
          <SignupStep slug={slug} cpf={step.cpf} message={message} onResult={apply} />
        )}
        {step.name === "code" && (
          <CodeStep
            key={step.info.resendAvailableAt}
            slug={slug}
            voltar={voltar}
            clinicPhone={clinicPhone}
            info={step.info}
            message={message}
            onResult={apply}
            onError={setMessage}
            onRestart={restart}
          />
        )}
      </CardContent>
    </Card>
  );
}

type StepProps = { slug: string; message: string | null; onResult: (result: EntryStepResult) => void };

function CpfStep({ slug, message, onResult }: StepProps) {
  const [isPending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({ resolver: zodResolver(startEntrySchema), defaultValues: { cpf: "" } });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => onResult(await startEntryAction(slug, data)));
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cpf">CPF</Label>
        <Input
          id="cpf"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          aria-invalid={Boolean(errors.cpf)}
          {...register("cpf", { onChange: (e) => setValue("cpf", formatCpf(e.target.value)) })}
        />
        <FieldError message={errors.cpf?.message} />
      </div>

      <ServerMessage message={message} />

      <Button type="submit" size="lg" disabled={!hydrated || isPending} className="mt-2">
        Continuar
      </Button>
    </form>
  );
}

function SignupStep({ slug, cpf, message, onResult }: StepProps & { cpf: string }) {
  const [isPending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { cpf: formatCpf(cpf), name: "", phone: "", marketing: false },
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => onResult(await startSignupAction(slug, data)));
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cpf">CPF</Label>
        <Input id="cpf" readOnly aria-readonly className="bg-muted" {...register("cpf")} />
        <FieldError message={errors.cpf?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" autoComplete="name" aria-invalid={Boolean(errors.name)} {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Celular (WhatsApp)</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="(11) 98765-4321"
          aria-invalid={Boolean(errors.phone)}
          {...register("phone", { onChange: (e) => setValue("phone", formatPhone(e.target.value)) })}
        />
        <FieldError message={errors.phone?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            aria-invalid={Boolean(errors.acceptTerms)}
            {...register("acceptTerms")}
          />
          <span>
            Li e aceito os{" "}
            <a href={`/${slug}/termos`} target="_blank" rel="noopener" className="underline underline-offset-4">
              Termos de Uso
            </a>{" "}
            e a{" "}
            <a
              href={`/${slug}/privacidade`}
              target="_blank"
              rel="noopener"
              className="underline underline-offset-4"
            >
              Política de Privacidade
            </a>
          </span>
        </label>
        <FieldError message={errors.acceptTerms?.message} />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" {...register("marketing")} />
        <span>Quero receber novidades e promoções por WhatsApp</span>
      </label>

      <ServerMessage message={message} />

      <Button type="submit" size="lg" disabled={!hydrated || isPending} className="mt-2">
        Enviar código
      </Button>
    </form>
  );
}

/** Segundos até `isoDate`, atualizados a cada segundo (0 quando já passou). */
function useSecondsUntil(isoDate: string): number {
  const target = new Date(isoDate).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (now >= target) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [now, target]);

  return Math.max(0, Math.ceil((target - now) / 1000));
}

type CodeStepProps = StepProps & {
  voltar: string | null;
  clinicPhone: string | null;
  info: CodeInfo;
  onError: (message: string | null) => void;
  onRestart: (message?: string | null) => void;
};

function CodeStep({ slug, voltar, clinicPhone, info, message, onResult, onError, onRestart }: CodeStepProps) {
  const [isPending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const secondsLeft = useSecondsUntil(info.resendAvailableAt);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(verifyCodeSchema), defaultValues: { code: "" } });

  const onSubmit = handleSubmit((data) => {
    onError(null);
    startTransition(async () => {
      const result = await verifyCodeAction(slug, data, voltar);
      if (!result) return; // sucesso: a action redireciona
      if (result.restart) onRestart(result.error);
      else onError(result.error);
    });
  });

  function resend(channel: OtpChannel) {
    onError(null);
    startTransition(async () => onResult(await resendCodeAction(slug, { channel })));
  }

  const busy = !hydrated || isPending;
  const canResend = !busy && secondsLeft === 0;

  return (
    <div className="flex flex-col gap-5">
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <p className="text-sm">
          Enviamos um código por {CHANNEL_LABEL[info.channel]} para{" "}
          <span className="font-medium whitespace-nowrap">{info.maskedPhone}</span>
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Código</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={7}
            placeholder="000000"
            className="text-center text-lg tracking-[0.5em]"
            aria-invalid={Boolean(errors.code)}
            {...register("code")}
          />
          <FieldError message={errors.code?.message} />
        </div>

        <ServerMessage message={message} />

        <Button type="submit" size="lg" disabled={busy} className="mt-2">
          Entrar
        </Button>
      </form>

      <div className="flex flex-col items-start gap-1 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <Button type="button" variant="link" className="px-0" disabled={!canResend} onClick={() => resend(info.channel)}>
            Reenviar código
          </Button>
          {info.channel !== "sms" && (
            <Button type="button" variant="link" className="px-0" disabled={!canResend} onClick={() => resend("sms")}>
              Receber por SMS
            </Button>
          )}
        </div>
        {secondsLeft > 0 && (
          <p className="text-muted-foreground" aria-live="polite">
            Você pode pedir um novo código em {secondsLeft} s.
          </p>
        )}
        <ClinicContact clinicPhone={clinicPhone} />
        <Button type="button" variant="link" className="px-0" onClick={() => onRestart()}>
          Trocar CPF
        </Button>
      </div>
    </div>
  );
}
