
import { useState } from "react";
import { SearchVenue } from "@/components/SearchVenue";
import { VenueImageGrid } from "@/components/VenueImageGrid";
import { VenueBatchUpload } from "@/components/VenueBatchUpload";
import { VenueImportResults } from "@/components/VenueImportResults";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { VenueImage } from "@/types/venue";
import { ExternalLink, Phone, Mail, Check, AlertCircle } from "lucide-react";
import { useSearch } from "@/contexts/SearchContext";

interface HotelDetails {
  description: string;
  room_count: number | null;
  hotel_id: string | null;
  website: string;
  address: string;
  amenities: string[];
  contact_details: {
    phone?: string;
    reservations?: string;
    social_media?: {
      facebook?: string;
      twitter?: string;
      instagram?: string;
    };
  };
}

const Index = () => {
  const [images, setImages] = useState<VenueImage[]>([]);
  const [hotelDetails, setHotelDetails] = useState<HotelDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const { toast } = useToast();
  const { searchType } = useSearch();

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setHotelDetails(null);
    setImages([]);
    setSearchError(null);
    
    console.log(`Starting search for: "${query}" with type: ${searchType}`);
    
    try {
      // Debug the request body to ensure it's properly formatted
      const requestBody = { 
        venue_name: query,
        search_type: searchType 
      };
      
      console.log('Request body:', requestBody);
      
      const { data, error: functionError } = await supabase.functions.invoke('search-venues', {
        body: requestBody
      });

      if (functionError) {
        console.error('Function error:', functionError);
        setSearchError(`Search failed: ${functionError.message || "Unknown error"}`);
        throw functionError;
      }

      console.log('Search response:', data);
      
      if (!data?.images || !Array.isArray(data.images)) {
        console.error('No images found in response:', data);
        setSearchError(`No images found for "${query}"`);
        toast({
          title: "No images found",
          description: `Couldn't find any images for "${query}"`,
          variant: "destructive",
        });
        return;
      }

      // Format images for display
      const newImages: VenueImage[] = data.images.map((img: any) => ({
        id: img.id || crypto.randomUUID(),
        url: img.url || img.image_url,
        alt: img.alt || img.alt_text
      }));

      console.log(`Processed ${newImages.length} images`);
      setImages(newImages);
      
      // Set hotel details if available
      if (data.hotelDetails) {
        console.log('Hotel details:', data.hotelDetails);
        setHotelDetails(data.hotelDetails);
      }
      
      toast({
        title: "Search completed",
        description: `Found ${newImages.length} beautiful images for "${query}"`,
      });
    } catch (error) {
      console.error('Search error:', error);
      setSearchError(`Search failed: ${error.message || "Unknown error"}`);
      toast({
        title: "Error",
        description: "Failed to search for venue images. Please try again.",
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
        
        {searchError && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-red-800">Search Error</h3>
              <p className="text-sm text-red-700">{searchError}</p>
              <p className="text-sm text-red-600 mt-2">
                Please try again with a different search term or contact support if the issue persists.
              </p>
            </div>
          </div>
        )}
        
        {hotelDetails && (
          <div className="mt-8 p-6 bg-white rounded-lg shadow-sm border space-y-4">
            <h3 className="text-xl font-semibold mb-4">Venue Details</h3>
            
            {hotelDetails.description && (
              <p className="text-gray-700 mb-4">{hotelDetails.description}</p>
            )}
            
            {hotelDetails.room_count !== null && (
              <p className="text-sm text-gray-600">
                Number of rooms: {hotelDetails.room_count}
              </p>
            )}

            {hotelDetails.website && (
              <div className="flex items-center gap-2 text-sm">
                <ExternalLink className="h-4 w-4" />
                <a 
                  href={hotelDetails.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Visit Website
                </a>
              </div>
            )}

            {hotelDetails.address && (
              <div className="text-sm text-gray-600">
                <strong>Address:</strong> {hotelDetails.address}
              </div>
            )}

            {hotelDetails.contact_details && (
              <div className="space-y-2">
                {hotelDetails.contact_details.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4" />
                    <a 
                      href={`tel:${hotelDetails.contact_details.phone}`}
                      className="text-blue-600 hover:underline"
                    >
                      {hotelDetails.contact_details.phone}
                    </a>
                  </div>
                )}

                {hotelDetails.contact_details.reservations && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4" />
                    <a 
                      href={`mailto:${hotelDetails.contact_details.reservations}`}
                      className="text-blue-600 hover:underline"
                    >
                      {hotelDetails.contact_details.reservations}
                    </a>
                  </div>
                )}

                {hotelDetails.contact_details.social_media && (
                  <div className="flex gap-4 text-sm">
                    {Object.entries(hotelDetails.contact_details.social_media).map(([platform, url]) => {
                      if (!url) return null;
                      return (
                        <a
                          key={platform}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="capitalize text-blue-600 hover:underline"
                        >
                          {platform}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {hotelDetails.amenities && hotelDetails.amenities.length > 0 && (
              <div className="mt-4">
                <h4 className="text-lg font-semibold mb-2">Amenities</h4>
                <ul className="grid grid-cols-2 gap-2">
                  {hotelDetails.amenities.map((amenity, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="h-4 w-4 text-green-500" />
                      {amenity}
                    </li>
                  ))}
                </ul>
              </div>
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
