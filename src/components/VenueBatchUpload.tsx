
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload } from "lucide-react";
import { useSearch } from "@/contexts/SearchContext";

export function VenueBatchUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const { searchType } = useSearch();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('search_type', searchType);

      const { data, error } = await supabase.functions.invoke('process-venue-csv', {
        body: formData,
      });

      if (error) throw error;

      toast({
        title: "Upload successful",
        description: `Processing ${data.total_venues} venues. Check the results table for status.`,
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto mt-8 p-4">
      <div className="flex items-center gap-4">
        <Input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          disabled={isUploading}
          className="flex-1"
        />
        <Button disabled={isUploading}>
          <Upload className="mr-2 h-4 w-4" />
          {isUploading ? "Uploading..." : "Upload CSV"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mt-2">
        Upload a CSV file with venue names (one per line)
      </p>
    </div>
  );
}
