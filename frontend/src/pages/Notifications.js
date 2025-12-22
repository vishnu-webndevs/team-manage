import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { notificationService } from '../services';
import { format } from 'date-fns';
import '../styles/notifications.css';

const Notifications = () => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        fetchNotifications();
    }, [page]);

    const fetchNotifications = async () => {
        try {
            const response = await notificationService.getNotifications(page);
            const newNotifications = response.data.data;
            
            if (page === 1) {
                setNotifications(newNotifications);
            } else {
                setNotifications(prev => [...prev, ...newNotifications]);
            }
            
            setHasMore(response.data.next_page_url !== null);
        } catch (error) {
        // console.errorror('Failed to fetch notifications', error);
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAsRead = async (id) => {
        try {
            await notificationService.markAsRead(id);
            setNotifications(notifications.map(n => 
                n.id === id ? { ...n, read_at: new Date().toISOString() } : n
            ));
        } catch (error) {
            // console.error('Failed to mark as read', error);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await api.post('/notifications/mark-all-read');
            setNotifications(notifications.map(n => ({ ...n, read_at: new Date().toISOString() })));
        } catch (error) {
            // console.error('Failed to mark all as read', error);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this notification?')) return;
        try {
            await api.delete(`/notifications/${id}`);
            setNotifications(notifications.filter(n => n.id !== id));
        } catch (error) {
            // console.error('Failed to delete notification', error);
        }
    };

    return (
        <div className="notifications-page">
            <div className="notifications-header">
                <h1>Notifications</h1>
                <button onClick={handleMarkAllAsRead} className="btn-mark-all">
                    Mark All as Read
                </button>
            </div>

            <div className="notifications-list">
                {notifications.length === 0 && !loading ? (
                    <div className="no-notifications">No notifications found</div>
                ) : (
                    notifications.map(notification => (
                        <div key={notification.id} className={`notification-item ${notification.read_at ? 'read' : 'unread'}`}>
                            <div className="notification-content">
                                <p className="notification-message">
                                    {notification.title && <strong>{notification.title}: </strong>}
                                    {notification.message || notification.data?.message || 'New Notification'}
                                </p>
                                <span className="notification-time">
                                    {format(new Date(notification.created_at), 'MMM d, yyyy h:mm a')}
                                </span>
                            </div>
                            <div className="notification-actions">
                                {!notification.read_at && (
                                    <button 
                                        onClick={() => handleMarkAsRead(notification.id)}
                                        className="btn-read"
                                        title="Mark as read"
                                    >
                                        ✓
                                    </button>
                                )}
                                <button 
                                    onClick={() => handleDelete(notification.id)}
                                    className="btn-delete"
                                    title="Delete"
                                    style={{ marginLeft: '10px', color: 'red' }}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {loading && <div className="loading">Loading...</div>}
            
            {hasMore && !loading && (
                <button onClick={() => setPage(prev => prev + 1)} className="btn-load-more">
                    Load More
                </button>
            )}
        </div>
    );
};

export default Notifications;
