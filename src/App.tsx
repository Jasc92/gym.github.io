import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import Home from './views/Home'
import Library from './views/Library'
import Session from './views/Session'
import History from './views/History'
import InstallPrompt from './components/InstallPrompt'

function App() {
  const location = useLocation()
  const isSessionActive = location.pathname.startsWith('/session')

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/session/:templateId" element={<Session />} />
        <Route path="/history" element={<History />} />
      </Routes>

      {!isSessionActive && (
        <nav className="bottom-nav">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Inicio</span>
          </NavLink>
          <NavLink to="/library" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>Biblioteca</span>
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Historial</span>
          </NavLink>
        </nav>
      )}

      {!isSessionActive && <InstallPrompt />}
    </>
  )
}

export default App
