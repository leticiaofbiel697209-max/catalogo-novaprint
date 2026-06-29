import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type RowStatus = "pending" | "uploading" | "ok" | "error";
interface Row {
  file: File;
  code: string;
  status: RowStatus;
  message?: string;
}

function stripExt(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

export default function AdminImportImages() {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = (files: FileList | null) => {
    if (!files) return;
    const list: Row[] = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ file: f, code: stripExt(f.name), status: "pending" as RowStatus }));
    setRows(list);
  };

  const run = async () => {
    setRunning(true);
    const updated = [...rows];
    for (let i = 0; i < updated.length; i++) {
      const row = updated[i];
      row.status = "uploading";
      setRows([...updated]);
      try {
        const { data: prod, error: pErr } = await supabase
          .from("products")
          .select("id")
          .eq("code", row.code)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!prod) { row.status = "error"; row.message = "Código não encontrado"; setRows([...updated]); continue; }

        const ext = row.file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `bulk/${prod.id}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("product-images")
          .upload(path, row.file, { contentType: row.file.type, upsert: true });
        if (upErr) throw upErr;

        const { data: signed, error: sErr } = await supabase.storage
          .from("product-images")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
        if (sErr) throw sErr;

        const { error: updErr } = await supabase
          .from("products")
          .update({ image_url: signed.signedUrl })
          .eq("id", prod.id);
        if (updErr) throw updErr;
        row.status = "ok";
      } catch (e: any) {
        row.status = "error";
        row.message = e.message;
      }
      setRows([...updated]);
    }
    setRunning(false);
    const okCount = updated.filter((r) => r.status === "ok").length;
    toast.success(`${okCount} imagens vinculadas`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Importar imagens em massa</h1>
        <p className="text-muted-foreground text-sm">
          Nomeie cada arquivo com o <strong>código do produto</strong> (ex: <code>COMP-HP-CF280A.jpg</code>) e selecione todos de uma vez.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files); }}
            className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:bg-muted/50"
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Clique ou arraste várias imagens aqui
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => onPick(e.target.files)}
            />
          </div>

          {rows.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{rows.length} arquivo(s) selecionado(s)</p>
              <Button onClick={run} disabled={running}>
                {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Vincular aos produtos
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-3 text-sm">
                  <div className="h-10 w-10 rounded bg-muted overflow-hidden flex-shrink-0">
                    <img src={URL.createObjectURL(r.file)} className="h-full w-full object-cover" alt="" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.file.name}</div>
                    <div className="text-xs text-muted-foreground">código: {r.code}</div>
                  </div>
                  {r.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {r.status === "ok" && <CheckCircle2 className="h-4 w-4 text-success" />}
                  {r.status === "error" && (
                    <div className="flex items-center gap-1 text-destructive text-xs">
                      <XCircle className="h-4 w-4" /> {r.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
