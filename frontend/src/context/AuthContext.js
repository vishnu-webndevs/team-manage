import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            fetchUser();
        } else {
            setLoading(false);
        }
    }, []);

    const fetchUser = async () => {
        try {
            const response = await authService.getMe();
            setUser(response.data);
            setIsAuthenticated(true);
        } catch (error) {
            localStorage.removeItem('token');
            setIsAuthenticated(false);
        } finally {
            setLoading(false);
        }
    };

    const hasRole = (role) => {
        if (!user) return false;
        if (!user.roles) return false;
        return user.roles.some(r => r.name === role);
    };

    const isAdminOrPM = () => {
        return hasRole('admin') || hasRole('project_manager');
    };

    const login = async (email, password) => {
        try {
            const response = await authService.login({ email, password });
            localStorage.setItem('token', response.data.token);
            setUser(response.data.user);
            setIsAuthenticated(true);
            return response.data;
        } catch (error) {
            throw error;
        }
    };

    const register = async (name, email, password, passwordConfirmation) => {
        try {
            const response = await authService.register({
                name,
                email,
                password,
                password_confirmation: passwordConfirmation,
            });
            localStorage.setItem('token', response.data.token);
            setUser(response.data.user);
            setIsAuthenticated(true);
            return response.data;
        } catch (error) {
            throw error;
        }
    };

    const loginWithToken = (token) => {
        localStorage.setItem('token', token);
        setIsAuthenticated(true);
        fetchUser();
    };

    const logout = async () => {
        try {
            await authService.logout();
        } finally {
            localStorage.removeItem('token');
            setUser(null);
            setIsAuthenticated(false);
        }
    };

    const refreshUser = async () => {
        await fetchUser();
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                isAuthenticated,
                login,
                loginWithToken,
                register,
                logout,
                hasRole,
                isAdminOrPM,
                refreshUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
