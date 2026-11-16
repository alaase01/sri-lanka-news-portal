import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { Wordmark } from "@/components/layout/Wordmark";
import { currentAdmin } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in" };

// Reads the session cookie, so it renders per request and is never cached.
export const instant = false;

export default async function LoginPage() {
  if (await currentAdmin()) redirect("/admin");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-sm sm:p-8">
        <Wordmark tone="light" className="text-2xl" />
        <h1 className="mt-4 text-xl font-bold">Administrator sign in</h1>
        <p className="mt-1 text-sm text-muted">This area is for the site administrator only.</p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
