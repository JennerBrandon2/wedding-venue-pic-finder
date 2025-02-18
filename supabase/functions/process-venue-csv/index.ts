
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
    const { file, search_type } = await req.json();
    console.log('Received search_type:', search_type); // Add logging
    
    if (!file) {
      throw new Error('No CSV content provided');
    }

    if (!search_type) {
      throw new Error('No search type provided');
    }

    // Parse CSV content
    const lines = file.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // Remove header if present (assumes first line is header)
    if (lines[0].toLowerCase().includes('venue') || lines[0].toLowerCase().includes('name')) {
      lines.shift();
    }

    // Create import record with search_type
    const { data: importData, error: importError } = await supabase
      .from('venue_csv_imports')
      .insert({
        filename: 'csv-upload',
        search_type: search_type // Store search_type in the import record
      })
      .select()
      .single();

    if (importError) throw importError;

    // Create venue items for each line
    const venueItems = lines.map(venueName => ({
      import_id: importData.id,
      venue_name: venueName.replace(/"/g, '').trim(),
      search_type: search_type // Store search_type for each venue item
    }));

    const { error: itemsError } = await supabase
      .from('venue_import_items')
      .insert(venueItems);

    if (itemsError) throw itemsError;

    // Process all venues
    for (const venueName of lines) {
      const { data: venueItem } = await supabase
        .from('venue_import_items')
        .select()
        .eq('import_id', importData.id)
        .eq('venue_name', venueName.replace(/"/g, '').trim())
        .single();

      if (venueItem) {
        console.log(`Triggering search for ${venueName} with search_type: ${search_type}`);
        
        // Trigger the search for each venue with the correct search_type
        await supabase.functions.invoke('search-venues', {
          body: { 
            venue_name: venueItem.venue_name,
            import_id: importData.id,
            venue_item_id: venueItem.id,
            search_type: search_type // Pass search_type for each search
          }
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'CSV processing started', 
        import_id: importData.id,
        total_venues: venueItems.length,
        search_type: search_type // Include search_type in response
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
