import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { MarketplaceImage } from './MarketplaceImage';

export function MediaUpload({ sellerId, value, onChange, label }: { sellerId: string; value?: string; onChange: (path: string) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const ext = extensions[file.type];
    if (!ext || file.size > 5 * 1024 * 1024) { toast.error('Escolha JPG, PNG ou WebP de até 5 MB'); return; }
    setBusy(true);
    const path = `${sellerId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('marketplace-media').upload(path, file, { contentType: file.type });
    setBusy(false);
    if (error) toast.error('Não foi possível enviar a imagem. Tente novamente.'); else onChange(path);
    if (input.current) input.current.value = '';
  };
  return <div className="space-y-2"><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label={label} onChange={e => upload(e.target.files?.[0])} />{value && <MarketplaceImage src={value} alt={label} className="h-24 max-w-full rounded-md object-contain" />}<Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="h-4 w-4" />{busy ? 'Enviando…' : label}</Button></div>;
}