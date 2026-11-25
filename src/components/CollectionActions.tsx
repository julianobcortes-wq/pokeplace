import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Layers } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';

export function CollectionActions({ cardId }: { cardId: string }) {
  const { user } = useAuth(); const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['collection-card', user?.id, cardId], enabled: !!user, queryFn: async () => { const { data, error } = await supabase.from('collection_entries').select('*').eq('card_id', cardId); if (error) throw error; return data ?? []; } });
  const toggle = async (kind: 'owned' | 'wanted') => {
    if (!user) return;
    const row = data.find(r => r.kind === kind);
    const { error } = row ? await supabase.from('collection_entries').delete().eq('id', row.id) : await supabase.from('collection_entries').insert({ user_id: user.id, card_id: cardId, kind });
    if (error) toast.error('Não foi possível salvar'); else { await qc.invalidateQueries({ queryKey: ['collection-card'] }); await qc.invalidateQueries({ queryKey: ['collection'] }); }
  };
  return <div className="mt-5 flex flex-wrap gap-2">{user ? <>{(['owned', 'wanted'] as const).map(kind => <Button key={kind} variant="outline" onClick={() => toggle(kind)}>{kind === 'owned' ? <Layers className="h-4 w-4" /> : <Heart className="h-4 w-4" />}{kind === 'owned' ? data.some(r => r.kind === kind) ? 'Na minha coleção' : 'Tenho esta carta' : data.some(r => r.kind === kind) ? 'Na lista de desejos' : 'Quero esta carta'}</Button>)}</> : <Link to="/auth" search={{ next: `/carta/${cardId}` }} className="text-sm underline">Entre para salvar esta carta</Link>}</div>;
}