import { useEffect, useState } from "react";
import { Navigate, Outlet, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, LayoutDashboard, Package, Tags, ShoppingBag, FileText, LogOut, Printer, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Session } from "@supabase/supabase-js";

export default function AdminLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!session) { setIsAdmin(false); setLoading(false); return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!cancelled) {
        setIsAdmin(!!data);
        setLoading(false);
      }
    };
    setLoading(true);
    check();
    return () => { cancelled = true; };
  }, [session]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!session) return <Navigate to="/admin/login" replace state={{ from: location }} />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-bold mb-2">Acesso negado</h1>
          <p className="text-muted-foreground mb-4">Sua conta não possui permissão de administrador.</p>
          <Button onClick={() => supabase.auth.signOut()}>Sair</Button>
        </div>
      </div>
    );
  }

  const nav = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/admin/produtos", label: "Produtos", icon: Package },
    { to: "/admin/categorias", label: "Categorias", icon: Tags },
    { to: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag },
    { to: "/admin/logs", label: "Logs", icon: FileText },
    { to: "/admin/importar-imagens", label: "Importar imagens", icon: Images },
  ];

  return (
    <div className="min-h-screen bg-muted/30 grid md:grid-cols-[240px_1fr]">
      <aside className="border-r bg-card md:min-h-screen">
        <div className="p-4 border-b flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground"><Printer className="h-4 w-4" /></span>
          <div>
            <div className="font-bold text-sm">NovaPrint</div>
            <div className="text-xs text-muted-foreground">Painel admin</div>
          </div>
        </div>
        <nav className="p-2 space-y-1">
          {nav.map((n) => {
            const active = n.end ? location.pathname === n.to : location.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t mt-2">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => supabase.auth.signOut()}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
          <Button asChild variant="ghost" size="sm" className="w-full justify-start mt-1">
            <Link to="/">Ver portal</Link>
          </Button>
        </div>
      </aside>
      <main className="p-4 md:p-8 max-w-6xl w-full"><Outlet /></main>
    </div>
  );
}
