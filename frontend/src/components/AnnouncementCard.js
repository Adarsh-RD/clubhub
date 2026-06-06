// frontend/src/components/AnnouncementCard.js
// PREMIUM UI - Compact Instagram-style cards

import React, { useState, useEffect, useRef } from 'react';

const getApiBase = () => {
  if (process.env.REACT_APP_API_BASE) {
    return process.env.REACT_APP_API_BASE;
  }
  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || 
                  hostname === '127.0.0.1' || 
                  hostname.startsWith('192.168.') || 
                  hostname.startsWith('10.') || 
                  hostname.startsWith('172.') ||
                  window.location.port !== '';
  return isLocal ? `http://${hostname}:4000` : 'https://clubhub-5eh7.onrender.com';
};
const API_BASE = getApiBase();

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
                alert('Successfully registered for this event!');
                loadRegistrationInfo();
            } else {
                alert(data.error || 'Registration failed');
            }
        } catch (err) {
            console.error('Error registering:', err);
            alert('Failed to register');
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
                alert('Registration cancelled');
                loadRegistrationInfo();
            } else {
                alert(data.error || 'Failed to cancel');
            }
        } catch (err) {
            console.error('Error cancelling registration:', err);
            alert('Failed to cancel');
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
                alert('Failed to post comment: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Error posting comment:', err);
            alert('Failed to post comment');
        }
    }

    // Time ago helper
    function timeAgo(dateStr) {
        const now = new Date();
        const date = new Date(dateStr);
        const diff = Math.floor((now - date) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    const mediaUrl = announcement.image_url
        ? (announcement.image_url.startsWith('http') || announcement.image_url.startsWith('data:')
            ? announcement.image_url
            : `${API_BASE}${announcement.image_url}`)
        : null;

    const isVideo = announcement.image_url && (
        announcement.image_url.startsWith('data:video') ||
        announcement.image_url.match(/\.(mp4|webm|mov)$/i)
    );

    return (
        <div className="card-v2">
            {/* Header Row: Avatar + Club name + time */}
            <div className="card-v2-header">
                <div 
                    className="card-v2-avatar" 
                    style={{ 
                        ...(announcement.club_logo ? { background: 'transparent' } : {}),
                        cursor: 'pointer' 
                    }}
                    onClick={() => window.location.href = `/club-profile.html?id=${announcement.club_id}`}
                >
                    {announcement.club_logo ? (
                        <img 
                            src={announcement.club_logo} 
                            alt={announcement.club_name} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} 
                            onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.style.background = 'linear-gradient(135deg, #E11D48 0%, #BE123C 100%)';
                                e.target.parentElement.innerHTML = (announcement.club_name || 'C').charAt(0);
                            }}
                        />
                    ) : (
                        (announcement.club_name || 'C').charAt(0)
                    )}
                </div>
                <div className="card-v2-meta">
                    <span 
                        className="card-v2-club" 
                        style={{ cursor: 'pointer' }}
                        onClick={() => window.location.href = `/club-profile.html?id=${announcement.club_id}`}
                    >
                        {announcement.club_name || 'Club'}
                    </span>
                    <span className="card-v2-time">{timeAgo(announcement.created_at)}</span>
                </div>
                <button className="card-v2-share" onClick={handleShare} aria-label="Share">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </div>

            {/* Media — edge-to-edge inside card */}
            {mediaUrl && (
                <div className="card-v2-media">
                    {isVideo ? (
                        <div className="card-v2-video-wrap" onClick={togglePlay}>
                            <video
                                ref={videoRef}
                                src={mediaUrl}
                                className="card-v2-video"
                                loop
                                playsInline
                                muted={isMuted}
                            />
                            {!isPlaying && (
                                <div className="card-v2-play-btn">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                </div>
                            )}
                            <button className="card-v2-mute-btn" onClick={toggleMute}>
                                {isMuted ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                )}
                            </button>
                        </div>
                    ) : (
                        <img src={mediaUrl} alt="" className="card-v2-img" loading="lazy" />
                    )}
                </div>
            )}

            {/* Action bar — compact icons */}
            <div className="card-v2-actions">
                <div className="card-v2-actions-left">
                    <button className={`card-v2-action-btn ${isLiked ? 'liked' : ''}`} onClick={handleLike}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill={isLiked ? '#E11D48' : 'none'}>
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke={isLiked ? '#E11D48' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    <button className="card-v2-action-btn" onClick={toggleComments}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Likes count */}
            {likeCount > 0 && (
                <div className="card-v2-likes">{likeCount.toLocaleString()} {likeCount === 1 ? 'like' : 'likes'}</div>
            )}

            {/* Caption text */}
            <div className="card-v2-caption">
                <span 
                    className="card-v2-caption-club" 
                    style={{ cursor: 'pointer' }}
                    onClick={() => window.location.href = `/club-profile.html?id=${announcement.club_id}`}
                >
                    {announcement.club_name || 'Club'}
                </span>
                {announcement.content}
            </div>

            {/* Comment count teaser */}
            {commentCount > 0 && !showComments && (
                <button className="card-v2-comment-teaser" onClick={toggleComments}>
                    View all {commentCount} comment{commentCount > 1 ? 's' : ''}
                </button>
            )}

            {/* Registration — ultra-compact inline */}
            {announcement.registration_enabled && registrationInfo && (
                <div className="card-v2-reg-inline">
                    {isStudent && (
                        <>
                            {isRegistered ? (
                                <span className="card-v2-reg-chip registered">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    Registered
                                    <button className="card-v2-unreg-link" onClick={handleUnregister} disabled={loadingReg}>Undo</button>
                                </span>
                            ) : registrationInfo.is_full ? (
                                <span className="card-v2-reg-chip closed">Spots filled</span>
                            ) : registrationInfo.deadline_passed ? (
                                <span className="card-v2-reg-chip closed">Closed</span>
                            ) : (
                                <button className="card-v2-reg-link" onClick={handleRegister} disabled={loadingReg}>
                                    {loadingReg ? '...' : 'Register for this event'}
                                </button>
                            )}
                        </>
                    )}

                    {/* Custom Fields Form — slide down */}
                    {showRegForm && customFields.length > 0 && (
                        <div className="card-v2-reg-form">
                            {customFields.map(field => (
                                <div key={field.id} className="card-v2-reg-field">
                                    <input
                                        type={field.field_type === 'phone' ? 'tel' : field.field_type}
                                        placeholder={`${field.field_name}${field.is_required ? ' *' : ''}`}
                                        value={regFormData[field.id] || regFormData[field.field_name] || ''}
                                        onChange={(e) => setRegFormData({
                                            ...regFormData,
                                            [field.id]: e.target.value,
                                            [field.field_name]: e.target.value
                                        })}
                                        required={field.is_required}
                                    />
                                </div>
                            ))}
                            <div className="card-v2-reg-form-actions">
                                <button className="card-v2-reg-submit" onClick={handleRegister} disabled={loadingReg}>
                                    {loadingReg ? '...' : 'Submit'}
                                </button>
                                <button className="card-v2-reg-cancel" onClick={() => { setShowRegForm(false); setRegFormData({}); }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Comments Section */}
            {showComments && (
                <div className="card-v2-comments">
                    {loadingComments ? (
                        <p className="card-v2-comments-loading">Loading...</p>
                    ) : commentsList.length > 0 ? (
                        commentsList.map(comment => (
                            <div key={comment.id} className="card-v2-comment">
                                <span className="card-v2-comment-author">{comment.author_name || comment.author_email}</span>
                                <span className="card-v2-comment-text">{comment.content}</span>
                                <span className="card-v2-comment-time">{timeAgo(comment.created_at)}</span>
                            </div>
                        ))
                    ) : (
                        <p className="card-v2-comments-empty">No comments yet</p>
                    )}
                    <div className="card-v2-comment-input">
                        <input
                            type="text"
                            placeholder="Add a comment..."
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                        />
                        <button onClick={handlePostComment} disabled={!commentText.trim()}>Post</button>
                    </div>
                </div>
            )}
        </div>
    );
}