import { BrowserRouter, Routes, Route, NavLink, Link } from 'react-router-dom';
import MapView from './components/MapView';
import AboutPage from './components/AboutPage';
import './App.css';

function Header() {
  return (
    <header className="app-header">
      <Link to="/" className="app-header-brand">
        <img src="/energy-archipelago-logo.png" alt="Energy Archipelago" className="app-header-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      </Link>
      <nav className="app-header-nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Map</NavLink>
        <NavLink to="/about" end className={({ isActive }) => (isActive ? 'active' : '')}>About</NavLink>
        <a href="https://www.scene.community" target="_blank" rel="noreferrer" className="app-header-scene-link">
          <img src="/Scene-logo.png" alt="Scene" className="app-header-scene-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </a>
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Header />
        <Routes>
          <Route path="/" element={<MapView />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
