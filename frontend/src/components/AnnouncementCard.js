// frontend/src/components/AnnouncementCard.js
// CLEAN VERSION - NO CSS IN THIS FILE!

import React, { useState, useEffect, useRef } from 'react';

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000";

export default function AnnouncementCard({ announcement, currentUser }) {
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [showRegistrations, setShowRegistrations] = useState(false);

    // Video Player State
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);

    function togglePlay() {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    }

    function toggleMute(e) {
        e.stopPropagation();
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    }

    function handleShare() {
        const shareUrl = `${window.location.origin}/announcements/${announcement.id}`;
        if (navigator.share) {
            navigator.share({
                title: announcement.content?.substring(0, 60) || 'Announcement',
                text: announcement.content,
                url: shareUrl,
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(shareUrl);
            alert('Link copied to clipboard!');
        }
    }

    // Likes & Comments state
    const [isLiked, setIsLiked] = useState(announcement.has_liked || false);
    const [likeCount, setLikeCount] = useState(parseInt(announcement.like_count) || 0);
    const [commentCount, setCommentCount] = useState(parseInt(announcement.comment_count) || 0);
    const [commentsList, setCommentsList] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);

    // Registration state
    const [registrationInfo, setRegistrationInfo] = useState(null);
    const [isRegistered, setIsRegistered] = useState(false);
    const [loadingReg, setLoadingReg] = useState(false);
    const [registrations, setRegistrations] = useState([]);
    const [customFields, setCustomFields] = useState([]);
    const [showRegForm, setShowRegForm] = useState(false);
    const [regFormData, setRegFormData] = useState({});

    const token = localStorage.getItem('token');
    const isClubAdmin = currentUser?.role === 'club_admin';
    const isStudent = currentUser?.role === 'student' || currentUser?.role === null;

    useEffect(() => {
        if (announcement.registration_enabled) {
            loadRegistrationInfo();
            loadCustomFields();
            if (token && isStudent) {
                checkRegistrationStatus();
            }
        }

        // Sync props if announcement object changes (e.g. from feed refresh)
        setIsLiked(announcement.has_liked || false);
        setLikeCount(parseInt(announcement.like_count) || 0);
        setCommentCount(parseInt(announcement.comment_count) || 0);
    }, [announcement]);

    async function loadRegistrationInfo() {
        try {
            const res = await fetch(`${API_BASE}/announcements/${announcement.id}/registration-info`);
            const data = await res.json();
            if (data.ok) {
                setRegistrationInfo(data);
            }
        } catch (err) {
            console.error('Error loading registration info:', err);
        }
    }

    async function checkRegistrationStatus() {
        try {
            const res = await fetch(
                `${API_BASE}/announcements/${announcement.id}/registration-status`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await res.json();
            if (data.ok) {
                setIsRegistered(data.registered);
            }
        } catch (err) {
            console.error('Error checking registration:', err);
        }
    }

    async function loadCustomFields() {
        try {
            const res = await fetch(`${API_BASE}/announcements/${announcement.id}/registration-fields`);
            const data = await res.json();
            if (data.ok && data.fields) {
                setCustomFields(data.fields);
            }
        } catch (err) {
            console.error('Error loading custom fields:', err);
        }
    }

    async function handleRegister() {
        if (!token) {
            alert('Please login to register');
            return;
        }

        // If there are custom fields, show the form first
        if (customFields.length > 0 && !showRegForm) {
            setShowRegForm(true);
            return;
        }

        setLoadingReg(true);
        try {
            const res = await fetch(
                `${API_BASE}/announcements/${announcement.id}/register`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ custom_fields_data: regFormData })
                }
            );

            const data = await res.json();

            if (res.ok && data.ok) {
                setIsRegistered(true);
                setShowRegForm(false);
                setRegFormData({});
                alert('✓ Successfully registered for this event!');
                loadRegistrationInfo();
            } else {
                alert('✗ ' + (data.error || 'Registration failed'));
            }
        } catch (err) {
            console.error('Error registering:', err);
            alert('✗ Failed to register');
        } finally {
            setLoadingReg(false);
        }
    }

    async function handleUnregister() {
        if (!(await window.customConfirm('Are you sure you want to cancel your registration?'))) return;

        setLoadingReg(true);
        try {
            const res = await fetch(
                `${API_BASE}/announcements/${announcement.id}/unregister`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            const data = await res.json();

            if (res.ok && data.ok) {
                setIsRegistered(false);
                alert('✓ Registration cancelled');
                loadRegistrationInfo();
            } else {
                alert('✗ ' + (data.error || 'Failed to cancel'));
            }
        } catch (err) {
            console.error('Error cancelling registration:', err);
            alert('✗ Failed to cancel');
        } finally {
            setLoadingReg(false);
        }
    }

    async function loadRegistrations() {
        try {
            const res = await fetch(
                `${API_BASE}/announcements/${announcement.id}/registrations`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await res.json();
            if (data.ok) {
                setRegistrations(data.registrations);
            }
        } catch (err) {
            console.error('Error loading registrations:', err);
        }
    }

    function handleViewRegistrations() {
        if (!showRegistrations) {
            loadRegistrations();
        }
        setShowRegistrations(!showRegistrations);
    }

    async function exportRegistrations() {
        try {
            const res = await fetch(`${API_BASE}/announcements/${announcement.id}/registrations/export`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `registrations-${announcement.id}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                alert('Failed to export registrations');
            }
        } catch (err) {
            console.error('Error exporting:', err);
            alert('Error exporting registrations');
        }
    }

    const canRegister = registrationInfo &&
        !registrationInfo.is_full &&
        !registrationInfo.deadline_passed;

    // --- Likes & Comments Handlers ---

    async function handleLike() {
        if (!token) {
            alert('Please login to like announcements');
            return;
        }

        // Optimistic UI update
        const previousLikedStatus = isLiked;
        setIsLiked(!isLiked);
        setLikeCount(prev => isLiked ? prev - 1 : prev + 1);

        try {
            const res = await fetch(`${API_BASE}/announcements/${announcement.id}/like`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();

            if (res.ok && data.ok) {
                setIsLiked(data.has_liked);
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            console.error('Error toggling like:', err);
            // Revert on failure
            setIsLiked(previousLikedStatus);
            setLikeCount(prev => previousLikedStatus ? prev + 1 : prev - 1);
        }
    }

    async function loadComments() {
        setLoadingComments(true);
        try {
            const res = await fetch(`${API_BASE}/announcements/${announcement.id}/comments`);
            const data = await res.json();
            if (data.ok) {
                setCommentsList(data.comments);
            }
        } catch (err) {
            console.error('Error loading comments:', err);
        } finally {
            setLoadingComments(false);
        }
    }

    function toggleComments() {
        if (!showComments) {
            loadComments();
        }
        setShowComments(!showComments);
    }

    async function handlePostComment() {
        if (!token) {
            alert('Please login to comment');
            return;
        }

        if (!commentText.trim()) return;

        try {
            const res = await fetch(`${API_BASE}/announcements/${announcement.id}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ content: commentText.trim() })
            });

            const data = await res.json();
            if (res.ok && data.ok) {
                setCommentText('');
                setCommentCount(prev => prev + 1);
                loadComments(); // Refresh list to get new comment
            } else {
                alert('✗ Failed to post comment: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Error posting comment:', err);
            alert('✗ Failed to post comment');
        }
    }

    return (
        <div className="announcement-card">
            <div className="announcement-header">
                <span className="club-badge">
                    <span>🎯</span>
                    {announcement.club_name || 'Club'}
                </span>
                <div className="announcement-meta">
                    <span>{new Date(announcement.created_at).toLocaleDateString()}</span>
                    <span>{new Date(announcement.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            </div>

            {/* Media Section (Instagram Style) */}
            {announcement.image_url && (
                announcement.image_url.startsWith('data:video') || announcement.image_url.match(/\.(mp4|webm|mov)$/i) ? (
                    <div className="reels-container" style={{ position: 'relative', width: '100%', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#000', marginTop: '10px' }} onClick={togglePlay}>
                        <video
                            ref={videoRef}
                            src={
                                announcement.image_url.startsWith('http') || announcement.image_url.startsWith('data:')
                                    ? announcement.image_url
                                    : `${API_BASE}${announcement.image_url}`
                            }
                            className="announcement-video"
                            style={{ width: '100%', display: 'block', maxHeight: '80vh', objectFit: 'contain' }}
                            loop
                            playsInline
                            muted={isMuted}
                        />
                        {/* Play/Pause Overlay */}
                        {!isPlaying && (
                            <div className="play-overlay" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#C41E3A', filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.5))', pointerEvents: 'none' }}>
                                <svg width="72" height="72" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </div>
                        )}
                        {/* Mute/Unmute Overlay */}
                        <div className="sound-overlay" onClick={toggleMute} style={{ position: 'absolute', bottom: '15px', right: '15px', background: 'rgba(0,0,0,0.5)', borderRadius: '50%', padding: '8px', color: 'white', cursor: 'pointer' }}>
                            {isMuted ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                    <line x1="23" y1="9" x2="17" y2="15"></line>
                                    <line x1="17" y1="9" x2="23" y2="15"></line>
                                </svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                                </svg>
                            )}
                        </div>
                    </div>
                ) : (
                    <img
                        src={
                            announcement.image_url.startsWith('http') || announcement.image_url.startsWith('data:')
                                ? announcement.image_url
                                : `${API_BASE}${announcement.image_url}`
                        }
                        alt={announcement.title}
                        className="announcement-image"
                        style={{ width: '100%', borderRadius: '8px', marginTop: '10px', maxHeight: '500px', objectFit: 'cover' }}
                    />
                )
            )}

            {/* Interactions Bar (Moved above title) */}
            <div className="interactions-bar" style={{ marginTop: '10px', padding: '5px 0', display: 'flex', gap: '15px' }}>
                <button
                    className={`interaction-btn ${isLiked ? 'liked' : ''}`}
                    onClick={handleLike}
                    style={{ color: isLiked ? '#C41E3A' : 'inherit', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill={isLiked ? '#C41E3A' : 'none'}>
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontWeight: 'bold' }}>{likeCount}</span>
                </button>

                <button className="interaction-btn" onClick={toggleComments} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontWeight: 'bold' }}>{commentCount}</span>
                </button>

                <button className="interaction-btn" onClick={handleShare} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', marginLeft: 'auto' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </div>

            {/* Content (Instagram Style - Below Interactions) */}
            <div style={{ marginTop: '5px' }}>
                <p className="announcement-content" style={{ margin: 0, fontSize: '0.9rem', color: '#4B5563' }}>
                    <span style={{ fontWeight: 'bold', marginRight: '5px' }}>{announcement.club_name || 'Club'}</span>
                    {announcement.content}
                </p>
            </div>

            {/* Registration Section */}
            {announcement.registration_enabled && registrationInfo && (
                <div className="registration-section">
                    <div className="registration-info">
                        <h4 className="registration-title">📝 Event Registration</h4>

                        <div className="registration-stats">
                            <div className="stat-item">
                                <span className="stat-icon">👥</span>
                                <span className="stat-text">
                                    {registrationInfo.current_count}
                                    {registrationInfo.max_registrations ? ` / ${registrationInfo.max_registrations}` : ''}
                                    {' '}registered
                                </span>
                            </div>

                            {registrationInfo.deadline && (
                                <div className="stat-item">
                                    <span className="stat-icon">⏰</span>
                                    <span className="stat-text">
                                        Deadline: {new Date(registrationInfo.deadline).toLocaleString()}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Registration Status Messages */}
                        {registrationInfo.is_full && (
                            <div className="registration-status status-full">
                                ⚠️ Event is full
                            </div>
                        )}

                        {registrationInfo.deadline_passed && (
                            <div className="registration-status status-closed">
                                🔒 Registration closed
                            </div>
                        )}

                    {/* Registration Button for Students */}
                        {isStudent && (
                            <div className="registration-actions">
                                {isRegistered ? (
                                    <div className="registered-badge">
                                        <span>✓</span> You're registered
                                        <button
                                            className="btn-cancel-reg"
                                            onClick={handleUnregister}
                                            disabled={loadingReg}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            className="btn-register"
                                            onClick={handleRegister}
                                            disabled={loadingReg || !canRegister}
                                        >
                                            {loadingReg ? '...' : '📝 Register Now'}
                                        </button>

                                        {/* Custom Fields Registration Form */}
                                        {showRegForm && customFields.length > 0 && (
                                            <div style={{
                                                marginTop: '12px',
                                                padding: '16px',
                                                background: 'rgba(0,0,0,0.3)',
                                                borderRadius: '10px',
                                                border: '1px solid rgba(16, 185, 129, 0.2)'
                                            }}>
                                                <p style={{ fontSize: '0.9rem', fontWeight: '600', color: '#10B981', marginBottom: '12px' }}>
                                                    📋 Fill in the details below:
                                                </p>
                                                {customFields.map(field => (
                                                    <div key={field.id} style={{ marginBottom: '10px' }}>
                                                        <label style={{ fontSize: '0.85rem', color: '#e2e8f0', display: 'block', marginBottom: '4px' }}>
                                                            {field.field_name}
                                                            {field.is_required && <span style={{ color: '#EF4444' }}> *</span>}
                                                        </label>
                                                        <input
                                                            type={field.field_type === 'phone' ? 'tel' : field.field_type}
                                                            placeholder={`Enter ${field.field_name.toLowerCase()}`}
                                                            value={regFormData[field.id] || regFormData[field.field_name] || ''}
                                                            onChange={(e) => setRegFormData({ 
                                                                ...regFormData, 
                                                                [field.id]: e.target.value,
                                                                [field.field_name]: e.target.value
                                                            })}
                                                            required={field.is_required}
                                                            style={{
                                                                width: '100%',
                                                                padding: '10px 12px',
                                                                borderRadius: '8px',
                                                                border: '1px solid rgba(255,255,255,0.15)',
                                                                background: 'rgba(255,255,255,0.05)',
                                                                color: '#f8fafc',
                                                                fontSize: '0.9rem',
                                                                outline: 'none',
                                                                boxSizing: 'border-box'
                                                            }}
                                                        />
                                                    </div>
                                                ))}
                                                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                                                    <button
                                                        className="btn-register"
                                                        onClick={handleRegister}
                                                        disabled={loadingReg}
                                                        style={{ flex: 1 }}
                                                    >
                                                        {loadingReg ? '...' : '✓ Submit & Register'}
                                                    </button>
                                                    <button
                                                        onClick={() => { setShowRegForm(false); setRegFormData({}); }}
                                                        style={{ background: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.85rem' }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Admin View - Removed as requested (moved to Profile only) */}
                </div>
            )}



            {/* Comments Section */}
            {showComments && (
                <div className="comments-section" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem', marginTop: '1rem' }}>
                    <div className="comment-input-wrapper" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <textarea
                            className="comment-input"
                            placeholder="Write a comment..."
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#E2E8F0', resize: 'vertical', minHeight: '40px', outline: 'none' }}
                        />
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={handlePostComment}
                            disabled={!commentText.trim()}
                        >
                            Post
                        </button>
                    </div>

                    <div className="comment-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {loadingComments ? (
                            <p style={{ textAlign: 'center', color: '#94A3B8', padding: '1rem' }}>Loading comments...</p>
                        ) : commentsList.length > 0 ? (
                            commentsList.map(comment => (
                                <div key={comment.id} className="comment-item" style={{ marginBottom: '0.25rem' }}>
                                    <div style={{ lineHeight: '1.4' }}>
                                        <span style={{ fontSize: '0.875rem', color: '#FFFFFF', fontWeight: '600', marginRight: '0.5rem' }}>
                                            {comment.author_name || comment.author_email}
                                        </span>
                                        <span style={{ fontSize: '0.875rem', color: '#E2E8F0' }}>
                                            {comment.content}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '2px' }}>
                                        {new Date(comment.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p style={{ textAlign: 'center', color: '#94A3B8', padding: '1rem' }}>
                                No comments yet. Be the first to comment!
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}