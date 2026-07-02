import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"signin" | "request">("signin");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/admin", { replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo!");
        navigate("/admin", { replace: true });
      } else {
        const { error } = await supabase.from("admin_access_requests").insert({
          email: email.trim().toLowerCase(),
          name: name.trim(),
          phone: phone.trim() || null,
          message: message.trim() || null,
        });
        if (error) throw error;
        toast.success("Solicitação enviada! Um administrador irá avaliar seu pedido.");
        setMode("signin");
        setName(""); setPhone(""); setMessage("");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4" style={{ background: "var(--gradient-hero)" }}>
      <Card className="w-full max-w-md">
        <CardContent className="p-8 space-y-5">
          <div className="text-center space-y-2">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Printer className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold">Painel NovaPrint</h1>
            <p className="text-sm text-muted-foreground">
              {mode === "signin" ? "Acesso restrito à equipe" : "Solicitar acesso administrativo"}
            </p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            {mode === "request" && (
              <>
                <div>
                  <Label htmlFor="name">Nome completo</Label>
                  <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {mode === "signin" && (
              <div>
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            {mode === "request" && (
              <div>
                <Label htmlFor="message">Motivo da solicitação</Label>
                <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
              </div>
            )}
            <Button className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "signin" ? "Entrar" : "Enviar solicitação"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "request" : "signin")}
            className="text-sm text-primary hover:underline w-full text-center"
          >
            {mode === "signin" ? "Solicitar acesso admin" : "Já tenho acesso — entrar"}
          </button>
          <Link to="/" className="text-xs text-muted-foreground hover:text-primary w-full text-center block">
            ← Voltar ao portal
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
