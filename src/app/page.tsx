import { getData } from "@/server/store";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getData();
  return <AppShell data={data} />;
}
