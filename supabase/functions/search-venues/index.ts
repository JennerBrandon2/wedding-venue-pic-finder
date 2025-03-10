
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

const apiKey = Deno.env.get('SERPAPI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Validate required environment variables
if (!apiKey) {
  console.error('Missing required env var: SERPAPI_API_KEY');
}
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required Supabase credentials');
}

const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '');

Deno.serve(async (req) => {
  // Always handle CORS preflight requests first
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body once at the start
    let requestData;
    try {
      requestData = await req.json();
      console.log('Received request data:', JSON.stringify(requestData));
    } catch (error) {
      console.error('Failed to parse request body:', error);
      throw new Error('Invalid request body: ' + error.message);
    }
    
    const { venue_name, import_id, venue_item_id, search_type = 'venue' } = requestData;
    
    // Debug log for troubleshooting
    console.log(`Search parameters: venue_name=${venue_name}, search_type=${search_type}, import_id=${import_id}, venue_item_id=${venue_item_id}`);
    
    if (!venue_name) {
      console.error('Missing venue_name in request');
      throw new Error('venue_name is required');
    }

    if (!apiKey) {
      throw new Error('SERPAPI_API_KEY is missing. Please configure it in Supabase Dashboard.');
    }
    
    // Update status to processing if this is part of a batch import
    if (import_id && venue_item_id) {
      try {
        const { error: updateError } = await supabase
          .from('venue_import_items')
          .update({ status: 'processing' })
          .eq('id', venue_item_id);

        if (updateError) {
          console.error('Error updating venue item status:', updateError);
          throw updateError;
        }
        console.log(`Updated venue item ${venue_item_id} to processing status`);
      } catch (updateError) {
        console.error('Failed to update venue status to processing:', updateError);
        // Continue with the search even if we couldn't update the status
      }
    }

    const searchSuffix = search_type === 'venue' ? 'wedding venue' : 'logo';
    console.log(`Using search suffix: ${searchSuffix}`);
    
    // First, search for hotel details
    const hotelSearchQuery = `${venue_name} hotel details`;
    console.log(`Searching for hotel details with query: ${hotelSearchQuery}`);
    
    let hotelResponse;
    try {
      hotelResponse = await fetch(`https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(hotelSearchQuery)}&api_key=${apiKey}`);
      console.log('Hotel search response status:', hotelResponse.status);
    } catch (error) {
      console.error('Failed to fetch hotel details:', error);
      await updateVenueStatusWithError(venue_item_id, 'Error fetching hotel details: ' + error.message);
      throw new Error(`Network error when fetching hotel details: ${error.message}`);
    }
    
    if (!hotelResponse.ok) {
      const errorText = await hotelResponse.text();
      console.error(`Hotel search API error: ${hotelResponse.status} - ${errorText}`);
      await updateVenueStatusWithError(venue_item_id, `API error: ${hotelResponse.status} - ${errorText}`);
      throw new Error(`Failed to fetch hotel details from SerpAPI: ${errorText}`);
    }

    let hotelData;
    try {
      hotelData = await hotelResponse.json();
      console.log('Hotel search response received');
    } catch (error) {
      console.error('Failed to parse hotel details response:', error);
      await updateVenueStatusWithError(venue_item_id, 'Error parsing hotel data: ' + error.message);
      throw new Error(`Invalid hotel details response: ${error.message}`);
    }
    
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

    if (hotelData.knowledge_graph) {
      const kg = hotelData.knowledge_graph;
      hotelDetails.description = kg.description || '';
      
      // Try to extract room count from description or additional details
      const roomMatch = hotelDetails.description.match(/(\d+)\s+rooms?/i);
      if (roomMatch) {
        hotelDetails.room_count = parseInt(roomMatch[1]);
      }
      
      hotelDetails.hotel_id = kg.gid || null;
      hotelDetails.website = kg.website || '';
      hotelDetails.address = kg.address || '';
      hotelDetails.contact_details = {
        phone: kg.phone || '',
        reservations: kg.reservations || '',
        social_media: {
          facebook: kg.facebook?.url || '',
          twitter: kg.twitter?.url || '',
          instagram: kg.instagram?.url || ''
        }
      };

      if (kg.amenities) {
        hotelDetails.amenities = Array.isArray(kg.amenities) 
          ? kg.amenities 
          : typeof kg.amenities === 'string' 
            ? kg.amenities.split(',').map((a: string) => a.trim())
            : [];
      }
    }
    
    // Create search record with hotel details
    console.log('Creating venue search record in database');
    let searchData;
    try {
      const { data, error: searchError } = await supabase
        .from('venue_searches')
        .insert([{ 
          venue_name,
          description: hotelDetails.description,
          room_count: hotelDetails.room_count,
          hotel_id: hotelDetails.hotel_id,
          hotel_details: hotelData.knowledge_graph || {},
          website: hotelDetails.website,
          address: hotelDetails.address,
          contact_details: hotelDetails.contact_details,
          amenities: hotelDetails.amenities,
          search_type
        }])
        .select()
        .single();

      if (searchError) {
        console.error('Error creating search record:', searchError);
        await updateVenueStatusWithError(venue_item_id, 'Error creating search record: ' + searchError.message);
        throw searchError;
      }
      searchData = data;
      console.log(`Created search record with ID: ${searchData?.id}`);
    } catch (error) {
      console.error('Failed to create search record:', error);
      await updateVenueStatusWithError(venue_item_id, 'Error creating search record: ' + error.message);
      // Continue with the search even if we can't save to the database
    }

    // Call SerpAPI to search for venue images with wide aspect ratio
    const searchQuery = `${venue_name} ${searchSuffix}`;
    console.log(`Searching for images with query: ${searchQuery}`);
    
    let response;
    try {
      response = await fetch(
        `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(searchQuery)}&api_key=${apiKey}&num=15&params=imgar:w`
      );
      console.log('Image search response status:', response.status);
    } catch (error) {
      console.error('Failed to fetch images:', error);
      await updateVenueStatusWithError(venue_item_id, 'Error fetching images: ' + error.message);
      throw new Error(`Network error when fetching images: ${error.message}`);
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Image search API error: ${response.status} - ${errorText}`);
      await updateVenueStatusWithError(venue_item_id, `Image API error: ${response.status} - ${errorText}`);
      throw new Error(`Failed to fetch images from SerpAPI: ${errorText}`);
    }

    let data;
    try {
      data = await response.json();
      console.log('Image search response received');
    } catch (error) {
      console.error('Failed to parse image search response:', error);
      await updateVenueStatusWithError(venue_item_id, 'Error parsing image data: ' + error.message);
      throw new Error(`Invalid image search response: ${error.message}`);
    }

    if (!data.images_results || !Array.isArray(data.images_results)) {
      console.error('No images found or invalid response format:', data);
      
      if (import_id && venue_item_id) {
        await supabase
          .from('venue_import_items')
          .update({ 
            status: 'error',
            error_message: 'No images found',
            search_id: searchData?.id
          })
          .eq('id', venue_item_id);

        // Process next venue
        EdgeRuntime.waitUntil(processNextVenue(import_id));
      }

      return new Response(JSON.stringify({ 
        images: [],
        hotelDetails,
        error: 'No images found or invalid response format'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Get the first 15 image results and include venue_name
    const images = data.images_results.slice(0, 15).map((img: any) => ({
      image_url: img.original || img.thumbnail,
      alt_text: img.title || `Wedding venue ${venue_name}`,
      venue_name: venue_name
    }));

    console.log(`Processing ${images.length} images`);

    // Save images with venue_name
    let savedImages = [];
    try {
      const { data: imgData, error: imageError } = await supabase
        .from('venue_images')
        .insert(images.map(img => ({
          search_id: searchData?.id,
          image_url: img.image_url,
          alt_text: img.alt_text,
          venue_name: venue_name
        })))
        .select();

      if (imageError) {
        console.error('Error saving images:', imageError);
        await updateVenueStatusWithError(venue_item_id, 'Error saving images: ' + imageError.message);
        // Continue without throwing - we'll just return the images without saving them
      } else {
        savedImages = imgData || [];
        console.log(`Saved ${savedImages.length} images to database`);
      }
    } catch (error) {
      console.error('Failed to save images:', error);
      await updateVenueStatusWithError(venue_item_id, 'Error saving images: ' + error.message);
      // Continue without throwing - we'll just return the images without saving them
      savedImages = images;
    }

    // If this is part of a batch import, update status and process next venue
    if (import_id && venue_item_id) {
      try {
        await supabase
          .from('venue_import_items')
          .update({ 
            status: 'completed',
            search_id: searchData?.id
          })
          .eq('id', venue_item_id);

        console.log(`Updated venue item ${venue_item_id} to completed status`);

        // Process next venue as a background task
        EdgeRuntime.waitUntil(processNextVenue(import_id));
      } catch (error) {
        console.error('Failed to update venue item status to completed:', error);
        // Continue without throwing
      }
    }

    console.log('Search completed successfully');
    
    // Return the result - if we couldn't save images to DB, return the raw images
    return new Response(JSON.stringify({ 
      images: savedImages.length ? savedImages : images.map(img => ({
        id: crypto.randomUUID(),
        url: img.image_url,
        alt: img.alt_text
      })),
      hotelDetails
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Search venues error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'An unexpected error occurred',
        stack: error.stack || 'No stack trace available'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Helper function to update venue status with an error message
async function updateVenueStatusWithError(venue_item_id: string | undefined, error_message: string) {
  if (venue_item_id) {
    try {
      const { error } = await supabase
        .from('venue_import_items')
        .update({ 
          status: 'error',
          error_message: error_message
        })
        .eq('id', venue_item_id);
      
      if (error) {
        console.error('Failed to update venue status to error:', error);
      } else {
        console.log(`Updated venue item ${venue_item_id} to error status with message: ${error_message}`);
      }
    } catch (err) {
      console.error('Exception when updating venue status to error:', err);
    }
  }
}

async function processNextVenue(importId: string) {
  console.log(`Processing next venue for import ${importId}`);
  try {
    // Find next pending venue
    const { data: nextVenue, error } = await supabase
      .from('venue_import_items')
      .select()
      .eq('import_id', importId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error) {
      console.error('Error finding next pending venue:', error);
      // Check if error is because there are no more pending venues
      if (error.code === 'PGRST116') {
        console.log('No more pending venues found, marking import as completed');
        await supabase
          .from('venue_csv_imports')
          .update({ status: 'completed' })
          .eq('id', importId);
      }
      return;
    }

    if (nextVenue) {
      console.log(`Found next pending venue: ${nextVenue.venue_name}`);
      // Process next venue
      const response = await fetch(`${supabaseUrl}/functions/v1/search-venues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ 
          venue_name: nextVenue.venue_name,
          import_id: importId,
          venue_item_id: nextVenue.id,
          search_type: nextVenue.search_type
        })
      });
      
      if (!response.ok) {
        console.error(`Failed to trigger next venue search: ${response.status}`);
        // Mark venue as error
        await updateVenueStatusWithError(
          nextVenue.id, 
          `Failed to trigger search: ${response.status}`
        );
        
        // Try to process next venue anyway
        EdgeRuntime.waitUntil(processNextVenue(importId));
      } else {
        console.log(`Successfully triggered next venue search for ${nextVenue.venue_name}`);
      }
    } else {
      // All venues processed, update import status
      console.log('No more pending venues found, marking import as completed');
      await supabase
        .from('venue_csv_imports')
        .update({ status: 'completed' })
        .eq('id', importId);
    }
  } catch (error) {
    console.error('Process next venue error:', error);
    // Try again with the next venue
    EdgeRuntime.waitUntil(processNextVenue(importId));
  }
}

// Register shutdown handler
addEventListener('beforeunload', (ev) => {
  console.log('Function shutdown due to:', ev.detail?.reason);
});
