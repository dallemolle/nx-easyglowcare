"use server";

import { redirect } from "next/navigation";

import { refreshClientSession, signOutClient } from "@/server/auth/current-client";
import { normalizeSlug } from "@/server/services/tenants";

export async function signOutAction(slug: string): Promise<void> {
  await signOutClient(slug);
  // O slug vem do cliente: só o normalizado (padrão de slug) vira caminho.
  redirect(`/${normalizeSlug(slug) ?? ""}`);
}

export async function refreshSessionAction(slug: string): Promise<void> {
  await refreshClientSession(slug);
}
