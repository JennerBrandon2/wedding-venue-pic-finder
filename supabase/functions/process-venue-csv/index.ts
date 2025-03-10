
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
        search_type: search_type, // Store search_type in the import record
        status: 'processing'
      })
      .select()
      .single();

    if (importError) throw importError;

    console.log(`Created import record with ID: ${importData.id}`);

    // Create venue items for each line
    const venueItems = lines.map(venueName => ({
      import_id: importData.id,
      venue_name: venueName.replace(/"/g, '').trim(),
      search_type: search_type, // Store search_type for each venue item
      status: 'pending'
    }));

    const { error: itemsError } = await supabase
      .from('venue_import_items')
      .insert(venueItems);

    if (itemsError) throw itemsError;

    console.log(`Created ${venueItems.length} venue items`);

    // Process the first venue to start the chain
    if (venueItems.length > 0) {
      const firstVenue = venueItems[0];
      console.log(`Triggering first search for ${firstVenue.venue_name}`);
      
      // Use a background task for starting the first search
      EdgeRuntime.waitUntil((async () => {
        try {
          // Get the actual ID of the first venue from the database
          const { data: venueItem } = await supabase
            .from('venue_import_items')
            .select()
            .eq('import_id', importData.id)
            .eq('venue_name', firstVenue.venue_name)
            .single();
            
          if (venueItem) {
            console.log(`Starting search for ${venueItem.venue_name} with ID ${venueItem.id}`);
            
            const response = await fetch(`${supabaseUrl}/functions/v1/search-venues`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({ 
                venue_name: venueItem.venue_name,
                import_id: importData.id,
                venue_item_id: venueItem.id,
                search_type: search_type
              })
            });
            
            if (!response.ok) {
              console.error(`Failed to start search: ${response.status}`);
              
              // Mark venue as error
              await supabase
                .from('venue_import_items')
                .update({ 
                  status: 'error',
                  error_message: `Failed to start search: ${response.status}`
                })
                .eq('id', venueItem.id);
              
              // Try with the next venue as a fallback
              await processNextVenue(importData.id);
            } else {
              console.log(`Successfully triggered search for ${venueItem.venue_name}`);
            }
          } else {
            console.error(`Could not find venue item for ${firstVenue.venue_name}`);
          }
        } catch (error) {
          console.error('Error starting first search:', error);
        }
      })());
    }

    return new Response(
      JSON.stringify({ 
        message: 'CSV processing started', 
        import_id: importData.id,
        total_venues: venueItems.length,
        search_type: search_type
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

// Helper function to process the next venue in case the first one fails
async function processNextVenue(importId: string) {
  try {
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
      console.log(`Trying next venue: ${nextVenue.venue_name}`);
      
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
        console.error(`Failed to start next search: ${response.status}`);
      } else {
        console.log(`Successfully triggered search for next venue ${nextVenue.venue_name}`);
      }
    } else {
      // No pending venues found - odd case but handle it
      console.log(`No pending venues found for import ${importId}`);
      
      // Check if we have any processing venues
      const { data: processingCount, error } = await supabase
        .from('venue_import_items')
        .select('id', { count: 'exact' })
        .eq('import_id', importId)
        .eq('status', 'processing');
        
      if (error) {
        console.error('Error checking processing venues:', error);
      }
      
      // If no venues are processing, mark import as completed
      if (!processingCount || processingCount.length === 0) {
        console.log('No processing venues found, marking import as completed');
        await supabase
          .from('venue_csv_imports')
          .update({ status: 'completed' })
          .eq('id', importId);
      }
    }
  } catch (error) {
    console.error('Process next venue error:', error);
  }
}

// Register shutdown handler
addEventListener('beforeunload', (ev) => {
  console.log('Function shutdown due to:', ev.detail?.reason);
});
