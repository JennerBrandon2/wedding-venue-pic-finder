
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
  import_id: string;
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
  status: string;
  error_message: string | null;
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

  const fetchImages = async (searchIds: string[]) => {
    try {
      const { data, error } = await supabase
        .from('venue_images')
        .select('*')
        .in('search_id', searchIds);

      if (error) throw error;
      return data as VenueImageResult[];
    } catch (error) {
      console.error('Error fetching images:', error);
      throw error;
    }
  };

  const exportToCsv = async () => {
    try {
      setIsExporting(true);
      console.log('Starting export process...');

      // Get all items from the most recent import
      const { data: items, error: itemsError } = await supabase
        .from('venue_import_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (itemsError) throw itemsError;

      if (!items?.length) {
        toast({
          title: "No Data to Export",
          description: "No venues found",
          variant: "destructive",
        });
        return;
      }

      // Group items by import_id and get the most recent import
      const importGroups = items.reduce<Record<string, VenueImportItem[]>>((acc, item) => {
        if (!acc[item.import_id]) {
          acc[item.import_id] = [];
        }
        acc[item.import_id].push(item);
        return acc;
      }, {});

      const mostRecentImportId = Object.keys(importGroups)[0];
      const importItems = importGroups[mostRecentImportId];

      console.log(`Found ${importItems.length} items from import`);

      // Get all search IDs (including null ones)
      const searchIds = Array.from(new Set(
        importItems
          .filter(item => item.search_id !== null)
          .map(item => item.search_id as string)
      ));

      console.log(`Processing ${searchIds.length} search IDs`);

      // Fetch images for items that have search IDs
      let allImages: VenueImageResult[] = [];
      if (searchIds.length > 0) {
        // Fetch images in batches
        const BATCH_SIZE = 20;
        for (let i = 0; i < searchIds.length; i += BATCH_SIZE) {
          const batchIds = searchIds.slice(i, i + BATCH_SIZE);
          try {
            const batchImages = await fetchImages(batchIds);
            allImages = allImages.concat(batchImages);
          } catch (error) {
            console.error(`Failed to fetch batch ${i / BATCH_SIZE + 1}:`, error);
          }
        }
      }

      console.log(`Found ${allImages.length} total images`);

      // Create image lookup table
      const imagesBySearchId = allImages.reduce<Record<string, string[]>>((acc, img) => {
        if (img.search_id) {
          if (!acc[img.search_id]) {
            acc[img.search_id] = [];
          }
          acc[img.search_id].push(img.image_url);
        }
        return acc;
      }, {});

      // Create results including all venues, even those without images
      const results: ResultRow[] = importItems.map(item => ({
        venue_name: item.venue_name,
        search_type: item.search_type,
        status: item.status,
        error_message: item.error_message,
        urls: item.search_id ? (imagesBySearchId[item.search_id] || []) : []
      }));

      console.log(`Preparing CSV for ${results.length} venues`);

      // Find max URLs across all results
      const maxUrls = Math.max(...results.map(r => r.urls.length));

      // Create headers
      const headers = [
        'Venue Name',
        'Search Type',
        'Status',
        'Error Message',
        ...Array(maxUrls).fill(0).map((_, i) => `Image URL ${i + 1}`)
      ];

      // Create CSV content
      const csvContent = [
        headers.join(','),
        ...results.map(result => [
          `"${result.venue_name.replace(/"/g, '""')}"`,
          `"${result.search_type.replace(/"/g, '""')}"`,
          `"${result.status.replace(/"/g, '""')}"`,
          `"${(result.error_message || '').replace(/"/g, '""')}"`,
          ...Array(maxUrls).fill('').map((_, i) => result.urls[i] ? `"${result.urls[i].replace(/"/g, '""')}"` : '')
        ].join(','))
      ].join('\n');

      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `venue_images_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: `Successfully exported ${results.length} venues`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
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
