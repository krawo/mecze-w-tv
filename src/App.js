import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import './App.css';
import MatchList from './components/MatchList';
import ThemeToggle from './components/ThemeToggle';

function App() {
  return (
    <Router basename="/mecze">
      <div className="App">
        <div className="header">
          <h1>Mecze w TV</h1>
          <div className="theme-toggle-container">
            <ThemeToggle />
          </div>
        </div>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<MatchList />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;