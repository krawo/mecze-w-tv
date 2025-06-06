// MatchList.js
import React, { useEffect, useMemo, useState } from 'react';
import MatchDay from './MatchDay';
import MatchFilters from './MatchFilters';
import styles from './MatchList.module.css';

const MatchList = () => {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showReplays, setShowReplays] = useState(false);

  const [leagueOptions, setLeagueOptions] = useState([]);
  const [channelOptions, setChannelOptions] = useState([]);
  const [selectedLeagueOptions, setSelectedLeagueOptions] = useState([]);
  const [selectedChannelOptions, setSelectedChannelOptions] = useState([]);

  useEffect(() => {
    const fetchMatches = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/flashscore-matches');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setDays(data);

        const leagues = new Set();
        const channels = new Set();

        data.forEach(day => {
          (day.matches || []).forEach(match => {
            if (match.league) leagues.add(match.league);
            (match.channels || []).forEach(channel => {
              if (channel) channels.add(channel);
            });
          });
        });

        setLeagueOptions([...leagues].sort().map(value => ({ value, label: value })));
        setChannelOptions([...channels].sort().map(value => ({ value, label: value })));

      } catch (err) {
        console.error('Fetch error:', err);
        setError('Nie udało się załadować danych.');
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
  }, []);

  const filteredDays = useMemo(() => {
    const selectedLeagues = selectedLeagueOptions.map(opt => opt.value);
    const selectedChannels = selectedChannelOptions.map(opt => opt.value);

    return days.map(day => {
      const filteredMatches = day.matches.filter(match => {
        const leagueMatch = !selectedLeagues.length || selectedLeagues.includes(match.league);
        const channelMatch = !selectedChannels.length || (match.channels || []).some(ch => selectedChannels.includes(ch));
        const replayMatch = showReplays || !match.isReplay;
        return leagueMatch && channelMatch && replayMatch;
      });

      return { ...day, matches: filteredMatches };
    }).filter(day => day.matches.length > 0);
  }, [days, selectedLeagueOptions, selectedChannelOptions, showReplays]);

  if (loading) return <div className={styles.loading}>Ładowanie listy meczów (Flashscore)...</div>;
  if (error) return <div className={styles.error}>{error}</div>;

  return (
    <div className={styles.container}>
      <MatchFilters
        leagueOptions={leagueOptions}
        channelOptions={channelOptions}
        selectedLeagueOptions={selectedLeagueOptions}
        setSelectedLeagueOptions={setSelectedLeagueOptions}
        selectedChannelOptions={selectedChannelOptions}
        setSelectedChannelOptions={setSelectedChannelOptions}
        showReplays={showReplays}
        setShowReplays={setShowReplays}
      />

      {filteredDays.length === 0 ? (
        <p className={styles.noMatches}>Brak meczów spełniających wybrane kryteria.</p>
      ) : (
        filteredDays.map(day => <MatchDay key={day.date} date={day.date} matches={day.matches} />)
      )}
    </div>
  );
};

export default MatchList;