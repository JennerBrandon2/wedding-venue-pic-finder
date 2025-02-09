
import { useState } from "react";
import { SearchVenue } from "@/components/SearchVenue";
import { VenueImageGrid } from "@/components/VenueImageGrid";
import { VenueBatchUpload } from "@/components/VenueBatchUpload";
import { VenueImportResults } from "@/components/VenueImportResults";
import { PastSearches } from "@/components/PastSearches";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { VenueImage } from "@/types/venue";

interface HotelDetails {
  description: string;
  room_count: number | null;
  hotel_id: string | null;
}

const Index = () => {
  const [images, setImages] = useState<VenueImage[]>([]);
  const [hotelDetails, setHotelDetails] = useState<HotelDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setHotelDetails(null);
    try {
      // Call our Edge Function using Supabase's function invocation
      const { data, error: functionError } = await supabase.functions.invoke('search-venues', {
        body: { venue_name: query }
      });

      if (functionError) throw functionError;

      if (!data?.images || !Array.isArray(data.images)) {
        toast({
          title: "No images found",
          description: `Couldn't find any images for "${query}"`,
          variant: "destructive",
        });
        setImages([]);
        return;
      }

      // Format images for display
      const newImages: VenueImage[] = data.images.map((img: any) => ({
        id: crypto.randomUUID(),
        url: img.image_url,
        alt: img.alt_text
      }));

      setImages(newImages);
      
      // Set hotel details if available
      if (data.hotelDetails) {
        setHotelDetails(data.hotelDetails);
      }
      
      toast({
        title: "Search completed",
        description: `Found ${newImages.length} beautiful images for "${query}"`,
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
        
        {hotelDetails && (
          <div className="mt-8 p-6 bg-white rounded-lg shadow-sm border">
            <h3 className="text-xl font-semibold mb-4">Venue Details</h3>
            {hotelDetails.description && (
              <p className="text-gray-700 mb-4">{hotelDetails.description}</p>
            )}
            {hotelDetails.room_count && (
              <p className="text-sm text-gray-600">
                Number of rooms: {hotelDetails.room_count}
              </p>
            )}
          </div>
        )}
      </div>
      
      <VenueImageGrid images={images} isLoading={isLoading} />
      
      <PastSearches />
      
      <div className="border-t mt-12 pt-8">
        <h2 className="text-3xl font-serif font-semibold text-center mb-6">
          Batch Process Venues
        </h2>
        <VenueBatchUpload />
        <VenueImportResults />
      </div>
    </main>
  );
};

export default Index;
