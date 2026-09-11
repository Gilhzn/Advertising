import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { devSignInAction, magicLinkSignInAction } from "@/lib/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  // Mirrors the provider gate in `src/auth.ts` - the form is only rendered when the provider exists.
  const isDev = process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_LOGIN === "1";
  const resendEnabled = Boolean(process.env.RESEND_API_KEY);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Sign in</CardTitle>
          <CardDescription>Advertising - AI multi-platform promotion engine</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Sign-in failed. Try again.
            </p>
          ) : null}

          {isDev ? (
            <form action={devSignInAction} className="flex flex-col gap-3">
              <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email (dev login)</Label>
                <Input id="email" name="email" type="email" placeholder="you@example.com" required />
              </div>
              <Button type="submit">Continue</Button>
              <p className="text-xs text-muted-foreground">
                Development-only: signs in (and auto-creates the user) without a password.
              </p>
            </form>
          ) : null}

          {resendEnabled ? (
            <form action={magicLinkSignInAction} className="flex flex-col gap-3 border-t border-border pt-6">
              <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="magic-email">Email (magic link)</Label>
                <Input id="magic-email" name="email" type="email" placeholder="you@example.com" required />
              </div>
              <Button type="submit" variant="outline">
                Send magic link
              </Button>
            </form>
          ) : null}

          {!isDev && !resendEnabled ? (
            <p className="text-sm text-muted-foreground">
              No sign-in provider is configured. Set RESEND_API_KEY to enable magic-link login.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
