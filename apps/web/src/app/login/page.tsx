import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { devSignInAction, magicLinkSignInAction, ownerSignInAction } from "@/lib/actions/auth";
import { isOwnerLoginEnabled } from "@/lib/owner-auth";
import { missingRequiredEnv } from "@/lib/setup-status";

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
  // Only computed for the setup screen below, which renders solely when no provider exists.
  const setupGaps = ownerLoginEnabled || isDev || resendEnabled ? [] : missingRequiredEnv();

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
            <div className="flex flex-col gap-4 text-sm text-muted-foreground">
              <div className="flex flex-col gap-2">
                <p className="font-medium text-foreground">Finish setting up this deployment</p>
                <p>
                  No sign-in provider is configured yet. Add these two environment variables, then redeploy:
                </p>
                <ul className="flex flex-col gap-1">
                  <li>
                    <code>OWNER_EMAIL</code> - the email you will sign in with
                  </li>
                  <li>
                    <code>OWNER_PASSWORD</code> - the password you choose
                  </li>
                </ul>
                <p>
                  On Vercel: Settings - Environment Variables, then Deployments - Redeploy. To avoid storing
                  the password in plain text, set <code>OWNER_PASSWORD_HASH</code> instead (run{" "}
                  <code>pnpm owner:hash</code> locally). <code>RESEND_API_KEY</code> enables magic-link
                  sign-in as an alternative.
                </p>
              </div>

              {setupGaps.length > 0 ? (
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <p className="font-medium text-foreground">Also still missing</p>
                  <ul className="flex flex-col gap-2">
                    {setupGaps.map((item) => (
                      <li key={item.name}>
                        <code>{item.name}</code>
                        <span className="block text-xs">{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
