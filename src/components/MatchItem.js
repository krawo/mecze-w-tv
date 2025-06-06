import styles from './MatchList.module.css';


const MatchItem = ({ match }) => {
  console.log('[MATCH]', match);
    const formatTime = (isoString) => {
      if (!isoString) return 'B/D';
      try {
        const date = new Date(isoString);
        return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
      } catch {
        return 'Błąd';
      }
    };
  
    return (
      <div className={styles.matchItem}>
        <div className={styles.matchMeta}>
          <span className={styles.matchTime}>{match.start ? formatTime(match.start) : 'LIVE'}</span>
          <div className={styles.channelListContainer}>
            {match.channels?.map(channel => (
              <span key={channel} className={styles.matchChannel}>{channel}</span>
            ))}
          </div>
        </div>
    
        {match.league && <div className={styles.matchLeague}>{match.league}</div>}
        <div className={styles.matchTitle}>{match.title}</div>
    
        <div className={styles.matchActions}>
          <a
            href={`/api/match/${match._id}.ics`}
            download
            className={styles.calendarButton}
          >
            📅 Dodaj do kalendarza
          </a>
        </div>
      </div>
    );
  };

export default MatchItem;
