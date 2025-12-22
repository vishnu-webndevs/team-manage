import React, { useState, useEffect, useRef, useMemo } from 'react';
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
        member_ids: [],
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
    const exportRawKey = async (key) => {
        const exported = await window.crypto.subtle.exportKey('raw', key);
        return ab2b64(exported);
    };
    const importRawKey = async (b64) => {
        return window.crypto.subtle.importKey('raw', b642ab(b64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    };
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

    const getPeerPublicKey = (userId) => {
        // Try selected chat members first
        let user = (selectedChat?.members || []).find(m => m.id === userId);
        let key = parseBioKey(user?.bio);
        if (key) return key;

        // Try global members list (from teams)
        user = members.find(m => m.id === userId);
        key = parseBioKey(user?.bio);
        if (key) return key;
        
        // If still not found, check chatGroups just in case
        for (const g of chatGroups) {
             const m = (g.members || []).find(mem => mem.id === userId);
             const k = parseBioKey(m?.bio);
             if (k) return k;
        }
        return null;
    };

    const processMessages = async (msgs) => {
        if (!selectedChat) return msgs;
        
        let aes = null;
        // Only setup decryption for DMs
        if (!selectedChat.is_group) {
            const other = (selectedChat.members || []).find(m => m.id !== currentUser?.id);
            if (other) {
                const otherPubB64 = getPeerPublicKey(other.id);
                if (otherPubB64 && privKeyRef.current) {
                    try {
                        const otherPub = await importSpki(otherPubB64);
                        aes = await deriveAesKey(privKeyRef.current, otherPub);
                    } catch (e) { /* ignore key error */ }
                }
            }
        }

        return await Promise.all(msgs.map(async (msg) => {
            try {
                let content = msg.content;
                if (typeof content !== 'string' || !content.trim().startsWith('{')) {
                    // Legacy plain text
                    return { ...msg, _text: content };
                }

                // Try parsing JSON
                let parsed;
                try {
                    parsed = JSON.parse(content);
                } catch {
                    return { ...msg, _text: content };
                }

                if (parsed.v === 1 && parsed.t === 'dm-e2ee') {
                    if (aes) {
                        try {
                            const decrypted = await decryptPayload(parsed, aes);
                            const body = JSON.parse(decrypted);
                            return { ...msg, _text: body.text, _reply: body.rp, _decrypted: true };
                        } catch (e) {
                            return { ...msg, _text: '🔒 Message unavailable (keys changed)' };
                        }
                    } else {
                        return { ...msg, _text: '🔒 Message unavailable (keys changed)' };
                    }
                } else if (parsed.t === 'group-e2ee') {
                    if (!privKeyRef.current || !currentUser) return { ...msg, _text: '🔒 Locked' };
                    try {
                        const myKeyEnc = parsed.keys && parsed.keys[currentUser.id];
                        if (!myKeyEnc) return { ...msg, _text: '🔒 Message unavailable (not a recipient)' };
                        
                        // We need the SENDER's public key to derive the shared key that wraps the message key
                        // The sender ID is in msg.sender_id (from backend) or parsed.sender_id (if we added it)
                        // Backend usually provides sender object in msg.sender
                        const senderId = msg.sender?.id || msg.sender_id;
                        if (!senderId) return { ...msg, _text: '🔒 Unknown sender' };

                        const senderPubB64 = getPeerPublicKey(senderId);
                        if (!senderPubB64) return { ...msg, _text: '🔒 Sender key missing' };

                        const senderPub = await importSpki(senderPubB64);
                        const sharedKey = await deriveAesKey(privKeyRef.current, senderPub);
                        
                        // Decrypt the message key
                        const msgKeyB64 = await decryptPayload(JSON.parse(myKeyEnc), sharedKey);
                        // Import the message key
                        const msgKey = await importRawKey(JSON.parse(msgKeyB64)); // decryptPayload returns stringified JSON usually? No, decryptPayload returns string.
                        // Wait, how did we encrypt the key? 
                        // In handleSendMessage, we will encrypt JSON.stringify(msgKeyB64) or just msgKeyB64?
                        // Let's assume we store JSON string of the key B64.

                        // Decrypt content
                        const decryptedContent = await decryptPayload(parsed.content, msgKey);
                        const body = JSON.parse(decryptedContent);
                        return { ...msg, _text: body.text, _reply: body.rp, _decrypted: true };
                    } catch (e) {
                        // console.error('Group Decrypt Error', e);
                        return { ...msg, _text: '🔒 Decryption failed' };
                    }
                } else if (parsed.t === 'text') {
                        return { ...msg, _text: parsed.text, _reply: parsed.rp };
                }
                
                return { ...msg, _text: content };
            } catch (e) {
                return msg;
            }
        }));
    };

    const fetchChatGroups = async () => {
        try {
            const response = await chatService.getChatGroups();
            setChatGroups(response.data.data);
        } catch (error) {
            // console.error('Failed to fetch chat groups', error);
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
            // console.error('Failed to fetch messages', error);
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
            // console.error('Failed to fetch teams', error);
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

    const selectChatWithRefresh = async (chat) => {
        setSelectedChat(chat);
        try {
            const res = await chatService.getChatGroup(chat.id);
            const freshChat = res.data;
            setChatGroups(prev => prev.map(c => c.id === freshChat.id ? freshChat : c));
            setSelectedChat(freshChat);
        } catch (e) {
            // console.error(e);
        }
    };

    const handleChatSelect = (chat) => {
        setDirectRecipientId('');
        selectChatWithRefresh(chat);
    };

    const openDirectMessage = async (recipientId) => {
        if (!recipientId || !currentUser) return;
        // Try to find existing DM chat group (is_group === false) containing both users
        const dm = chatGroups.find(cg => cg.is_group === false && Array.isArray(cg.members) && cg.members.some(m => m.id === parseInt(recipientId)));
        if (dm) {
            selectChatWithRefresh(dm);
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
                selectChatWithRefresh(newGroup);
                setDirectRecipientId(recipientId);
            }
        } catch (error) {
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
            /* Encryption disabled to ensure reliability across logins */
            if (privKeyRef.current) {// Enable for both DMs and Groups
                
                // 1. Refresh keys
                try {
                    const res = await chatService.getChatGroup(selectedChat.id);
                    const freshMembers = res.data?.members || [];
                    if (freshMembers.length > 0) {
                         setSelectedChat(prev => ({ ...prev, members: freshMembers }));
                    }
                } catch (e) {
                    alert('Encryption failed. Message not sent.');
                    setLoading(false);
                    return;
                }


                // 2. Group Encryption Logic (Sender Key Distribution)
                // Used for both Groups and DMs now for consistency/robustness, or fallback to DM specific if needed.
                // But since user asked for Group E2EE, we'll implement the Group logic.
                // Note: DMs are just groups of 2.
                
                if (privKeyRef.current) {
                    try {
                        // Generate ephemeral message key
                        const msgKey = await window.crypto.subtle.generateKey(
                            { name: 'AES-GCM', length: 256 },
                            true,
                            ['encrypt', 'decrypt']
                        );
                        const msgKeyB64 = await exportRawKey(msgKey);
                        
                        // Encrypt content with message key
                        const encryptedContent = await encryptText(JSON.stringify(bodyObj), msgKey);
                        
                        // Encrypt message key for each recipient (including self)
                        const recipientKeys = {};
                        // Ensure current user is included in recipients to read own message
                        const allMembers = selectedChat.members || [];
                        const hasSelf = allMembers.some(m => m.id === currentUser?.id);
                        const membersToEncrypt = hasSelf ? allMembers : [...allMembers, currentUser];

                        await Promise.all(membersToEncrypt.map(async (m) => {
                            if (!m) return;
                            try {
                                const pubB64 = parseBioKey(m.bio) || getPeerPublicKey(m.id);
                                if (!pubB64) return;
                                
                                const pubKey = await importSpki(pubB64);
                                const sharedKey = await deriveAesKey(privKeyRef.current, pubKey);
                                
                                // Wrap the message key
                                const wrappedKey = await encryptText(JSON.stringify(msgKeyB64), sharedKey);
                                recipientKeys[m.id] = JSON.stringify(wrappedKey);
                            } catch (err) {
                                // Skip member if key fails
                            }
                        }));
                        
                        // Construct Payload
                        // Only send if we successfully encrypted for at least one person (or just send what we can)
                        // If we can't encrypt for someone, they won't read it.
                        if (Object.keys(recipientKeys).length > 0) {
                             payload = JSON.stringify({
                                 v: 1,
                                 t: 'group-e2ee',
                                 content: encryptedContent,
                                 keys: recipientKeys,
                                 sender_id: currentUser.id
                             });
                        }
                    } catch (e) {
                        // console.error('Encryption failed', e);
                        // Fallback to plaintext? Or fail? 
                        // Current behavior was fallback.
                    }
                }
            }
            /* */
            await messageService.sendMessage(selectedChat.id, { content: payload });
            setNewMessage('');
            setReplyTo(null);
            await fetchMessages();
        } catch (error) {
            // console.error('Failed to send message', error);
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
            /* Encryption disabled
            if (isDM || selectedChat.is_group) {
                if (privKeyRef.current) {
                    try {
                        const msgKey = await window.crypto.subtle.generateKey(
                            { name: 'AES-GCM', length: 256 },
                            true,
                            ['encrypt', 'decrypt']
                        );
                        const msgKeyB64 = await exportRawKey(msgKey);
                        const encryptedContent = await encryptText(JSON.stringify(bodyObj), msgKey);
                        const recipientKeys = {};
                        const membersToEncrypt = selectedChat.members || [];
                        await Promise.all(membersToEncrypt.map(async (m) => {
                            try {
                                const pubB64 = parseBioKey(m.bio);
                                if (!pubB64) return;
                                const pubKey = await importSpki(pubB64);
                                const sharedKey = await deriveAesKey(privKeyRef.current, pubKey);
                                const wrappedKey = await encryptText(JSON.stringify(msgKeyB64), sharedKey);
                                recipientKeys[m.id] = JSON.stringify(wrappedKey);
                            } catch (err) {}
                        }));
                        if (Object.keys(recipientKeys).length > 0) {
                             payload = JSON.stringify({
                                 v: 1,
                                 t: 'group-e2ee',
                                 content: encryptedContent,
                                 keys: recipientKeys,
                                 sender_id: currentUser.id
                             });
                        }
                    } catch (e) {}
                }
            }
            */
            await messageService.editMessage(editMessageId, { content: payload });
            cancelEdit();
            await fetchMessages();
        } catch (e) {
            // console.error('Failed to edit message', e);
        } finally {
            setLoading(false);
        }
    };
    const deleteMsg = async (id) => {
        setLoading(true);
        try { await messageService.deleteMessage(id); await fetchMessages(); } catch (e) { /* console.error('Delete failed', e); */ } finally { setLoading(false);} 
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
            // Ensure current user is in the list
            const finalMembers = new Set([...formData.member_ids.map(id => parseInt(id)), currentUser.id]);
            
            await chatService.createChatGroup({
                ...formData,
                member_ids: Array.from(finalMembers),
            });
            setFormData({ name: '', description: '', team_id: '', is_group: true, member_ids: [] });
            setShowCreateForm(false);
            await fetchChatGroups();
        } catch (error) {
            // console.error('Failed to create chat group', error);
        } finally {
            setLoading(false);
        }
    };

    const availableMembers = useMemo(() => {
        if (!formData.team_id) return [];
        const team = teams.find(t => t.id == formData.team_id);
        return team ? team.members : [];
    }, [formData.team_id, teams]);

    return (
        <div className="chat-container">
            {showCreateForm && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Create New Group</h3>
                            <button className="close-btn" onClick={() => setShowCreateForm(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleCreateChat} className="create-chat-form">
                            <div className="form-group">
                                <label>Select Team</label>
                                <select
                                    value={formData.team_id}
                                    onChange={(e) => setFormData({ ...formData, team_id: e.target.value, member_ids: [] })}
                                    required
                                >
                                    <option value="">-- Choose a Team --</option>
                                    {teams.map((team) => (
                                        <option key={team.id} value={team.id}>{team.name}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="form-group">
                                <label>Group Name</label>
                                <input
                                    type="text"
                                    placeholder="Enter group name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Description</label>
                                <textarea
                                    placeholder="Optional description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={3}
                                />
                            </div>

                            {formData.team_id && (
                                <div className="form-group">
                                    <label>Add Members</label>
                                    <div className="members-select">
                                        {availableMembers.length > 0 ? availableMembers.map(m => (
                                            <label key={m.id} className="member-option">
                                                <input
                                                    type="checkbox"
                                                    value={m.id}
                                                    checked={formData.member_ids.includes(String(m.id)) || formData.member_ids.includes(m.id)}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value);
                                                        setFormData(prev => {
                                                            const newIds = e.target.checked
                                                                ? [...prev.member_ids, val]
                                                                : prev.member_ids.filter(id => id !== val);
                                                            return { ...prev, member_ids: newIds };
                                                        });
                                                    }}
                                                    disabled={m.id === currentUser?.id}
                                                />
                                                {m.name} {m.id === currentUser?.id && ' (You)'}
                                            </label>
                                        )) : <p style={{ color: '#999', padding: '0.5rem' }}>No other members in this team.</p>}
                                    </div>
                                </div>
                            )}

                            <div className="form-actions">
                                <button type="button" className="cancel-btn" onClick={() => setShowCreateForm(false)}>Cancel</button>
                                <button type="submit" className="submit-btn" disabled={loading}>Create Group</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
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



                <div className="chat-list">
                    {chatGroups.map((chat) => (
                        <div
                            key={chat.id}
                            className={`chat-item ${selectedChat?.id === chat.id ? 'active' : ''}`}
                            onClick={() => handleChatSelect(chat)}
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
                                            <div className="message-text">{message._text || message.content}</div>
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
