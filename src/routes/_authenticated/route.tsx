import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isSupabaseConfigured } from "@/lib/runtime-config";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (!isSupabaseConfigured()) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: location.href } });
  },
  component: () => <Outlet />,
});
