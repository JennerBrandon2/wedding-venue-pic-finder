
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface VenueSearch {
  id: string;
  venue_name: string;
  created_at: string;
  download_count: number;
}

interface SearchImage {
  image_url: string;
  alt_text: string;
}

export function PastSearches() {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: searches, isLoading } = useQuery({
    queryKey: ['past-searches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_searches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as VenueSearch[];
    },
  });

  const downloadImages = async (searchId: string, venueName: string) => {
    try {
      setDownloading(searchId);

      // Fetch images for this search
      const { data: images, error } = await supabase
        .from('venue_images')
        .select('image_url, alt_text')
        .eq('search_id', searchId);

      if (error) throw error;

      // Download each image
      const imagePromises = (images as SearchImage[]).map(async (img, index) => {
        const response = await fetch(img.image_url);
        const blob = await response.blob();
        
        // Create download link
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${venueName}_image_${index + 1}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });

      await Promise.all(imagePromises);

      // Update download count
      await supabase
        .from('venue_searches')
        .update({ download_count: (searches?.find(s => s.id === searchId)?.download_count || 0) + 1 })
        .eq('id', searchId);

      toast({
        title: "Download Complete",
        description: `Images for ${venueName} have been downloaded`,
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: "Failed to download images",
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8 p-4">
        <p className="text-center text-muted-foreground">Loading searches...</p>
      </div>
    );
  }

  if (!searches?.length) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8 p-4">
        <p className="text-center text-muted-foreground">No searches yet</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-12 p-4">
      <h2 className="text-2xl font-semibold mb-4">Past Searches</h2>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Venue Name</TableHead>
              <TableHead>Search Date</TableHead>
              <TableHead>Downloads</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {searches.map((search) => (
              <TableRow key={search.id}>
                <TableCell className="font-medium">{search.venue_name}</TableCell>
                <TableCell>{new Date(search.created_at).toLocaleString()}</TableCell>
                <TableCell>{search.download_count}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadImages(search.id, search.venue_name)}
                    disabled={downloading === search.id}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {downloading === search.id ? 'Downloading...' : 'Download'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
