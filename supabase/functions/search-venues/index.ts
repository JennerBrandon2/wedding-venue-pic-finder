
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

    // First, search for hotel details
    const hotelSearchQuery = `${venue_name} hotel details`;
    const hotelResponse = await fetch(`https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(hotelSearchQuery)}&api_key=${apiKey}`);
    
    if (!hotelResponse.ok) {
      throw new Error('Failed to fetch hotel details from SerpAPI');
    }

    const hotelData = await hotelResponse.json();
    
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
    const { data: searchData, error: searchError } = await supabase
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
    
    // Get the first 15 image results and include venue_name
    const images = data.images_results.slice(0, 15).map((img: any) => ({
      image_url: img.original || img.thumbnail,
      alt_text: img.title || `Wedding venue ${venue_name}`,
      venue_name: venue_name // Include venue_name for each image
    }));

    // Save images with venue_name
    const { data: savedImages, error: imageError } = await supabase
      .from('venue_images')
      .insert(images.map(img => ({
        search_id: searchData.id,
        image_url: img.image_url,
        alt_text: img.alt_text,
        venue_name: venue_name // Save venue_name with each image
      })))
      .select();

    if (imageError) throw imageError;

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
      images: savedImages,
      hotelDetails
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
