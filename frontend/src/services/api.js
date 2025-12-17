import axios from 'axios';
import { navigate } from './navigation';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
const API_BASE = API_URL.replace(/\/+api\/?$/, '');

let token = localStorage.getItem('token');

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    },
});

// Request interceptor to add token
api.interceptors.request.use(
    (config) => {
        token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            const navigated = navigate('/login');
            if (!navigated) {
                // Fallback for cases where the router hasn't been initialized
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export const getBaseUrl = () => API_BASE;
export const getStorageBase = () => `${API_BASE}/storage`;
export const getStorageUrl = (relativePath = '') => {
    const path = String(relativePath || '').replace(/^\/+/, '');
    return `${getStorageBase()}/${path}`;
};

export default api;
