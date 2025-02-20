
import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface VenueImportItem {
  id: string;
  venue_name: string;
  status: string;
  error_message: string | null;
  created_at: string;
  search_id: string | null;
  search_type: string;
}

interface VenueImageResult {
  id: string;
  image_url: string;
  search_id: string | null;
  venue_name: string;
  alt_text: string;
  created_at: string;
}

interface ResultRow {
  venue_name: string;
  search_type: string;
  urls: string[];
}

export function VenueImportResults() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ['venue-imports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_import_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as VenueImportItem[];
    },
    refetchInterval: 5000,
  });

  const exportToCsv = async () => {
    try {
      setIsExporting(true);
      console.log('Starting export process...');

      // Get completed items
      const { data: completedItems, error: itemsError } = await supabase
        .from('venue_import_items')
        .select('venue_name, search_id, search_type')
        .eq('status', 'completed')
        .not('search_id', 'is', null);

      if (itemsError) {
        console.error('Error fetching completed items:', itemsError);
        throw new Error(`Failed to fetch completed items: ${itemsError.message}`);
      }

      if (!completedItems?.length) {
        console.log('No completed items found');
        toast({
          title: "No Data to Export",
          description: "No completed venues found",
          variant: "destructive",
        });
        return;
      }

      console.log(`Found ${completedItems.length} completed items`);

      // Get unique search IDs
      const searchIds = completedItems
        .filter(item => item.search_id)
        .map(item => item.search_id as string); // We've filtered out nulls above

      if (!searchIds.length) {
        console.log('No search IDs found in completed items');
        toast({
          title: "Export Failed",
          description: "No valid search IDs found in completed venues",
          variant: "destructive",
        });
        return;
      }

      console.log(`Processing ${searchIds.length} unique search IDs`);

      // Fetch images for all search IDs at once
      const { data: images, error: imagesError } = await supabase
        .from('venue_images')
        .select('*')
        .in('search_id', searchIds);

      if (imagesError) {
        console.error('Error fetching images:', imagesError);
        throw new Error(`Failed to fetch images: ${imagesError.message}`);
      }

      const typedImages = images as VenueImageResult[] | null;

      if (!typedImages?.length) {
        console.log('No images found for any search IDs');
        toast({
          title: "No Images Found",
          description: "No images were found for any of the completed venues",
          variant: "destructive",
        });
        return;
      }

      console.log(`Found ${typedImages.length} total images`);

      // Create image lookup table
      const imagesBySearchId = typedImages.reduce<Record<string, string[]>>((acc, img) => {
        if (img.search_id) {
          if (!acc[img.search_id]) {
            acc[img.search_id] = [];
          }
          acc[img.search_id].push(img.image_url);
        }
        return acc;
      }, {});

      // Match venues with their images
      const results: ResultRow[] = completedItems
        .filter(item => {
          const hasImages = item.search_id && imagesBySearchId[item.search_id]?.length > 0;
          if (!hasImages) {
            console.log(`No images found for venue: ${item.venue_name} (search_id: ${item.search_id})`);
          }
          return hasImages;
        })
        .map(item => ({
          venue_name: item.venue_name,
          search_type: item.search_type,
          urls: imagesBySearchId[item.search_id!]
        }));

      if (!results.length) {
        console.log('No venues matched with images');
        toast({
          title: "No Data Available",
          description: "No venues could be matched with their images",
          variant: "destructive",
        });
        return;
      }

      console.log(`Preparing CSV for ${results.length} venues with images`);

      // Find the maximum number of URLs
      const maxUrls = Math.max(...results.map(r => r.urls.length));
      
      // Create headers
      const headers = ['Venue Name', 'Search Type'];
      for (let i = 1; i <= maxUrls; i++) {
        headers.push(`Image URL ${i}`);
      }

      // Create CSV content
      const csvRows = [headers];
      results.forEach(result => {
        const row = [result.venue_name, result.search_type];
        for (let i = 0; i < maxUrls; i++) {
          row.push(result.urls[i] || '');
        }
        csvRows.push(row);
      });

      const csvContent = csvRows
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','))
        .join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `venue_images_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      console.log('Export completed successfully');
      toast({
        title: "Export Successful",
        description: `Successfully exported ${results.length} venues with images`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export CSV file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8 p-4">
        <p className="text-center text-muted-foreground">Loading results...</p>
      </div>
    );
  }

  if (!items?.length) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8 p-4">
        <p className="text-center text-muted-foreground">No imports yet</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">Recent Imports</h2>
        <Button
          variant="outline"
          onClick={exportToCsv}
          disabled={isExporting}
        >
          <FileDown className="mr-2 h-4 w-4" />
          {isExporting ? 'Exporting...' : 'Export to CSV'}
        </Button>
      </div>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Venue Name</TableHead>
              <TableHead>Search Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.venue_name}</TableCell>
                <TableCell>{item.search_type}</TableCell>
                <TableCell>
                  <span className={
                    item.status === 'completed' ? 'text-green-600' :
                    item.status === 'error' ? 'text-red-600' :
                    item.status === 'processing' ? 'text-blue-600' :
                    'text-gray-600'
                  }>
                    {item.status}
                  </span>
                </TableCell>
                <TableCell>{new Date(item.created_at).toLocaleString()}</TableCell>
                <TableCell>{item.error_message || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
