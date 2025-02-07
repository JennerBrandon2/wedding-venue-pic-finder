
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      throw new Error('No CSV file provided');
    }

    // Read and parse CSV content
    const text = await file.text();
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // Remove header if present (assumes first line is header)
    if (lines[0].toLowerCase().includes('venue') || lines[0].toLowerCase().includes('name')) {
      lines.shift();
    }

    // Create import record
    const { data: importData, error: importError } = await supabase
      .from('venue_csv_imports')
      .insert({ filename: file.name })
      .select()
      .single();

    if (importError) throw importError;

    // Create venue items for each line
    const venueItems = lines.map(venueName => ({
      import_id: importData.id,
      venue_name: venueName.replace(/"/g, '').trim(),
    }));

    const { error: itemsError } = await supabase
      .from('venue_import_items')
      .insert(venueItems);

    if (itemsError) throw itemsError;

    // Start processing the first venue
    const { data: firstVenue } = await supabase
      .from('venue_import_items')
      .select()
      .eq('import_id', importData.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (firstVenue) {
      // Trigger the search for the first venue
      await supabase.functions.invoke('search-venues', {
        body: { 
          venue_name: firstVenue.venue_name,
          import_id: importData.id,
          venue_item_id: firstVenue.id
        }
      });
    }

    return new Response(
      JSON.stringify({ 
        message: 'CSV processing started', 
        import_id: importData.id,
        total_venues: venueItems.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing CSV:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
