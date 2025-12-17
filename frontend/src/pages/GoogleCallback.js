import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GoogleCallback = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { loginWithToken } = useAuth();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const token = params.get('token');
        const error = params.get('error');

        if (token) {
            loginWithToken(token);
            navigate('/dashboard');
        } else if (error) {
            console.error('Google login error:', error);
            navigate('/login?error=' + encodeURIComponent(error));
        } else {
            navigate('/login');
        }
    }, [location, loginWithToken, navigate]);

    return (
        <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100vh',
            flexDirection: 'column',
            gap: '1rem'
        }}>
            <div className="spinner"></div>
            <p>Processing Google Login...</p>
        </div>
    );
};

export default GoogleCallback;
