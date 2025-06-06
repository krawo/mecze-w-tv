// MatchDay.js
import React from 'react';
import MatchItem from './MatchItem';
import styles from './MatchList.module.css';

const formatDate = (dateString) => {
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  } catch {
    return 'Nieznana data';
  }
};

const MatchDay = ({ date, matches }) => (
  <div className={styles.dayBlock}>
    <h3 className={styles.dateHeader}>{formatDate(date)}</h3>
    <div className={styles.matchList}>
      {matches.map(match => (
        <MatchItem key={match._id} match={match} />
      ))}
    </div>
  </div>
);

export default MatchDay;