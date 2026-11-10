"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return "Nesprávny e-mail alebo heslo.";
  }
  await createSession(user.id);
  redirect("/tickets");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
