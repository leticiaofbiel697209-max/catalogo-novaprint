import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Printer } from "lucide-react";

/**
 * Login do cliente.
 *
 * Hoje autentica via Supabase Auth (e-mail/senha + cadastro).
 * Está preparado para no futuro validar/criar o cliente também na API do
 * GestãoClick — ver função `syncWithGestaoClick` abaixo. Basta criar uma
 * edge function `gestaoclick-auth` e ligar aqui.
 */
export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/");
    });
  }, [navigate]);

  // TODO: integrar com a API do GestãoClick quando o token estiver disponível.
  // async function syncWithGestaoClick(payload: { email: string; name?: string }) {
  //   await supabase.functions.invoke("gestaoclick-auth", { body: payload });
  // }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo!");
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { name },
          },
        });
        if (error) throw error;
        // await syncWithGestaoClick({ email, name });
        toast.success("Cadastro realizado! Você já pode entrar.");
        setMode("signin");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-page py-10 max-w-md">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Printer className="h-6 w-6" />
          </div>
          <CardTitle>{mode === "signin" ? "Entrar" : "Criar conta"}</CardTitle>
          <CardDescription>
            {mode === "signin"
              ? "Acesse para acompanhar seus pedidos"
              : "Cadastre-se para agilizar seus próximos orçamentos"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Cadastrar"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            {mode === "signin" ? (
              <button className="text-primary hover:underline" onClick={() => setMode("signup")}>
                Não tem conta? Cadastre-se
              </button>
            ) : (
              <button className="text-primary hover:underline" onClick={() => setMode("signin")}>
                Já tem conta? Entrar
              </button>
            )}
          </div>
          <div className="mt-4 text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:text-primary">Voltar à loja</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
