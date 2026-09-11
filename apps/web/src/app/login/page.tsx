import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { devSignInAction, magicLinkSignInAction, ownerSignInAction } from "@/lib/actions/auth";
import { isOwnerLoginEnabled } from "@/lib/owner-auth";

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "Too many attempts. Wait 15 minutes and try again.",
  invalid_credentials: "Invalid email or password.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; code?: string }>;
}) {
  const { callbackUrl, error, code } = await searchParams;
  // Mirrors the provider gates in `src/auth.ts` - each form is only rendered when its provider exists.
  const isDev = process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_LOGIN === "1";
  const resendEnabled = Boolean(process.env.RESEND_API_KEY);
  const ownerLoginEnabled = isOwnerLoginEnabled();

  const errorMessage = error ? (code && ERROR_MESSAGES[code]) || "Sign-in failed. Try again." : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Sign in</CardTitle>
          <CardDescription>Advertising - AI multi-platform promotion engine</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {errorMessage ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
          ) : null}

          {ownerLoginEnabled ? (
            <form action={ownerSignInAction} className="flex flex-col gap-3">
              <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="owner-email">Email</Label>
                <Input id="owner-email" name="email" type="email" placeholder="you@example.com" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="owner-password">Password</Label>
                <Input id="owner-password" name="password" type="password" required />
              </div>
              <Button type="submit">Sign in</Button>
            </form>
          ) : null}

          {isDev ? (
            <form
              action={devSignInAction}
              className={`flex flex-col gap-3 ${ownerLoginEnabled ? "border-t border-border pt-6" : ""}`}
            >
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
            <form
              action={magicLinkSignInAction}
              className={`flex flex-col gap-3 ${ownerLoginEnabled || isDev ? "border-t border-border pt-6" : ""}`}
            >
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

          {!ownerLoginEnabled && !isDev && !resendEnabled ? (
            <p className="text-sm text-muted-foreground">
              No sign-in provider is configured. Set OWNER_EMAIL + OWNER_PASSWORD_HASH (see{" "}
              <code>pnpm owner:hash</code>), or RESEND_API_KEY for magic-link login.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
