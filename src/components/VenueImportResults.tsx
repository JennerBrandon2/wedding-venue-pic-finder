
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
import { Download, FileDown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface VenueImportItem {
  id: string;
  venue_name: string;
  status: string;
  error_message: string | null;
  created_at: string;
  search_id: string | null;
}

interface VenueImage {
  image_url: string;
  venue_name: string;
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
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const exportToCsv = async () => {
    try {
      setIsExporting(true);
      
      // Get all completed venue searches
      const { data: completedItems, error: itemsError } = await supabase
        .from('venue_import_items')
        .select('venue_name, search_id')
        .eq('status', 'completed')
        .not('search_id', 'is', null);

      if (itemsError) throw itemsError;

      // Get all images for these searches
      const results: { venue_name: string; urls: string[] }[] = [];
      
      for (const item of completedItems) {
        const { data: images, error: imagesError } = await supabase
          .from('venue_images')
          .select('image_url, venue_name')
          .eq('search_id', item.search_id);

        if (imagesError) throw imagesError;

        if (images && images.length > 0) {
          results.push({
            venue_name: item.venue_name,
            urls: images.map((img: VenueImage) => img.image_url)
          });
        }
      }

      // Create CSV content
      const csvRows = [['Venue Name', 'Image URLs']];
      results.forEach(result => {
        csvRows.push([result.venue_name, result.urls.join(', ')]);
      });

      const csvContent = csvRows
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

      // Create and download the CSV file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `venue_images_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export Successful",
        description: "CSV file has been downloaded",
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export CSV file",
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
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.venue_name}</TableCell>
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
