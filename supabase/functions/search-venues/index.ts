import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const apiKey = Deno.env.get('SERPAPI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!apiKey) throw new Error('SERPAPI_API_KEY is required');
if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase credentials required');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { venue_name, import_id, venue_item_id } = await req.json();
    
    // Update status to processing if this is part of a batch import
    if (import_id && venue_item_id) {
      await supabase
        .from('venue_import_items')
        .update({ status: 'processing' })
        .eq('id', venue_item_id);
    }

    // First, search for hotel details using the hotels endpoint
    const hotelSearchQuery = `${venue_name}`;
    const hotelResponse = await fetch(`https://serpapi.com/search.json?engine=google_hotels&q=${encodeURIComponent(hotelSearchQuery)}&api_key=${apiKey}`);
    
    if (!hotelResponse.ok) {
      throw new Error('Failed to fetch hotel details from SerpAPI');
    }

    const hotelData = await hotelResponse.json();
    console.log('Hotel API response:', hotelData);
    
    // Extract hotel details from the search results
    const hotelDetails = {
      description: '',
      room_count: null,
      hotel_id: null,
      website: '',
      address: '',
      contact_details: {},
      amenities: [] as string[]
    };

    if (hotelData.properties && hotelData.properties.length > 0) {
      const hotel = hotelData.properties[0];
      
      hotelDetails.description = hotel.description || '';
      hotelDetails.hotel_id = hotel.property_id || null;
      hotelDetails.website = hotel.website || '';
      hotelDetails.address = hotel.address || '';
      
      // Extract contact details
      hotelDetails.contact_details = {
        phone: hotel.phone_number || '',
        reservations: hotel.booking_info?.url || '',
        social_media: {
          facebook: hotel.social_links?.facebook || '',
          twitter: hotel.social_links?.twitter || '',
          instagram: hotel.social_links?.instagram || ''
        }
      };

      // Extract amenities directly from the hotel data
      if (hotel.amenities && Array.isArray(hotel.amenities)) {
        hotelDetails.amenities = hotel.amenities.map((amenity: any) => 
          typeof amenity === 'string' ? amenity : amenity.name || amenity.toString()
        );
      }

      // If room count is available
      if (hotel.rooms_data && hotel.rooms_data.total_rooms) {
        hotelDetails.room_count = parseInt(hotel.rooms_data.total_rooms);
      }
    }
    
    // Create search record with hotel details
    const { data: searchData, error: searchError } = await supabase
      .from('venue_searches')
      .insert([{ 
        venue_name,
        description: hotelDetails.description,
        room_count: hotelDetails.room_count,
        hotel_id: hotelDetails.hotel_id,
        hotel_details: hotelData.properties?.[0] || {},
        website: hotelDetails.website,
        address: hotelDetails.address,
        contact_details: hotelDetails.contact_details,
        amenities: hotelDetails.amenities
      }])
      .select()
      .single();

    if (searchError) throw searchError;

    // Call SerpAPI to search for venue images
    const searchQuery = `${venue_name} wedding venue`;
    const response = await fetch(`https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(searchQuery)}&api_key=${apiKey}&num=15`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch images from SerpAPI');
    }

    const data = await response.json();

    if (!data.images_results || !Array.isArray(data.images_results)) {
      console.error('No images found or invalid response format:', data);
      
      if (import_id && venue_item_id) {
        await supabase
          .from('venue_import_items')
          .update({ 
            status: 'error',
            error_message: 'No images found',
            search_id: searchData.id
          })
          .eq('id', venue_item_id);

        // Process next venue
        await processNextVenue(import_id);
      }

      return new Response(JSON.stringify({ images: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Get the first 15 image results
    const images = data.images_results.slice(0, 15).map((img: any) => ({
      image_url: img.original || img.thumbnail,
      alt_text: img.title || `Wedding venue ${venue_name}`
    }));

    // Save images
    for (const imageResult of images) {
      await supabase
        .from('venue_images')
        .insert([{
          search_id: searchData.id,
          image_url: imageResult.image_url,
          alt_text: imageResult.alt_text
        }]);
    }

    // If this is part of a batch import, update status and process next venue
    if (import_id && venue_item_id) {
      await supabase
        .from('venue_import_items')
        .update({ 
          status: 'completed',
          search_id: searchData.id
        })
        .eq('id', venue_item_id);

      // Process next venue
      await processNextVenue(import_id);
    }

    return new Response(JSON.stringify({ 
      images,
      hotelDetails: {
        description: hotelDetails.description,
        room_count: hotelDetails.room_count,
        hotel_id: hotelDetails.hotel_id,
        website: hotelDetails.website,
        address: hotelDetails.address,
        contact_details: hotelDetails.contact_details,
        amenities: hotelDetails.amenities
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Search venues error:', error);

    // If this is part of a batch import, update error status and process next venue
    const { import_id, venue_item_id } = await req.json();
    if (import_id && venue_item_id) {
      await supabase
        .from('venue_import_items')
        .update({ 
          status: 'error',
          error_message: error.message
        })
        .eq('id', venue_item_id);

      // Process next venue
      await processNextVenue(import_id);
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processNextVenue(importId: string) {
  // Find next pending venue
  const { data: nextVenue } = await supabase
    .from('venue_import_items')
    .select()
    .eq('import_id', importId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (nextVenue) {
    // Process next venue
    await supabase.functions.invoke('search-venues', {
      body: { 
        venue_name: nextVenue.venue_name,
        import_id: importId,
        venue_item_id: nextVenue.id
      }
    });
  } else {
    // All venues processed, update import status
    await supabase
      .from('venue_csv_imports')
      .update({ status: 'completed' })
      .eq('id', importId);
  }
}
