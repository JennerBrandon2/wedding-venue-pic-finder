
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
    
    // Create search record
    const { data: searchData, error: searchError } = await supabase
      .from('venue_searches')
      .insert([{ venue_name }])
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

    return new Response(JSON.stringify({ images }), {
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
