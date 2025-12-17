import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/layout.css';

const Layout = ({ children }) => {
    const { user, logout, isAdminOrPM } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    useEffect(() => {
        const path = location.pathname || '/';
        const map = {
            '/': 'Dashboard',
            '/dashboard': 'Dashboard',
            '/teams': 'Teams',
            '/projects': 'Projects',
            '/tasks': 'Tasks',
            '/time-tracker': 'Time Tracker',
            '/screenshots': 'Screenshots',
            '/chat': 'Chat',
            '/monitor': 'Tracker Monitor',
            '/notifications': 'Notifications',
        };
        let pageTitle = 'Dashboard';
        if (map[path]) pageTitle = map[path];
        else if (path.startsWith('/tasks/') && path.endsWith('/tracker')) pageTitle = 'Task Tracker';
        document.title = `Team Manage | ${pageTitle}`;
        const meta = document.querySelector('meta[name="description"]');
        if (meta) {
            const descMap = {
                'Dashboard': 'Overview of projects, tasks and tracked hours',
                'Teams': 'Manage teams and members',
                'Projects': 'Manage projects and timelines',
                'Tasks': 'Create and track tasks with estimates and due dates',
                'Time Tracker': 'Track time with screenshots and activity metrics',
                'Screenshots': 'Browse and review captured screenshots',
                'Chat': 'Collaborate with team through chat',
                'Tracker Monitor': 'Monitor time tracking and productivity activity',
                'Task Tracker': 'Track a specific task with screen capture',
                'Notifications': 'View your notifications',
            };
            meta.setAttribute('content', `Team Manage — ${descMap[pageTitle] || 'Manage your work and tracking'}`);
        }
    }, [location.pathname]);

    return (
        <div className="layout">
            <nav className="navbar">
                <div className="nav-brand">
                    <Link to="/dashboard" style={{ textDecoration: 'none' }}><h1>Team Manage</h1></Link>
                    
                </div>
                <button className="nav-toggle" aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
                <div className={`nav-links ${menuOpen ? 'open' : ''} m-auto gap-0`} onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="nav-close" aria-label="Close navigation" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}>✕</button>
                    
                    <Link to="/teams">Teams</Link>
                    <Link to="/projects">Projects</Link>
                    <Link to="/tasks">Tasks</Link>
                    <Link to="/time-tracker">Time Tracker</Link>
                    <Link to="/screenshots">Screenshots</Link>
                    <Link to="/chat">Chat</Link>
                    <Link to="/notifications">Notifications</Link>
                    {isAdminOrPM() && <Link to="/monitor">Monitor</Link>}
                    <div className="nav-user-drawer">
                        <span>{user?.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); handleLogout(); }}>Logout</button>
                    </div>
                </div>
                <div className="nav-user">
                    <span>{user?.name}</span>
                    <button onClick={handleLogout}>Logout</button>
                </div>
            </nav>

            <div className={`nav-overlay ${menuOpen ? 'show' : ''}`} onClick={() => setMenuOpen(false)} />

            <div className="main-content">
                {children}
            </div>
        </div>
    );
};

export default Layout;
