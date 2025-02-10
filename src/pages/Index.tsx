
import { useState } from "react";
import { SearchVenue } from "@/components/SearchVenue";
import { VenueImageGrid } from "@/components/VenueImageGrid";
import { VenueBatchUpload } from "@/components/VenueBatchUpload";
import { VenueImportResults } from "@/components/VenueImportResults";
import { PastSearches } from "@/components/PastSearches";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { VenueImage } from "@/types/venue";
import { ExternalLink, Phone, Mail, Check } from "lucide-react";

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

      console.log('Search response:', data); // Add logging to see the full response

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
        console.log('Hotel details:', data.hotelDetails); // Add logging for hotel details
        console.log('Amenities:', data.hotelDetails.amenities); // Specifically log amenities
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
