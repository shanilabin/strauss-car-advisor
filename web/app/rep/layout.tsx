import { ApiQueryProvider } from "@/lib/api/query-provider";

/** Rep area (/rep): Query client only — never mounts the anonymous employee session. */
export default function RepLayout({ children }: LayoutProps<"/rep">) {
  return <ApiQueryProvider>{children}</ApiQueryProvider>;
}
