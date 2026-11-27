import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { photoSlotLabel } from "@/lib/marketplace/grading";
import { MarketplaceImage } from "./MarketplaceImage";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

export function ListingPhotos({ paths, store }: { paths: string[]; store: string }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  if (!paths.length) return null;

  const selectedPath = selectedIndex !== null ? paths[selectedIndex] : null;
  const selectedLabel = selectedIndex !== null ? photoSlotLabel(selectedIndex) : "";

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {paths.map((path, index) => {
          const slotLabel = photoSlotLabel(index);
          return (
            <Button
              key={`${path}-${index}`}
              variant="ghost"
              className="group relative h-24 w-20 overflow-hidden rounded-md p-0"
              aria-label={`Ampliar foto (${slotLabel}) de ${store}`}
              onClick={() => setSelectedIndex(index)}
            >
              <MarketplaceImage
                src={path}
                alt={`Foto ${slotLabel.toLowerCase()} da carta de ${store}`}
                className="h-24 w-20 rounded-md object-contain"
              />
              <span className="absolute inset-x-0 bottom-0 bg-ink/75 px-1 py-0.5 text-[10px] font-medium text-ink-foreground">
                {slotLabel}
              </span>
            </Button>
          );
        })}
      </div>
      <Dialog
        open={selectedIndex !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedIndex(null);
        }}
      >
        <DialogContent aria-describedby={undefined} className="max-w-2xl">
          <DialogTitle>
            Foto real ({selectedLabel}) · {store}
            {selectedIndex !== null && paths.length > 1
              ? ` · ${selectedIndex + 1}/${paths.length}`
              : ""}
          </DialogTitle>
          {selectedPath && (
            <div className="relative">
              <MarketplaceImage
                src={selectedPath}
                alt={`Foto ampliada (${selectedLabel}) da carta de ${store}`}
                className="max-h-[70vh] w-full rounded-lg object-contain"
              />
              {paths.length > 1 && selectedIndex !== null && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelectedIndex((selectedIndex - 1 + paths.length) % paths.length)
                    }
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
                  </Button>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {paths.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedIndex(idx)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          idx === selectedIndex
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {photoSlotLabel(idx)}
                      </button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedIndex((selectedIndex + 1) % paths.length)}
                  >
                    Próxima <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
