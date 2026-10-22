import { Suspense } from "react";

import { EmployeeSession } from "@/components/employee-session";
import { SignInGate, SignInWait } from "@/components/sign-in-gate";
import { ApiQueryProvider } from "@/lib/api/query-provider";

/**
 * The employee area (/, /login, /c/*, /form). The chat, the form and the conversations need a sign-in.
 * The gate reads the path, which a dynamic route (/c/[id]) only knows at request time: under Suspense.
 */
export default function EmployeeLayout({ children }: LayoutProps<"/">) {
  return (
    <ApiQueryProvider>
      <EmployeeSession />
      <Suspense fallback={<SignInWait text="בודקים התחברות…" />}>
        <SignInGate>{children}</SignInGate>
      </Suspense>
    </ApiQueryProvider>
  );
}
