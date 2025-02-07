
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
    const response = await fetch(`https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(searchQuery)}&api_key=${apiKey}&num=15`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch images from SerpAPI');
    }

    const data = await response.json();
    
    // Get the first 15 image results
    const images = data.images_results?.slice(0, 15).map((img: any) => ({
      image_url: img.original || img.thumbnail,
      alt_text: img.title || `Wedding venue ${venue_name}`
    })) || [];

    return new Response(JSON.stringify({ images }), {
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
