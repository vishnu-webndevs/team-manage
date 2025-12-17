import React, { useState, useEffect, useRef } from 'react';
import { chatService, messageService, teamService, authService } from '../services';
import '../styles/chat.css';

export const Chat = () => {
    const [chatGroups, setChatGroups] = useState([]);
    const [selectedChat, setSelectedChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [teams, setTeams] = useState([]);
    const [members, setMembers] = useState([]);
    const [directRecipientId, setDirectRecipientId] = useState('');
    const [currentUser, setCurrentUser] = useState(null);
    const [replyTo, setReplyTo] = useState(null);
    const [editMessageId, setEditMessageId] = useState(null);
    const [editText, setEditText] = useState('');
    const [openMenuId, setOpenMenuId] = useState(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const prevScrollHeightRef = useRef(0);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        team_id: '',
        is_group: true,
    });
    const messagesRef = useRef(null);
    const privKeyRef = useRef(null);
    const pubKeyRef = useRef(null);

    const ab2b64 = (buf) => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    };
    const b642ab = (b64) => {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    };
    const exportSpki = (key) => window.crypto.subtle.exportKey('spki', key).then(ab2b64);
    const importSpki = (b64) => window.crypto.subtle.importKey('spki', b642ab(b64), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    const exportJwk = (key) => window.crypto.subtle.exportKey('jwk', key);
    const importJwk = (jwk) => window.crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    const deriveAesKey = (privateKey, publicKey) => window.crypto.subtle.deriveKey({ name: 'ECDH', public: publicKey }, privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const encryptText = async (text, aesKey) => {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder().encode(text);
        const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc);
        return { v: 1, t: 'dm-e2ee', iv: ab2b64(iv.buffer), ct: ab2b64(ct) };
    };
    const decryptPayload = async (payload, aesKey) => {
        const iv = new Uint8Array(b642ab(payload.iv));
        const ct = b642ab(payload.ct);
        const pt = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
        return new TextDecoder().decode(pt);
    };
    const parseBioKey = (bio) => {
        try {
            const o = typeof bio === 'string' ? JSON.parse(bio) : null;
            if (o && o.e2ee_pub_spki) return o.e2ee_pub_spki;
        } catch {}
        return null;
    };
    const ensureKeyPair = async (me) => {
        try {
            const storedPriv = localStorage.getItem('e2ee_priv_jwk');
            const storedPub = localStorage.getItem('e2ee_pub_spki');
            if (storedPriv && storedPub) {
                privKeyRef.current = await importJwk(JSON.parse(storedPriv));
                pubKeyRef.current = await importSpki(storedPub);
            } else {
                const pair = await window.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
                privKeyRef.current = pair.privateKey;
                pubKeyRef.current = pair.publicKey;
                const jwk = await exportJwk(pair.privateKey);
                const spki = await exportSpki(pair.publicKey);
                localStorage.setItem('e2ee_priv_jwk', JSON.stringify(jwk));
                localStorage.setItem('e2ee_pub_spki', spki);
                const bioObj = me?.bio && (() => { try { return JSON.parse(me.bio); } catch { return null; } })();
                const newBio = JSON.stringify({ ...(bioObj || {}), e2ee_pub_spki: spki });
                await authService.updateMe({ bio: newBio });
            }
        } catch {}
    };

    useEffect(() => {
        fetchChatGroups();
        fetchTeams();
        authService.getCurrentUser().then(async (u) => { setCurrentUser(u); await ensureKeyPair(u); }).catch(() => {});
        try {
            document.body.classList.add('chat-mode');
        } catch {}
        return () => {
            try {
                document.body.classList.remove('chat-mode');
            } catch {}
        };
    }, []);

    useEffect(() => {
        if (selectedChat) {
            fetchMessages();
            const interval = setInterval(() => fetchMessages(1, true), 2000);
            return () => clearInterval(interval);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedChat]);

    useEffect(() => {
        if (messagesRef.current) {
            if (prevScrollHeightRef.current > 0) {
                const newHeight = messagesRef.current.scrollHeight;
                messagesRef.current.scrollTop = newHeight - prevScrollHeightRef.current;
                prevScrollHeightRef.current = 0;
            } else if (page === 1) {
                messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
            }
        }
    }, [messages, page]);

    const processMessages = async (msgs) => {
        if (!selectedChat || selectedChat.is_group) return msgs;
        
        const other = (selectedChat.members || []).find(m => m.id !== currentUser?.id);
        if (!other) return msgs;

        const otherPubB64 = parseBioKey(other.bio);
        if (!otherPubB64 || !privKeyRef.current) return msgs;

        try {
            const otherPub = await importSpki(otherPubB64);
            const aes = await deriveAesKey(privKeyRef.current, otherPub);
            
            return await Promise.all(msgs.map(async (msg) => {
                try {
                    let content = msg.content;
                    if (typeof content === 'string' && content.startsWith('{')) {
                        const parsed = JSON.parse(content);
                        if (parsed.v === 1 && parsed.t === 'dm-e2ee') {
                            const decrypted = await decryptPayload(parsed, aes);
                            const body = JSON.parse(decrypted);
                            return { ...msg, _text: body.text, _reply: body.rp, _decrypted: true };
                        } else if (parsed.t === 'text') {
                             return { ...msg, _text: parsed.text, _reply: parsed.rp };
                        }
                    }
                } catch (e) {
                    // console.error('Decryption failed for msg', msg.id, e);
                }
                return msg;
            }));
        } catch (e) {
            console.error('Key derivation failed', e);
            return msgs;
        }
    };

    const fetchChatGroups = async () => {
        try {
            const response = await chatService.getChatGroups();
            setChatGroups(response.data.data);
        } catch (error) {
            console.error('Failed to fetch chat groups', error);
        }
    };

    const fetchMessages = async (pageNum = 1, isPolling = false) => {
        if (!selectedChat) return;
        if (pageNum > 1) setIsHistoryLoading(true);
        
        try {
            const response = await messageService.getMessages(selectedChat.id, { page: pageNum });
            let list = (response.data.data || []).reverse();
            
            if (pageNum > 1 && list.length === 0) {
                setHasMore(false);
                setIsHistoryLoading(false);
                return;
            }

            list = await processMessages(list);

            setMessages(prev => {
                const map = new Map();
                // If polling (page 1), merge with existing
                if (isPolling) {
                    prev.forEach(m => map.set(m.id, m));
                    list.forEach(m => map.set(m.id, m));
                } else if (pageNum === 1) {
                     // Initial load (replace)
                     list.forEach(m => map.set(m.id, m));
                } else {
                    // Loading history (prepend)
                    list.forEach(m => map.set(m.id, m));
                    prev.forEach(m => map.set(m.id, m));
                }
                
                return Array.from(map.values()).sort((a,b) => a.id - b.id);
            });
            
            if (!isPolling && pageNum > 1) {
                setPage(pageNum);
            }
        } catch (error) {
            console.error('Failed to fetch messages', error);
        } finally {
            if (pageNum > 1) setIsHistoryLoading(false);
        }
    };

    const handleScroll = (e) => {
        if (e.target.scrollTop === 0 && hasMore && !loading && !isHistoryLoading) {
            prevScrollHeightRef.current = e.target.scrollHeight;
            fetchMessages(page + 1);
        }
    };

    const fetchTeams = async () => {
        try {
            const response = await teamService.getTeams();
            const teamsData = response.data.data || [];
            setTeams(teamsData);
            // Build unique members list across teams
            const allMembers = teamsData.flatMap(t => t.members || []);
            const uniqueMembers = [];
            const seen = new Set();
            for (const m of allMembers) {
                if (!seen.has(m.id)) {
                    seen.add(m.id);
                    uniqueMembers.push(m);
                }
            }
            setMembers(uniqueMembers);
        } catch (error) {
            console.error('Failed to fetch teams', error);
        }
    };

    const findSharedTeamId = (userAId, userBId) => {
        for (const team of teams) {
            const memberIds = (team.members || []).map(m => m.id);
            if (memberIds.includes(userAId) && memberIds.includes(userBId)) {
                return team.id;
            }
        }
        // Fallback: use any team of current user
        for (const team of teams) {
            const memberIds = (team.members || []).map(m => m.id);
            if (memberIds.includes(userAId)) return team.id;
        }
        return '';
    };

    const openDirectMessage = async (recipientId) => {
        if (!recipientId || !currentUser) return;
        // Try to find existing DM chat group (is_group === false) containing both users
        const dm = chatGroups.find(cg => cg.is_group === false && Array.isArray(cg.members) && cg.members.some(m => m.id === recipientId));
        if (dm) {
            setSelectedChat(dm);
            setDirectRecipientId(recipientId);
            await fetchMessages();
            return;
        }
        // Create DM chat group
        const teamId = findSharedTeamId(currentUser.id, parseInt(recipientId));
        if (!teamId) {
            alert('No common team found to start a direct chat');
            return;
        }
        try {
            const created = await chatService.createChatGroup({
                team_id: teamId,
                name: `DM: ${currentUser.name}`,
                description: '',
                is_group: false,
                member_ids: [parseInt(recipientId)],
            });
            const newGroup = created.data?.chat_group || created.data; // handle possible shapes
            await fetchChatGroups();
            if (newGroup) {
                setSelectedChat(newGroup);
                setDirectRecipientId(recipientId);
                await fetchMessages();
            }
        } catch (error) {
            console.error('Failed to create DM chat group', error);
            alert(error.response?.data?.message || 'Failed to start direct message');
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        // If a direct recipient is selected, ensure DM chat group is opened/created
        if (directRecipientId) {
            if (!selectedChat || selectedChat.is_group) {
                await openDirectMessage(directRecipientId);
            }
        }
        if (!selectedChat) return;

        setLoading(true);
        try {
            const isDM = selectedChat && selectedChat.is_group === false;
            const preview = (msg) => {
                const txt = (msg._text || msg.content || '').toString();
                return txt.length > 80 ? txt.slice(0, 80) + '…' : txt;
            };
            const bodyObj = {
                t: 'text',
                text: newMessage,
                rp: replyTo ? { id: replyTo.id, sender: replyTo.sender?.name, text: preview(replyTo) } : null,
            };
            let payload = JSON.stringify(bodyObj);
            if (isDM) {
                const other = (selectedChat.members || []).find(m => m.id !== currentUser?.id);
                const otherPubB64 = parseBioKey(other?.bio);
                if (!privKeyRef.current || !otherPubB64) {
                    alert('Encryption not set up yet. Ask the recipient to open Chat once to initialize keys.');
                    setLoading(false);
                    return;
                }
                const otherPub = await importSpki(otherPubB64);
                const aes = await deriveAesKey(privKeyRef.current, otherPub);
                const enc = await encryptText(JSON.stringify(bodyObj), aes);
                payload = JSON.stringify(enc);
            }
            await messageService.sendMessage(selectedChat.id, { content: payload });
            setNewMessage('');
            setReplyTo(null);
            await fetchMessages();
        } catch (error) {
            console.error('Failed to send message', error);
        } finally {
            setLoading(false);
        }
    };

    const startReply = (msg) => setReplyTo(msg);
    const cancelReply = () => setReplyTo(null);
    const startEdit = (msg) => {
        if (msg.sender?.id !== currentUser?.id) return;
        setEditMessageId(msg.id);
        setEditText(msg._text || msg.content || '');
    };
    const cancelEdit = () => { setEditMessageId(null); setEditText(''); };
    const submitEdit = async () => {
        if (!editMessageId || !selectedChat) return;
        setLoading(true);
        try {
            const isDM = selectedChat && selectedChat.is_group === false;
            // Preserve reply metadata if present
            const original = messages.find(m => m.id === editMessageId);
            const bodyObj = {
                t: 'text',
                text: editText,
                rp: original?._reply || null,
            };
            let payload = JSON.stringify(bodyObj);
            if (isDM) {
                const other = (selectedChat.members || []).find(m => m.id !== currentUser?.id);
                const otherPubB64 = parseBioKey(other?.bio);
                const otherPub = await importSpki(otherPubB64);
                const aes = await deriveAesKey(privKeyRef.current, otherPub);
                const enc = await encryptText(JSON.stringify(bodyObj), aes);
                payload = JSON.stringify(enc);
            }
            await messageService.editMessage(editMessageId, { content: payload });
            cancelEdit();
            await fetchMessages();
        } catch (e) {
            console.error('Failed to edit message', e);
        } finally {
            setLoading(false);
        }
    };
    const deleteMsg = async (id) => {
        setLoading(true);
        try { await messageService.deleteMessage(id); await fetchMessages(); } catch (e) { console.error('Delete failed', e);} finally { setLoading(false);} 
    };

    const getChatTitle = (chat) => {
        if (!chat) return '';
        if (chat.is_group === false) {
            const other = (chat.members || []).find(m => m.id !== currentUser?.id);
            return other?.name || chat.name || 'Direct Message';
        }
        return chat.name;
    };
    const getChatSubtitle = (chat) => {
        if (!chat) return '';
        if (chat.is_group === false) return '';
        const count = chat.members?.length || 0;
        return `${count} members`;
    };

    const handleCreateChat = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const currentUser = await authService.getCurrentUser();
            await chatService.createChatGroup({
                ...formData,
                member_ids: [currentUser.id],
            });
            setFormData({ name: '', description: '', team_id: '', is_group: true });
            setShowCreateForm(false);
            await fetchChatGroups();
        } catch (error) {
            console.error('Failed to create chat group', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="chat-container">
            <div className="chat-sidebar">
                <div className="sidebar-header">
                    <h2>Chats</h2>
                    <button onClick={() => setShowCreateForm(!showCreateForm)}>+</button>
                </div>

                <div className="dm-select">
                    <select
                        value={directRecipientId}
                        onChange={(e) => {
                            const val = e.target.value;
                            setDirectRecipientId(val);
                            if (val) openDirectMessage(val);
                        }}
                    >
                        <option value="">Direct message a user</option>
                        {members
                            .filter(m => m.id !== currentUser?.id)
                            .map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                </div>

                {showCreateForm && (
                    <form onSubmit={handleCreateChat} className="create-chat-form">
                        <div className="form-group">
                            <select
                                value={formData.team_id}
                                onChange={(e) => setFormData({ ...formData, team_id: e.target.value })}
                                required
                            >
                                <option value="">Select team</option>
                                {teams.map((team) => (
                                    <option key={team.id} value={team.id}>{team.name}</option>
                                ))}
                            </select>
                        </div>
                        <input
                            type="text"
                            placeholder="Group Name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                        <textarea
                            placeholder="Description (optional)"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={3}
                        />
                        <button type="submit" disabled={loading}>
                            Create
                        </button>
                    </form>
                )}

                <div className="chat-list">
                    {chatGroups.map((chat) => (
                        <div
                            key={chat.id}
                            className={`chat-item ${selectedChat?.id === chat.id ? 'active' : ''}`}
                            onClick={() => setSelectedChat(chat)}
                        >
                            <h4>{getChatTitle(chat)}</h4>
                            <p>{getChatSubtitle(chat)}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="chat-main">
                {selectedChat ? (
                    <>
                        <div className="chat-header">
                            <h2>{getChatTitle(selectedChat)}</h2>
                            <p>{getChatSubtitle(selectedChat)}</p>
                        </div>

                        <div className="messages-area" ref={messagesRef} onClick={() => setOpenMenuId(null)} onScroll={handleScroll}>
                            {hasMore && (
                                <div className="load-more-history" style={{ textAlign: 'center', padding: '10px', fontSize: '0.8em', color: '#888', cursor: 'pointer' }} onClick={() => {
                                    prevScrollHeightRef.current = messagesRef.current.scrollHeight;
                                    fetchMessages(page + 1);
                                }}>
                                    {isHistoryLoading ? 'Loading history...' : 'Scroll up for more history'}
                                </div>
                            )}
                            {messages.map((message) => {
                                const isOwn = currentUser?.id === message.sender?.id;
                                return (
                                    <div key={message.id} className={`message-row ${isOwn ? 'own' : 'other'}`}>
                                        <div className={`message-bubble ${isOwn ? 'own' : 'other'}`}>
                                            <button
                                                type="button"
                                                className="bubble-menu-trigger"
                                                onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === message.id ? null : message.id); }}
                                            >
                                                ▾
                                            </button>
                                            {openMenuId === message.id && (
                                                <div className="message-menu" onClick={(e) => e.stopPropagation()}>
                                                    <button className="message-menu-item" onClick={() => { startReply(message); setOpenMenuId(null); }}>Reply</button>
                                                    {isOwn && (
                                                        <button className="message-menu-item" onClick={() => { startEdit(message); setOpenMenuId(null); }}>Edit</button>
                                                    )}
                                                    {isOwn && (
                                                        <button className="message-menu-item danger" onClick={() => { deleteMsg(message.id); setOpenMenuId(null); }}>Delete</button>
                                                    )}
                                                </div>
                                            )}
                                            {message._reply && (
                                                <div className="reply-preview">
                                                    <span className="reply-sender">{message._reply.sender || 'Reply'}</span>
                                                    <span className="reply-text">{message._reply.text}</span>
                                                </div>
                                            )}
                                            {!isOwn && selectedChat?.is_group && (
                                                <div className="message-sender">{message.sender?.name}</div>
                                            )}
                                            <div className="message-text">{message.content}</div>
                                            <div className="message-meta">{new Date(message.created_at).toLocaleTimeString()}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <form onSubmit={handleSendMessage} className="message-form">
                            {replyTo && (
                                <div className="reply-bar">
                                    <div>
                                        Replying to {replyTo.sender?.name || 'message'}: {(replyTo._text || replyTo.content || '').slice(0, 60)}
                                    </div>
                                    <button type="button" className="cancel-reply" onClick={cancelReply}>Cancel</button>
                                </div>
                            )}
                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Type a message..."
                            />
                            <button type="submit" disabled={loading || !newMessage.trim()}>
                                Send
                            </button>
                        </form>
                        {editMessageId && (
                            <div className="edit-bar">
                                <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)} placeholder="Edit message" />
                                <div className="edit-actions">
                                    <button className="action-btn" onClick={submitEdit} disabled={loading || !editText.trim()}>Save</button>
                                    <button className="action-btn" onClick={cancelEdit}>Cancel</button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="empty-state">
                        <p>Select a chat from the left, or choose a user from the top left to start a direct message.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Chat;
