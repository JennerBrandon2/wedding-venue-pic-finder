
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export function SearchVenue({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState("");
  const { toast } = useToast();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      toast({
        title: "Please enter a venue name",
        description: "The search query cannot be empty",
        variant: "destructive",
      });
      return;
    }
    onSearch(query.trim());
  };

  return (
    <form onSubmit={handleSearch} className="w-full space-y-6 animate-fade-in">
      <div className="space-y-2 text-center">
        <h1 className="text-4xl font-serif font-semibold tracking-tight">
          Find Your Perfect Wedding Venue
        </h1>
        <p className="text-muted-foreground">
          Search and discover beautiful wedding venues through images
        </p>
      </div>
      
      <div className="flex gap-2 max-w-xl mx-auto">
        <Input
          type="text"
          placeholder="Enter venue name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12"
        />
        <Button type="submit" className="h-12 px-6">
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
      </div>
    </form>
  );
}
