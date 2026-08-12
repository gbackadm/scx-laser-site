import { AdminShell } from "@/components/admin/AdminShell";
import { getCurrentAdminSession } from "@/domain/auth/session";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentAdminSession();

  if (!session) return children;

  return <AdminShell session={session}>{children}</AdminShell>;
}
