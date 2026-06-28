import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Printer, ShoppingCart, Search, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCart } from "@/store/cart";
import { useState } from "react";

export default function PublicLayout() {
  const count = useCart((s) => s.count());
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/catalogo${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    setOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container-page flex h-16 items-center gap-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Printer className="h-5 w-5" />
            </span>
            <span className="text-primary">NovaPrint</span>
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

          <Button asChild variant="default" className="relative ml-auto md:ml-0">
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
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t bg-card mt-12">
        <div className="container-page py-8 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded bg-primary text-primary-foreground">
              <Printer className="h-4 w-4" />
            </span>
            <span className="font-semibold text-foreground">NovaPrint</span>
          </div>
          <p>© {new Date().getFullYear()} NovaPrint — Portal de Pedidos</p>
          <Link to="/admin" className="hover:text-primary">Área administrativa</Link>
        </div>
      </footer>
    </div>
  );
}
