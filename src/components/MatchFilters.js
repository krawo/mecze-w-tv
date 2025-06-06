// MatchFilters.js
import React from 'react';
import styles from './MatchList.module.css';

const MatchFilters = ({
  leagueOptions,
  channelOptions,
  selectedLeagueOptions,
  setSelectedLeagueOptions,
  selectedChannelOptions,
  setSelectedChannelOptions,
}) => {
  const toggleOption = (option, selected, setter) => {
    if (selected.includes(option)) {
      setter(selected.filter(o => o !== option));
    } else {
      setter([...selected, option]);
    }
  };

  return (
    <div className={styles.filtersWrapperCompact}>
      <div className={styles.filterSelectContainer}>
        <label className={styles.filterSelectLabel}>Ligi:</label>
        <div className={styles.toggleGroup}>
          {leagueOptions.map(option => (
            <button
              key={option}
              className={`${styles.toggleButton} ${selectedLeagueOptions.includes(option) ? styles.active : ''}`}
              onClick={() => toggleOption(option, selectedLeagueOptions, setSelectedLeagueOptions)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.filterSelectContainer}>
        <label className={styles.filterSelectLabel}>Kanały:</label>
        <div className={styles.toggleGroup}>
          {channelOptions.map(option => (
            <button
              key={option}
              className={`${styles.toggleButton} ${selectedChannelOptions.includes(option) ? styles.active : ''}`}
              onClick={() => toggleOption(option, selectedChannelOptions, setSelectedChannelOptions)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MatchFilters;
