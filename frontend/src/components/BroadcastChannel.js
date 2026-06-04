import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000";

// ==================== BROADCAST CHANNEL LIST ====================
function ChannelList({ channels, onSelectChannel, selectedChannelId, profile }) {
  const isAdmin = profile?.role === 'club_admin';

  return (
    <div className="bc-channel-list">
      <div className="bc-channel-list-header">
        <div className="bc-channel-list-title">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>Channels</span>
        </div>
      </div>
      <div className="bc-channel-items">
        {channels.map(channel => (
          <button
            key={channel.id}
            className={`bc-channel-item ${selectedChannelId === channel.id ? 'active' : ''}`}
            onClick={() => onSelectChannel(channel)}
          >
            <div className="bc-channel-avatar">
              {channel.club_code?.charAt(0) || '?'}
            </div>
            <div className="bc-channel-info">
              <div className="bc-channel-name">
                {channel.club_name}
                {isAdmin && profile?.club_id === channel.id && (
                  <span className="bc-admin-badge">Admin</span>
                )}
              </div>
              <div className="bc-channel-preview">
                {channel.last_message_preview
                  ? (channel.last_message_preview.length > 45
                    ? channel.last_message_preview.substring(0, 45) + '...'
                    : channel.last_message_preview)
                  : 'No messages yet'}
              </div>
            </div>
            <div className="bc-channel-meta-right">
              {channel.last_message_at && (
                <span className="bc-channel-time">
                  {formatTime(channel.last_message_at)}
                </span>
              )}
              <span className="bc-channel-members">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                {channel.subscriber_count || 0}
              </span>
            </div>
          </button>
        ))}
        {channels.length === 0 && (
          <div className="bc-empty-channels">
            <span style={{ fontSize: '2rem', opacity: 0.4 }}>📡</span>
            <p>No channels available</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== CHAT VIEW ====================
function ChatView({ channel, messages, profile, onSendMessage, onDeleteMessage, onToggleSubscribe, onReactMessage, onBack }) {
  const [messageText, setMessageText] = useState('');
  const [messageType, setMessageType] = useState('text');
  const [isUrgent, setIsUrgent] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const sendingRef = useRef(false);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState(null);

  const isAdmin = profile?.role === 'club_admin' && profile?.club_id === channel?.id;
  const isCoordinator = profile?.email === 'bigbossssz550@gmail.com';
  const canPost = isAdmin || isCoordinator;

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  function handleImageSelect(e) {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File too large. Max 10MB.');
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if ((!messageText.trim() && !imageFile) || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    try {
      await onSendMessage({
        content: messageText.trim(),
        message_type: messageType,
        is_urgent: isUrgent,
        link_url: linkUrl.trim() || null,
        image: imageFile
      });
      setMessageText('');
      setLinkUrl('');
      setIsUrgent(false);
      setMessageType('text');
      setImageFile(null);
      setImagePreview(null);
      setShowLinkInput(false);
    } catch (err) {
      alert('Failed to send message');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function handleReact(messageId, emoji) {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/broadcast/messages/${messageId}/react`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ emoji })
      });
      const data = await res.json();
      if (data.ok) {
        onReactMessage(messageId, data.reactions);
      }
    } catch (err) {
      console.error('Error reacting:', err);
    }
    setActiveReactionPickerId(null);
  }

  if (!channel) {
    return (
      <div className="bc-chat-empty">
        <div className="bc-chat-empty-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <h3>Select a channel</h3>
        <p>Choose a broadcast channel to view messages</p>
      </div>
    );
  }

  return (
    <div className="bc-chat-view">
      {/* Chat Header */}
      <div className="bc-chat-header">
        <button className="bc-back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <div className="bc-chat-header-avatar">
          {channel.club_code?.charAt(0) || '?'}
        </div>
        <div className="bc-chat-header-info">
          <h3>{channel.club_name}</h3>
          <span>{channel.subscriber_count || 0} subscribers</span>
        </div>
        <button
          className={`bc-subscribe-btn ${channel.is_subscribed ? 'subscribed' : ''}`}
          onClick={onToggleSubscribe}
        >
          {channel.is_subscribed ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Joined
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              Join
            </>
          )}
        </button>
      </div>

      {/* Messages Area */}
      <div className="bc-messages-area">
        {/* Channel info card at top */}
        <div className="bc-channel-info-card">
          <div className="bc-info-card-icon">📡</div>
          <h3>{channel.club_name} Broadcast</h3>
          <p>Only admins can send messages. Join to receive notifications about important updates, events, and announcements.</p>
        </div>

        {messages.map((msg) => (
          <div key={msg.id} className={`bc-message ${msg.is_urgent ? 'urgent' : ''}`}>
            <div className="bc-message-avatar">
              {msg.sender_avatar ? (
                <img src={msg.sender_avatar} alt="" />
              ) : (
                (msg.sender_name?.charAt(0) || '?')
              )}
            </div>
            <div className="bc-message-body">
              <div className="bc-message-header">
                <span className="bc-message-sender">{msg.sender_name || msg.sender_email}</span>
                {msg.is_urgent && <span className="bc-urgent-tag">🔴 URGENT</span>}
                <div className="bc-msg-actions-group">
                  <span className="bc-message-time">{formatDateTime(msg.created_at)}</span>
                  <button className="bc-react-trigger-btn" onClick={() => setActiveReactionPickerId(activeReactionPickerId === msg.id ? null : msg.id)} title="React with emoji">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                  </button>
                  {canPost && (
                    <button className="bc-message-delete" onClick={() => onDeleteMessage(msg.id)} title="Delete message">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  )}
                </div>
              </div>
              {msg.content && (
                <div className="bc-message-content">
                  {renderMessageContent(msg.content)}
                </div>
              )}
              {msg.image_url && (
                <div className="bc-message-image">
                  {msg.image_url.startsWith('data:video/') ? (
                    <video src={msg.image_url} controls style={{ maxWidth: '100%', borderRadius: '12px' }} />
                  ) : (
                    <img src={msg.image_url} alt="broadcast media" />
                  )}
                </div>
              )}
              {msg.link_url && (
                <a className="bc-message-link" href={msg.link_url} target="_blank" rel="noopener noreferrer">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                  {msg.link_url.length > 50 ? msg.link_url.substring(0, 50) + '...' : msg.link_url}
                </a>
              )}

              {activeReactionPickerId === msg.id && (
                <div className="bc-reaction-picker">
                  {['❤️', '👍', '😂', '😮', '😢', '🙏'].map(emoji => (
                    <button key={emoji} className="bc-reaction-emoji-btn" onClick={() => handleReact(msg.id, emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Message Reactions display */}
              {msg.reactions && msg.reactions.length > 0 && (
                <div className="bc-msg-reactions">
                  {Object.entries(
                    msg.reactions.reduce((acc, r) => {
                      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                      return acc;
                    }, {})
                  ).map(([emoji, count]) => {
                    const hasReacted = msg.reactions.some(r => r.user_email === profile?.email && r.emoji === emoji);
                    return (
                      <button
                        key={emoji}
                        className={`bc-reaction-pill ${hasReacted ? 'active' : ''}`}
                        onClick={() => handleReact(msg.id, emoji)}
                      >
                        <span className="bc-reaction-pill-emoji">{emoji}</span>
                        <span className="bc-reaction-pill-count">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer (Admin Only) */}
      {canPost && (
        <div className="bc-composer-area bc-insta-composer-area">
          {/* Dynamic image preview above the composer */}
          {imagePreview && (
            <div className="bc-image-preview bc-insta-image-preview">
              <img src={imagePreview} alt="Selected preview" />
              <button type="button" className="bc-remove-image" onClick={() => { setImageFile(null); setImagePreview(null); }}>
                ✕
              </button>
            </div>
          )}

          {/* Dynamic link input box above the main composer, toggled by a link button */}
          {showLinkInput && (
            <div className="bc-insta-link-input-wrapper">
              <input
                type="url"
                className="bc-insta-link-input"
                placeholder="Paste link URL (e.g., https://example.com)..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
              <button type="button" className="bc-insta-link-close-btn" onClick={() => { setLinkUrl(''); setShowLinkInput(false); }}>✕</button>
            </div>
          )}



          {/* Main Instagram-style input bar */}
          <form onSubmit={handleSend} className="bc-insta-input-bar">
            {/* Attachment Button */}
            <button
              type="button"
              className="bc-insta-tool-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Add photo/video"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />

            {/* Link toggle button */}
            <button
              type="button"
              className={`bc-insta-tool-btn ${linkUrl || showLinkInput ? 'active' : ''}`}
              onClick={() => setShowLinkInput(!showLinkInput)}
              title="Add link"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
              </svg>
            </button>

            {/* Urgent indicator toggle button */}
            <button
              type="button"
              className={`bc-insta-tool-btn bc-urgent-toggle ${isUrgent ? 'active-urgent' : ''}`}
              onClick={() => setIsUrgent(!isUrgent)}
              title="Toggle Urgent Announcement"
            >
              <span className="bc-urgent-dot"></span>
            </button>

            {/* Text Input area */}
            <div className="bc-insta-input-wrapper">
              <input
                type="text"
                className="bc-insta-text-input"
                placeholder="Message..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />
            </div>

            {/* Send Button */}
            <button
              type="submit"
              className="bc-insta-send-btn"
              disabled={sending || (!messageText.trim() && !imageFile)}
            >
              {sending ? (
                <span className="bc-sending-spinner"></span>
              ) : (
                "Send"
              )}
            </button>
          </form>
        </div>
      )}

      {/* Read-only notice for students */}
      {!canPost && (
        <div className="bc-readonly-notice">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          <span>Only admins can broadcast in this channel</span>
        </div>
      )}
    </div>
  );
}

// ==================== HELPER FUNCTIONS ====================
function formatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `Today at ${time}`;
  if (diffDays === 1) return `Yesterday at ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${time}`;
}

function getMessageTypeIcon(type) {
  switch (type) {
    case 'announcement': return '📢';
    case 'reminder': return '⏰';
    case 'update': return '📋';
    default: return '';
  }
}

function renderMessageContent(content) {
  // Auto-link URLs in message content
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = content.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="bc-inline-link">{part}</a>;
    }
    return <span key={i}>{part}</span>;
  });
}


// ==================== MAIN BROADCAST COMPONENT ====================
export default function BroadcastChannel({ onBack }) {
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showChannelList, setShowChannelList] = useState(true);
  const token = localStorage.getItem('token');
  const selectedChannelRef = useRef(null);

  // Keep ref in sync for interval callbacks
  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
  }, [selectedChannel]);

  useEffect(() => {
    loadProfile();
    loadChannels();

    // ===== REALTIME: Poll channel list every 15s =====
    const channelInterval = setInterval(() => {
      loadChannelsSilent();
    }, 15000);

    return () => clearInterval(channelInterval);
  }, []);

  // ===== WEBSOCKETS FOR REAL-TIME UPDATES =====
  useEffect(() => {
    const wsProtocol = API_BASE.startsWith('https') ? 'wss' : 'ws';
    const wsHost = API_BASE.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}://${wsHost}`;

    let socket = null;
    let reconnectTimeout = null;
    let isUnmounted = false;

    function connectWS() {
      if (isUnmounted) return;
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        if (isUnmounted) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'broadcast_event') {
            const { club_id, action, message, id, message_id, reactions } = data;

            // Update channel preview in list
            setChannels(prev => prev.map(ch => {
              if (ch.id === club_id) {
                if (action === 'create') {
                  return {
                    ...ch,
                    message_count: parseInt(ch.message_count || 0) + 1,
                    last_message_at: message.created_at,
                    last_message_preview: message.content || '[Image/Media]'
                  };
                }
              }
              return ch;
            }));

            // Append/delete message in active chat view if matching open channel
            if (selectedChannelRef.current && selectedChannelRef.current.id === club_id) {
              if (action === 'create') {
                setMessages(prev => {
                  if (prev.some(m => String(m.id) === String(message.id))) return prev;
                  return [...prev, message];
                });
              } else if (action === 'delete') {
                setMessages(prev => prev.filter(m => String(m.id) !== String(id)));
              } else if (action === 'react') {
                setMessages(prev => prev.map(m => {
                  if (String(m.id) === String(message_id)) {
                    return { ...m, reactions };
                  }
                  return m;
                }));
              }
            }
          }
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      socket.onclose = () => {
        if (isUnmounted) return;
        reconnectTimeout = setTimeout(connectWS, 5000);
      };

      socket.onerror = () => {
        if (socket) socket.close();
      };
    }

    connectWS();

    return () => {
      isUnmounted = true;
      if (socket) socket.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  async function loadProfile() {
    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.ok && data.user) setProfile(data.user);
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  }

  async function loadChannels() {
    try {
      const res = await fetch(`${API_BASE}/broadcast/channels`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.ok) setChannels(data.channels);
    } catch (err) {
      console.error('Error loading channels:', err);
    }
    setLoading(false);
  }

  // Silent refresh (no loading state change)
  async function loadChannelsSilent() {
    try {
      const res = await fetch(`${API_BASE}/broadcast/channels`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.ok) setChannels(data.channels);
    } catch (err) { /* silent */ }
  }



  async function selectChannel(channel) {
    setSelectedChannel(channel);
    setShowChannelList(false);
    try {
      const res = await fetch(`${API_BASE}/broadcast/channels/${channel.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.ok) {
        setMessages(data.messages);
        if (data.channel) {
          setSelectedChannel(data.channel);
        }
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }

  async function sendMessage(msgData) {
    const formData = new FormData();
    if (msgData.content) formData.append('content', msgData.content);
    formData.append('message_type', msgData.message_type || 'text');
    formData.append('is_urgent', msgData.is_urgent || false);
    if (msgData.link_url) formData.append('link_url', msgData.link_url);
    if (msgData.image) formData.append('image', msgData.image);

    const res = await fetch(`${API_BASE}/broadcast/channels/${selectedChannel.id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (data.ok) {
      setMessages(prev => {
        if (prev.some(m => String(m.id) === String(data.message.id))) return prev;
        return [...prev, data.message];
      });
    } else {
      throw new Error(data.error);
    }
  }

  async function deleteMessage(messageId) {
    if (!window.confirm('Delete this broadcast message?')) return;
    try {
      const res = await fetch(`${API_BASE}/broadcast/channels/${selectedChannel.id}/messages/${messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.ok) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
      }
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  }

  async function toggleSubscribe() {
    try {
      const res = await fetch(`${API_BASE}/broadcast/channels/${selectedChannel.id}/subscribe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.ok) {
        setSelectedChannel(prev => ({ ...prev, is_subscribed: data.subscribed }));
        loadChannels(); // refresh counts
      }
    } catch (err) {
      console.error('Error toggling subscription:', err);
    }
  }

  function handleReactMessage(messageId, reactions) {
    setMessages(prev => prev.map(m => {
      if (String(m.id) === String(messageId)) {
        return { ...m, reactions };
      }
      return m;
    }));
  }

  function handleBack() {
    if (!showChannelList) {
      setShowChannelList(true);
      setSelectedChannel(null);
    } else {
      onBack();
    }
  }

  if (loading) {
    return (
      <div className="bc-container">
        <div className="bc-loading">
          <div className="spinner"></div>
          <p className="loading-text">Loading channels...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bc-container">
      {/* Header */}
      <div className="bc-header">
        <button className="bc-header-back" onClick={handleBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <div className="bc-header-title">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="url(#bc-gradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0px 2px 8px rgba(225, 29, 72, 0.4))' }}>
            <defs>
              <linearGradient id="bc-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#E11D48" />
                <stop offset="100%" stopColor="#F59E0B" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="2"></circle>
            <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path>
          </svg>
          <span>Broadcast Channels</span>
        </div>
      </div>

      {/* Content */}
      <div className="bc-content">
        <div className={`bc-panel-list ${!showChannelList ? 'hidden-mobile' : ''}`}>
          <ChannelList
            channels={channels}
            onSelectChannel={selectChannel}
            selectedChannelId={selectedChannel?.id}
            profile={profile}
          />
        </div>
        <div className={`bc-panel-chat ${showChannelList ? 'hidden-mobile' : ''}`}>
          <ChatView
            channel={selectedChannel}
            messages={messages}
            profile={profile}
            onSendMessage={sendMessage}
            onDeleteMessage={deleteMessage}
            onToggleSubscribe={toggleSubscribe}
            onReactMessage={handleReactMessage}
            onBack={() => { setShowChannelList(true); setSelectedChannel(null); }}
          />
        </div>
      </div>
    </div>
  );
}
