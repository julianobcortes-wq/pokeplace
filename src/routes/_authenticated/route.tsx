import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isSupabaseConfigured } from "@/lib/runtime-config";
import { isDemoMode } from "@/lib/demo-mode";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (isDemoMode() && !isSupabaseConfigured()) return;
    if (!isSupabaseConfigured()) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: location.href } });
  },
  component: () => <Outlet />,
});
