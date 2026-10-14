import { EmployeeSession } from "@/components/employee-session";

/** The employee area (/ and /c/*). The rep area under /rep never mounts the anonymous session. */
export default function EmployeeLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <EmployeeSession />
      {children}
    </>
  );
}
