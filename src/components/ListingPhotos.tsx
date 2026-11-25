import { useState } from 'react';
import { MarketplaceImage } from './MarketplaceImage';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
export function ListingPhotos({ paths, store }: { paths: string[]; store: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <><div className="mt-2 flex flex-wrap gap-2">{paths.map(path => <Button key={path} variant="ghost" className="h-24 w-20 p-0" aria-label={`Ampliar foto de ${store}`} onClick={() => setSelected(path)}><MarketplaceImage src={path} alt={`Foto da carta de ${store}`} className="h-24 w-20 rounded-md object-contain" /></Button>)}</div><Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent aria-describedby={undefined} className="max-w-2xl"><DialogTitle>Foto real · {store}</DialogTitle>{selected && <MarketplaceImage src={selected} alt={`Foto ampliada da carta de ${store}`} className="max-h-[70vh] w-full object-contain" />}</DialogContent></Dialog></>;
}