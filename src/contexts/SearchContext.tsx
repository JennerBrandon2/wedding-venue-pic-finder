
import { createContext, useContext, useState, ReactNode } from 'react';

type SearchSuffix = 'wedding venue' | 'logo';
type SearchType = 'venue' | 'vendor';

interface SearchContextType {
  searchType: SearchType;
  setSearchType: (type: SearchType) => void;
  getSearchSuffix: () => SearchSuffix;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [searchType, setSearchType] = useState<SearchType>('venue');

  const getSearchSuffix = (): SearchSuffix => {
    return searchType === 'venue' ? 'wedding venue' : 'logo';
  };

  return (
    <SearchContext.Provider value={{ searchType, setSearchType, getSearchSuffix }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}
