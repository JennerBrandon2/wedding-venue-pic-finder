
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

      // Call our Edge Function using Supabase's function invocation
      const { data, error: functionError } = await supabase.functions.invoke('search-venues', {
        body: { venue_name: query }
      });

      if (functionError) throw functionError;

      const { image_url, alt_text } = data;

      // Save the generated image to our database
      const { data: imageData, error: imageError } = await supabase
        .from('venue_images')
        .insert([{
          search_id: searchData.id,
          image_url,
          alt_text
        }])
        .select()
        .single();

      if (imageError) throw imageError;

      setImages([{
        id: imageData.id,
        url: imageData.image_url,
        alt: imageData.alt_text
      }]);
      
      toast({
        title: "Search completed",
        description: `Generated a beautiful image for "${query}"`,
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
