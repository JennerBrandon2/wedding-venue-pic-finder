
import { corsHeaders } from '../_shared/cors.ts';

const apiKey = Deno.env.get('SERPAPI_API_KEY');
if (!apiKey) throw new Error('SERPAPI_API_KEY is required');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { venue_name } = await req.json();
    
    // Call SerpAPI to search for venue images
    const searchQuery = `${venue_name} wedding venue`;
    const response = await fetch(`https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(searchQuery)}&api_key=${apiKey}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch images from SerpAPI');
    }

    const data = await response.json();
    
    // Get the first image result
    const firstImage = data.images_results?.[0];
    if (!firstImage) {
      throw new Error('No images found');
    }

    return new Response(JSON.stringify({
      image_url: firstImage.original || firstImage.thumbnail,
      alt_text: firstImage.title || `Wedding venue ${venue_name}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Search venues error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
