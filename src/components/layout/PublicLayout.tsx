import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { ShoppingCart, Search, Menu, X, LogIn, LogOut, User, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCart } from "@/store/cart";
import { usePriceVisibility } from "@/store/priceVisibility";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/novaprint-logo.png.asset.json";

export default function PublicLayout() {
  const count = useCart((s) => s.count());
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const showPrices = usePriceVisibility((s) => s.showPrices);
  const togglePrices = usePriceVisibility((s) => s.toggle);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    supabase.auth.getSession().then(({ data }) => setUserEmail(data.session?.user?.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate("/");
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/catalogo${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    setOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container-page flex h-16 items-center gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="NovaPrint - Início">
            <img src={logo.url} alt="NovaPrint Brasil" className="h-10 w-auto" />
          </Link>

          <form onSubmit={submitSearch} className="hidden md:flex flex-1 max-w-xl relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar produtos, códigos ou marcas..."
              className="pl-9"
            />
          </form>

          <nav className="hidden md:flex items-center gap-1 ml-auto">
            <NavLink to="/" end className={({ isActive }) => `px-3 py-2 text-sm rounded-md hover:bg-accent ${isActive ? "text-primary font-medium" : "text-foreground/80"}`}>
              Início
            </NavLink>
            <NavLink to="/catalogo" className={({ isActive }) => `px-3 py-2 text-sm rounded-md hover:bg-accent ${isActive ? "text-primary font-medium" : "text-foreground/80"}`}>
              Catálogo
            </NavLink>
          </nav>

          {userEmail ? (
            <div className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="max-w-[160px] truncate">{userEmail}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout} title="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button asChild variant="ghost" size="sm" className="ml-auto md:ml-0">
              <Link to="/login">
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Entrar</span>
              </Link>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={togglePrices}
            title={showPrices ? "Ocultar preços" : "Mostrar preços"}
            className="hidden md:flex"
          >
            {showPrices ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden lg:inline ml-2">{showPrices ? "Ocultar preços" : "Mostrar preços"}</span>
          </Button>

          <Button asChild variant="default" className="relative">
            <Link to="/carrinho">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">Carrinho</span>
              {count > 0 && (
                <span className="absolute -top-2 -right-2 grid h-5 min-w-5 place-items-center rounded-full bg-accent-brand px-1 text-xs font-bold text-accent-brand-foreground">
                  {count}
                </span>
              )}
            </Link>
          </Button>

          <button className="md:hidden p-2" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="md:hidden border-t bg-card">
            <div className="container-page py-3 space-y-3">
              <form onSubmit={submitSearch} className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar..." className="pl-9" />
              </form>
              <div className="flex gap-2">
                <Button asChild variant="ghost" className="flex-1"><Link to="/" onClick={() => setOpen(false)}>Início</Link></Button>
                <Button asChild variant="ghost" className="flex-1"><Link to="/catalogo" onClick={() => setOpen(false)}>Catálogo</Link></Button>
              </div>
              <Button variant="outline" className="w-full" onClick={() => { togglePrices(); setOpen(false); }}>
                {showPrices ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                {showPrices ? "Ocultar preços" : "Mostrar preços"}
              </Button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t bg-card mt-12">
        <div className="container-page py-8 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between text-sm text-muted-foreground">
          <img src={logo.url} alt="NovaPrint Brasil" className="h-9 w-auto" />
          <p>© {new Date().getFullYear()} NovaPrint — Portal de Pedidos</p>
          <Link to="/admin" className="hover:text-primary">Área administrativa</Link>
        </div>
      </footer>
    </div>
  );
}
