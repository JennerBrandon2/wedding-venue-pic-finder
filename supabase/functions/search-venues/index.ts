import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const apiKey = Deno.env.get('SERPAPI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!apiKey) throw new Error('SERPAPI_API_KEY is required');
if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase credentials required');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface HotelDetails {
  description: string;
  room_count: number | null;
  hotel_id: string | null;
  website: string;
  address: string;
  contact_details: Record<string, any>;
  amenities: string[];
}

async function fetchHotelData(venueName: string): Promise<any> {
  console.log('Fetching hotel data for:', venueName);
  
  // Get tomorrow's date for check_in_date parameter
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const checkInDate = tomorrow.toISOString().split('T')[0]; // Format: YYYY-MM-DD
  
  // Get date 3 days after for check_out_date
  const checkOutDate = new Date(tomorrow);
  checkOutDate.setDate(checkOutDate.getDate() + 3);
  const checkOutDateStr = checkOutDate.toISOString().split('T')[0];
  
  // Properly format and encode the search query
  const searchQuery = `${venueName} hotel`;
  const encodedQuery = encodeURIComponent(searchQuery);
  
  const queryParams = new URLSearchParams({
    engine: 'google_hotels',
    q: searchQuery,
    api_key: apiKey,
    check_in_date: checkInDate,
    check_out_date: checkOutDateStr,
    adults: '2', // Default value
    currency: 'USD'
  });
  
  const url = `https://serpapi.com/search.json?${queryParams.toString()}`;
  
  console.log('Fetching from URL:', url.replace(apiKey, 'REDACTED'));
  console.log('Search parameters:', {
    checkInDate,
    checkOutDate: checkOutDateStr,
    query: searchQuery
  });
  
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hotel API error details:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Hotel API error: ${response.status} ${response.statusText}\nDetails: ${errorText}`);
    }

    const data = await response.json();
    console.log('Hotel API response received:', {
      hasProperties: !!data.properties,
      propertyCount: data.properties?.length || 0
    });
    return data;
  } catch (error) {
    console.error('Error in fetchHotelData:', error);
    throw error;
  }
}

async function fetchVenueImages(venueName: string): Promise<any> {
  console.log('Fetching images for:', venueName);
  
  // Properly format and encode the search query
  const searchQuery = `${venueName} wedding venue`;
  const encodedQuery = encodeURIComponent(searchQuery);
  const url = `https://serpapi.com/search.json?engine=google_images&q=${encodedQuery}&api_key=${apiKey}&num=15`;
  
  console.log('Fetching from URL:', url.replace(apiKey, 'REDACTED'));
  
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Image API error details:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Image API error: ${response.status} ${response.statusText}\nDetails: ${errorText}`);
    }

    const data = await response.json();
    console.log('Image API response received:', {
      hasResults: !!data.images_results,
      resultCount: data.images_results?.length || 0
    });
    return data;
  } catch (error) {
    console.error('Error in fetchVenueImages:', error);
    throw error;
  }
}

function extractHotelDetails(hotelData: any): HotelDetails {
  console.log('Extracting hotel details from data:', {
    hasProperties: !!hotelData.properties,
    firstProperty: hotelData.properties?.[0] ? 'exists' : 'missing'
  });
  
  const hotelDetails: HotelDetails = {
    description: '',
    room_count: null,
    hotel_id: null,
    website: '',
    address: '',
    contact_details: {},
    amenities: []
  };

  if (hotelData.properties?.[0]) {
    const hotel = hotelData.properties[0];
    
    hotelDetails.description = hotel.description || '';
    hotelDetails.hotel_id = hotel.property_id || null;
    hotelDetails.website = hotel.website || '';
    hotelDetails.address = hotel.address || '';
    
    hotelDetails.contact_details = {
      phone: hotel.phone_number || '',
      reservations: hotel.booking_info?.url || '',
      social_media: {
        facebook: hotel.social_links?.facebook || '',
        twitter: hotel.social_links?.twitter || '',
        instagram: hotel.social_links?.instagram || ''
      }
    };

    if (hotel.amenities_list && Array.isArray(hotel.amenities_list)) {
      hotelDetails.amenities = hotel.amenities_list.map((amenity: any) => 
        typeof amenity === 'string' ? amenity : amenity.name || amenity.toString()
      );
    }

    if (hotel.rooms_data?.total_rooms) {
      hotelDetails.room_count = parseInt(hotel.rooms_data.total_rooms);
    }
    
    console.log('Extracted hotel details:', {
      hasDescription: !!hotelDetails.description,
      hasWebsite: !!hotelDetails.website,
      hasAddress: !!hotelDetails.address,
      amenityCount: hotelDetails.amenities.length
    });
  }

  return hotelDetails;
}

async function saveSearchRecord(venueName: string, hotelDetails: HotelDetails, hotelData: any) {
  console.log('Saving search record');
  const { data, error } = await supabase
    .from('venue_searches')
    .insert([{
      venue_name: venueName,
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

  if (error) {
    console.error('Error saving search record:', error);
    throw error;
  }

  return data;
}

async function saveVenueImages(searchId: string, imagesData: any) {
  console.log('Saving venue images');
  if (!imagesData.images_results || !Array.isArray(imagesData.images_results)) {
    console.warn('No images found in API response');
    return [];
  }

  const images = imagesData.images_results.slice(0, 15).map((img: any) => ({
    image_url: img.original || img.thumbnail,
    alt_text: img.title || `Wedding venue image`
  }));

  for (const imageResult of images) {
    const { error } = await supabase
      .from('venue_images')
      .insert([{
        search_id: searchId,
        image_url: imageResult.image_url,
        alt_text: imageResult.alt_text
      }]);

    if (error) {
      console.error('Error saving image:', error);
    }
  }

  return images;
}

async function updateImportStatus(importId: string | undefined, venueItemId: string | undefined, status: string, errorMessage?: string, searchId?: string) {
  if (importId && venueItemId) {
    console.log(`Updating import status to ${status}`);
    await supabase
      .from('venue_import_items')
      .update({ 
        status,
        error_message: errorMessage,
        search_id: searchId
      })
      .eq('id', venueItemId);

    if (status === 'completed' || status === 'error') {
      await processNextVenue(importId);
    }
  }
}

async function processNextVenue(importId: string) {
  console.log('Processing next venue for import:', importId);
  const { data: nextVenue } = await supabase
    .from('venue_import_items')
    .select()
    .eq('import_id', importId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (nextVenue) {
    console.log('Found next venue to process:', nextVenue.venue_name);
    await supabase.functions.invoke('search-venues', {
      body: { 
        venue_name: nextVenue.venue_name,
        import_id: importId,
        venue_item_id: nextVenue.id
      }
    });
  } else {
    console.log('No more venues to process, marking import as completed');
    await supabase
      .from('venue_csv_imports')
      .update({ status: 'completed' })
      .eq('id', importId);
  }
}

Deno.serve(async (req) => {
  console.log('Received request:', req.method, req.url);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => {
      console.error('Failed to parse request body');
      throw new Error('Invalid JSON in request body');
    });
    
    console.log('Request body:', body);

    if (!body?.venue_name) {
      console.error('Missing venue_name in request');
      throw new Error('venue_name is required');
    }

    const { venue_name, import_id, venue_item_id } = body;

    // Update status to processing if this is part of a batch import
    await updateImportStatus(import_id, venue_item_id, 'processing');

    // Fetch hotel data
    console.log('Starting venue search process for:', venue_name);
    const hotelData = await fetchHotelData(venue_name);
    const hotelDetails = extractHotelDetails(hotelData);

    // Save search record
    console.log('Saving search record for:', venue_name);
    const searchRecord = await saveSearchRecord(venue_name, hotelDetails, hotelData);

    // Fetch and save images
    console.log('Fetching and saving images for:', venue_name);
    const imagesData = await fetchVenueImages(venue_name);
    const images = await saveVenueImages(searchRecord.id, imagesData);

    // Update import status if this is part of a batch
    await updateImportStatus(import_id, venue_item_id, 'completed', undefined, searchRecord.id);

    console.log('Successfully completed venue search for:', venue_name);

    return new Response(
      JSON.stringify({ 
        success: true,
        images, 
        hotelDetails,
        message: 'Venue search completed successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Search venues error:', {
      message: error.message,
      stack: error.stack,
      cause: error.cause
    });
    
    let body;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // Update import status if this is part of a batch
    await updateImportStatus(body.import_id, body.venue_item_id, 'error', error.message);

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        details: error.stack
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
