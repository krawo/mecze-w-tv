// MatchFilters.js
import React from 'react';
import Select from 'react-select';
import styles from './MatchList.module.css';

const MatchFilters = ({
  leagueOptions,
  channelOptions,
  selectedLeagueOptions,
  setSelectedLeagueOptions,
  selectedChannelOptions,
  setSelectedChannelOptions,
  showReplays,
  setShowReplays
}) => {
  const customSelectStyles = {
    container: (provided) => ({ ...provided, width: '100%' }),
    control: (provided) => ({ ...provided, minHeight: '38px', borderColor: '#ced4da' }),
    menu: (provided) => ({ ...provided, zIndex: 5 }),
    valueContainer: (provided) => ({ ...provided, padding: '2px 8px' }),
    multiValue: (provided) => ({ ...provided, backgroundColor: '#eaf5fc' }),
    multiValueLabel: (provided) => ({ ...provided, color: '#3498db' }),
    option: (provided, state) => ({
      ...provided,
      color: state.isSelected ? '#FFF' : '#333',
      backgroundColor: state.isSelected ? provided.backgroundColor : state.isFocused ? '#f0f0f0' : provided.backgroundColor,
    }),
  };

  return (
    <div className={styles.filtersWrapperCompact}>
      <div className={styles.filterSelectContainer}>
        <label className={styles.filterSelectLabel}>Ligi:</label>
        <Select
          options={leagueOptions}
          isMulti
          value={selectedLeagueOptions}
          onChange={setSelectedLeagueOptions}
          placeholder="Wszystkie ligi"
          styles={customSelectStyles}
        />
      </div>
      <div className={styles.filterSelectContainer}>
        <label className={styles.filterSelectLabel}>Kanały:</label>
        <Select
          options={channelOptions}
          isMulti
          value={selectedChannelOptions}
          onChange={setSelectedChannelOptions}
          placeholder="Wszystkie kanały"
          styles={customSelectStyles}
        />
      </div>
    </div>
  );
};

export default MatchFilters;