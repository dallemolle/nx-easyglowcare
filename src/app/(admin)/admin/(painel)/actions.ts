"use server";

import { redirect } from "next/navigation";

import { requireStaff, signOut } from "@/server/auth/current";

export async function logoutAction(): Promise<void> {
  await requireStaff();
  await signOut();
  redirect("/admin/login");
}
