
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
import { FileDown, RefreshCw } from "lucide-react";
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: items, isLoading, refetch } = useQuery({
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
    // Reduced refetch interval for more responsive updates
    refetchInterval: 3000,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast({
        title: "Refreshed",
        description: "Latest import status updated",
      });
    } catch (error) {
      console.error('Refresh error:', error);
      toast({
        title: "Refresh Failed",
        description: "Couldn't update import status",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchImages = async (searchIds: string[]) => {
    if (searchIds.length === 0) return [];
    
    try {
      console.log(`Fetching images for ${searchIds.length} search IDs`);
      const { data, error } = await supabase
        .from('venue_images')
        .select('*')
        .in('search_id', searchIds);

      if (error) throw error;
      return data as VenueImageResult[];
    } catch (error) {
      console.error('Error fetching images:', error);
      return [];
    }
  };

  const exportToCsv = async () => {
    try {
      setIsExporting(true);
      console.log('Starting export process...');

      // Get the most recent import_id first
      const { data: recentImport, error: recentError } = await supabase
        .from('venue_csv_imports')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1);

      if (recentError) {
        console.error('Error fetching recent import:', recentError);
        throw recentError;
      }
      
      if (!recentImport || recentImport.length === 0) {
        toast({
          title: "No Imports Found",
          description: "No CSV imports found in the system",
          variant: "destructive",
        });
        return;
      }

      const importId = recentImport[0].id;
      console.log(`Found most recent import ID: ${importId}`);

      // Get ALL items from the most recent import
      const { data: importItems, error: itemsError } = await supabase
        .from('venue_import_items')
        .select('*')
        .eq('import_id', importId);

      if (itemsError) {
        console.error('Error fetching import items:', itemsError);
        throw itemsError;
      }

      if (!importItems?.length) {
        toast({
          title: "No Data to Export",
          description: "No venues found in the most recent import",
          variant: "destructive",
        });
        return;
      }

      console.log(`Found ${importItems.length} items from import`);

      // Get all search IDs (including null ones)
      const searchIds = Array.from(new Set(
        importItems
          .filter(item => item.search_id !== null)
          .map(item => item.search_id as string)
      ));

      console.log(`Processing ${searchIds.length} search IDs for images`);

      // Fetch images for items that have search IDs
      let allImages: VenueImageResult[] = [];
      
      if (searchIds.length > 0) {
        // Split into smaller batches to avoid timeouts
        const BATCH_SIZE = 100; // Increased batch size
        for (let i = 0; i < searchIds.length; i += BATCH_SIZE) {
          const batchIds = searchIds.slice(i, i + BATCH_SIZE);
          console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batchIds.length} IDs`);
          
          try {
            const batchImages = await fetchImages(batchIds);
            allImages = allImages.concat(batchImages);
            console.log(`Fetched ${batchImages.length} images for batch ${Math.floor(i / BATCH_SIZE) + 1}`);
          } catch (error) {
            console.error(`Failed to fetch batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
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
      const maxUrls = Math.max(...results.map(r => r.urls.length), 1);

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
          `"${(result.venue_name || '').replace(/"/g, '""')}"`,
          `"${(result.search_type || '').replace(/"/g, '""')}"`,
          `"${(result.status || '').replace(/"/g, '""')}"`,
          `"${((result.error_message || '').replace(/"/g, '""'))}"`,
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

  // Count statuses for summary
  const statusCounts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-semibold">Recent Imports</h2>
          {Object.keys(statusCounts).length > 0 && (
            <div className="text-sm text-muted-foreground mt-1">
              {Object.entries(statusCounts).map(([status, count], index) => (
                <span key={status} className={
                  status === 'completed' ? 'text-green-600' :
                  status === 'error' ? 'text-red-600' :
                  status === 'processing' ? 'text-blue-600' :
                  status === 'pending' ? 'text-amber-600' :
                  'text-gray-600'
                }>
                  {count} {status}
                  {index < Object.entries(statusCounts).length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className="mr-2 h-4 w-4" className={isRefreshing ? "animate-spin" : ""} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button
            variant="outline"
            onClick={exportToCsv}
            disabled={isExporting}
          >
            <FileDown className="mr-2 h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export to CSV'}
          </Button>
        </div>
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
                    item.status === 'pending' ? 'text-amber-600' :
                    'text-gray-600'
                  }>
                    {item.status}
                  </span>
                </TableCell>
                <TableCell>{new Date(item.created_at).toLocaleString()}</TableCell>
                <TableCell className="max-w-[200px] truncate" title={item.error_message || ''}>
                  {item.error_message || '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
