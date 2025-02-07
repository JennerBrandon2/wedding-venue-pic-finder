
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const apiKey = Deno.env.get('OPENAI_API_KEY');
if (!apiKey) throw new Error('OPENAI_API_KEY is required');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { venue_name } = await req.json();

    // Call OpenAI to generate images based on the venue name
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `A beautiful, photorealistic wedding venue named "${venue_name}". Professional photography style, well-lit architectural shot showing both interior and exterior features. Make it look appealing for wedding events.`,
        n: 1,
        size: "1024x1024",
        quality: "standard",
      })
    });

    const imageData = await response.json();
    
    if (!response.ok) {
      throw new Error(imageData.error?.message || 'Failed to generate image');
    }

    return new Response(JSON.stringify({
      image_url: imageData.data[0].url,
      alt_text: `Wedding venue ${venue_name}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
