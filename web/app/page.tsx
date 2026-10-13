import { ApiStatus } from "@/components/api-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">יועץ הרכב של שטראוס</CardTitle>
          <CardDescription>
            מה יקרה לנטו שלי אם אעבור לרכב חשמלי, אקח רכב אחר או אוותר על הרכב?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiStatus />
        </CardContent>
      </Card>
    </main>
  );
}
