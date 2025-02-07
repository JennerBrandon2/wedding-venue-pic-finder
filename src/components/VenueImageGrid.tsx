
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-8 animate-fade-in">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[3/2] bg-gray-200 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-8 animate-fade-in">
        {images.map((image) => (
          <div
            key={image.id}
            className="aspect-[3/2] rounded-lg overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-all duration-300"
            onClick={() => setSelectedImage(image)}
          >
            <img
              src={image.url}
              alt={image.alt}
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
              loading="lazy"
            />
          </div>
        ))}
      </div>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogTitle className="sr-only">
            {selectedImage?.alt || "Venue Image"}
          </DialogTitle>
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
