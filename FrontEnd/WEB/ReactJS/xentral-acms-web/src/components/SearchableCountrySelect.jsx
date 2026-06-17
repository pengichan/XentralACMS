import React, { useState, useEffect, useRef } from 'react';
import countriesData from './CountryCodes.json';
import './SearchableCountrySelect.css';

function SearchableCountrySelect({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clear search query when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  const selectedCountry = countriesData.find(
    (c) => c.dial_code.replace(/\s+/g, '') === value.replace(/\s+/g, '')
  ) || { name: 'Singapore', code: 'SG', dial_code: '+65' };

  const filtered = countriesData.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.dial_code.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q)
    );
  });

  return (
    <div className="searchable-country-container" ref={containerRef}>
      <div 
        className="searchable-country-selector" 
        onClick={() => setIsOpen(!isOpen)}
        title={`${selectedCountry.name} (${selectedCountry.dial_code})`}
      >
        <span>{selectedCountry.code} ({selectedCountry.dial_code.replace(/\s+/g, '')})</span>
        <span className={`searchable-country-arrow ${isOpen ? 'open' : ''}`}>▼</span>
      </div>

      {isOpen && (
        <div className="searchable-country-dropdown">
          <div className="searchable-country-search-wrapper">
            <input
              type="text"
              className="searchable-country-search-input"
              placeholder="Search name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <ul className="searchable-country-list">
            {filtered.length > 0 ? (
              filtered.map((c, i) => {
                const dialClean = c.dial_code.replace(/\s+/g, '');
                const isSelected = dialClean === value.replace(/\s+/g, '');
                return (
                  <li
                    key={`${c.code}-${i}`}
                    className={`searchable-country-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      onChange(dialClean);
                      setIsOpen(false);
                    }}
                  >
                    <span className="searchable-country-item-name" title={c.name}>{c.name}</span>
                    <span className="searchable-country-item-code">{c.code}</span>
                    <span className="searchable-country-item-dial">{dialClean}</span>
                  </li>
                );
              })
            ) : (
              <li className="searchable-country-no-results">No countries found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default SearchableCountrySelect;
