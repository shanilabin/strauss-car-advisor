import { EmployeeSession } from "@/components/employee-session";
import { ApiQueryProvider } from "@/lib/api/query-provider";

/** The employee area (/ and /c/*). The rep area under /rep never mounts the anonymous session. */
export default function EmployeeLayout({ children }: LayoutProps<"/">) {
  return (
    <ApiQueryProvider>
      <EmployeeSession />
      {children}
    </ApiQueryProvider>
  );
}
