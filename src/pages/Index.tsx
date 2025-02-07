
import { useState } from "react";
import { SearchVenue } from "@/components/SearchVenue";
import { VenueImageGrid } from "@/components/VenueImageGrid";
import { useToast } from "@/components/ui/use-toast";

// Temporary mock data until we integrate with real API
const mockImages = Array.from({ length: 15 }, (_, i) => ({
  id: `img-${i}`,
  url: `https://source.unsplash.com/random/800x600?wedding,venue&sig=${i}`,
  alt: `Wedding Venue ${i + 1}`,
}));

const Index = () => {
  const [images, setImages] = useState(mockImages);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    try {
      // TODO: Integrate with real search API
      // For now, we'll just use the mock data with a delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setImages(mockImages);
      
      toast({
        title: "Search completed",
        description: `Found ${mockImages.length} images for "${query}"`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to search for venue images",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen py-8 px-4">
      <div className="search-container">
        <SearchVenue onSearch={handleSearch} />
      </div>
      
      <VenueImageGrid images={images} isLoading={isLoading} />
    </main>
  );
};

export default Index;
