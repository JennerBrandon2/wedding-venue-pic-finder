
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface VenueImage {
  id: string;
  url: string;
  alt: string;
}

interface Props {
  images: VenueImage[];
  isLoading?: boolean;
}

export function VenueImageGrid({ images, isLoading }: Props) {
  const [selectedImage, setSelectedImage] = useState<VenueImage | null>(null);

  if (isLoading) {
    return (
      <div className="image-grid animate-fade-in">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="loading-skeleton aspect-[3/2]" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="image-grid animate-fade-in">
        {images.map((image) => (
          <div
            key={image.id}
            className="image-card cursor-pointer"
            onClick={() => setSelectedImage(image)}
          >
            <img
              src={image.url}
              alt={image.alt}
              className="transition-transform duration-300 hover:scale-105"
              loading="lazy"
            />
          </div>
        ))}
      </div>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl">
          {selectedImage && (
            <img
              src={selectedImage.url}
              alt={selectedImage.alt}
              className="w-full h-auto rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
