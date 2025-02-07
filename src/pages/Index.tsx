
import { useState } from "react";
import { SearchVenue } from "@/components/SearchVenue";
import { VenueImageGrid } from "@/components/VenueImageGrid";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { VenueImage } from "@/types/venue";

const Index = () => {
  const [images, setImages] = useState<VenueImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    try {
      // First, create a new search record
      const { data: searchData, error: searchError } = await supabase
        .from('venue_searches')
        .insert([{ venue_name: query }])
        .select()
        .single();

      if (searchError) throw searchError;

      // Then fetch all images associated with this search
      const { data: imagesData, error: imagesError } = await supabase
        .from('venue_images')
        .select('*')
        .eq('search_id', searchData.id);

      if (imagesError) throw imagesError;

      // For now, since we don't have real images yet, we'll insert some mock data
      // TODO: Replace this with real image search API integration
      const mockImages = Array.from({ length: 6 }, async (_, i) => {
        const imageUrl = `https://source.unsplash.com/800x600/?wedding,venue&${i}`;
        const altText = `Wedding Venue ${i + 1} for ${query}`;

        const { data: imageData, error: imageError } = await supabase
          .from('venue_images')
          .insert([{
            search_id: searchData.id,
            image_url: imageUrl,
            alt_text: altText
          }])
          .select()
          .single();

        if (imageError) throw imageError;
        return {
          id: imageData.id,
          url: imageData.image_url,
          alt: imageData.alt_text
        };
      });

      const savedImages = await Promise.all(mockImages);
      setImages(savedImages);
      
      toast({
        title: "Search completed",
        description: `Found ${savedImages.length} images for "${query}"`,
      });
    } catch (error) {
      console.error('Search error:', error);
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
      <div className="max-w-3xl mx-auto">
        <SearchVenue onSearch={handleSearch} />
      </div>
      
      <VenueImageGrid images={images} isLoading={isLoading} />
    </main>
  );
};

export default Index;
