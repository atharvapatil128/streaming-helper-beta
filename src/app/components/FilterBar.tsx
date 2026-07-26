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
    <div className="dashboard-filters" aria-label="Recommendation filters">
      <div className="dashboard-filter-group">
        <span className="dashboard-filter-label">Type</span>
        <div className="dashboard-filter-options">
          {types.map((type) => (
            <button
              type="button"
              key={type}
              onClick={() => onTypeChange(type)}
              className="dashboard-control"
              aria-pressed={selectedType === type}
            >
              {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="dashboard-filter-group">
        <span className="dashboard-filter-label">Genre</span>
        <div className="dashboard-filter-options">
          {genres.map((genre) => (
            <button
              type="button"
              key={genre}
              onClick={() => onGenreChange(genre)}
              className="dashboard-control"
              aria-pressed={selectedGenre === genre}
            >
              {genre === 'all' ? 'All' : genre}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
