"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ACCOUNTS_KEY } from "@/hooks/use-settings";

/**
 * Reports the outcome of a Google OAuth round trip.
 *
 * The callback redirects back with `status`, and previously nothing read it:
 * a consent screen the user cancelled, or a grant Google refused, returned
 * them to a Settings page that looked entirely normal. The failure was written
 * into the URL and thrown away.
 *
 * Read from `window.location` inside an effect rather than `useSearchParams`,
 * which would force this statically-rendered page into dynamic rendering for
 * a value that only ever matters on the client, immediately after a redirect.
 */
export function GoogleConnectResult() {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (!status) return;

    if (status === "success") {
      const email = params.get("email");
      toast.success(
        email ? `Connected ${email}.` : "Google account connected.",
      );
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    } else {
      toast.error(params.get("message") ?? "Could not connect the account.");
    }

    // Clear the params so a refresh does not replay the toast, and so a
    // connected address is not left sitting in the address bar.
    const clean = new URL(window.location.href);
    for (const key of ["status", "message", "email", "accountId", "services"]) {
      clean.searchParams.delete(key);
    }
    window.history.replaceState(null, "", clean.toString());
  }, [queryClient]);

  return null;
}
