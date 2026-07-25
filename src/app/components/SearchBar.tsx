import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search titles, shows, movies...' }: SearchBarProps) {
  return (
    <div className="dashboard-search">
      <Search aria-hidden />
      <input
        aria-label={placeholder}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
