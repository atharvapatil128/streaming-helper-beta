interface FilterBarProps {
  genres: string[];
  types: string[];
  selectedGenre: string;
  selectedType: string;
  onGenreChange: (genre: string) => void;
  onTypeChange: (type: string) => void;
}

export function FilterBar({
  genres,
  types,
  selectedGenre,
  selectedType,
  onGenreChange,
  onTypeChange,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-[#8b8b9e]">Type:</span>
        <div className="flex items-center gap-2">
          {types.map((type) => (
            <button
              key={type}
              onClick={() => onTypeChange(type)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                selectedType === type
                  ? 'bg-[#5b5bd6] text-white'
                  : 'bg-[#1f1f28] text-[#8b8b9e] hover:bg-[#2a2a35] hover:text-[#e4e4e7]'
              }`}
            >
              {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="h-6 w-px bg-[#1f1f28]" />

      <div className="flex items-center gap-3 flex-1">
        <span className="text-sm text-[#8b8b9e]">Genre:</span>
        <div className="flex items-center gap-2 flex-wrap">
          {genres.map((genre) => (
            <button
              key={genre}
              onClick={() => onGenreChange(genre)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                selectedGenre === genre
                  ? 'bg-[#5b5bd6] text-white'
                  : 'bg-[#1f1f28] text-[#8b8b9e] hover:bg-[#2a2a35] hover:text-[#e4e4e7]'
              }`}
            >
              {genre === 'all' ? 'All' : genre}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
