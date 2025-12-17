import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/auth.css';

import api from '../services/api';

export const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();
    const [verificationMessage, setVerificationMessage] = useState('');

    useEffect(() => {
        document.title = 'Team Manage | Login';
        const meta = document.querySelector('meta[name="description"]');
        if (meta) meta.setAttribute('content', 'Login to Team Manage to access time tracking and task management');

        const params = new URLSearchParams(window.location.search);
        if (params.get('verified') === 'true') {
            setVerificationMessage('Email verified successfully! You can now login.');
        }
    }, []);

    const handleGoogleLogin = async () => {
        try {
            const response = await api.get('/auth/google');
            window.location.href = response.data.url;
        } catch (error) {
            console.error('Google login error:', error);
            setError('Failed to initialize Google login');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setVerificationMessage('');
        setLoading(true);

        try {
            await login(email, password);
            navigate('/dashboard');
        } catch (err) {
            if (err.response?.status === 403 && err.response?.data?.message === 'Email not verified.') {
                setError(
                    <div>
                        Email not verified. <br />
                        <button 
                            type="button" 
                            className="text-btn" 
                            onClick={async () => {
                                try {
                                    // Login temporarily to send verification? No, we can't login.
                                    // We need a way to resend verification without being logged in or login partially.
                                    // Usually, we just tell them to check email.
                                    // Or we can provide a resend endpoint that takes email.
                                    // For now, simple message.
                                    alert('Please check your email for the verification link.');
                                } catch (e) {
                                    alert('Failed to resend email');
                                }
                            }}
                        >
                            Check your inbox
                        </button>
                    </div>
                );
            } else {
                setError(err.response?.data?.message || 'Login failed');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-box">
                <h1>Team Manage</h1>
                <h2>Login</h2>
                {verificationMessage && <div className="success-message">{verificationMessage}</div>}
                {error && <div className="error-message">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </div>
                    <button type="submit" disabled={loading}>
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>

                <div className="divider">
                    <span>OR</span>
                </div>

                <button 
                    type="button" 
                    className="google-btn" 
                    onClick={handleGoogleLogin}
                    disabled={loading}
                >
                    <img src="https://www.google.com/favicon.ico" alt="Google" width="18" height="18" />
                    Login with Google
                </button>

                <p>
                    Don't have an account? <Link to="/register">Register here</Link>
                </p>
            </div>
        </div>
    );
};

export default Login;
