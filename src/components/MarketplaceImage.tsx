import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function MarketplaceImage({ src, alt = '', className = '' }: { src: string; alt?: string; className?: string }) {
  const privatePath = !src.startsWith('https://');
  const { data } = useQuery({ queryKey: ['media', src], enabled: privatePath, staleTime: 1800000, queryFn: async () => { const { data, error } = await supabase.storage.from('marketplace-media').createSignedUrl(src, 3600); if (error) throw error; return data.signedUrl; } });
  const url = privatePath ? data : src;
  return url ? <img src={url} alt={alt} className={className} /> : <span className={`${className} inline-block bg-muted`} aria-label="Imagem carregando" />;
}