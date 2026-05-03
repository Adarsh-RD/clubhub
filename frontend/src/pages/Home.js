import React, { useState, useEffect } from 'react';
import AnnouncementCard from '../components/AnnouncementCard';
import { requestForToken, messaging } from '../firebase';
import { onMessage } from 'firebase/messaging';

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000";

export default function Home() {
  const [profile, setProfile] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const token = localStorage.getItem('token');

  // ✅ CORRECT: Registration fields in state
  const [createForm, setCreateForm] = useState({
    title: '',
    content: '',
    image: null,
    registration_enabled: false,
    registration_deadline: '',
    max_registrations: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (!token) {
      window.location.href = '/';
      return;
    }

    try {
      // Load profile
      const profileRes = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const profileData = await profileRes.json();
      if (profileData.ok && profileData.user) {
        setProfile(profileData.user);
      }

      // Load announcements
      let fetchedAnnouncements = [];
      const announcementsRes = await fetch(`${API_BASE}/announcements`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const announcementsData = await announcementsRes.json();

      if (announcementsData.ok && announcementsData.announcements) {
        fetchedAnnouncements = announcementsData.announcements.map(ann => ({
          ...ann,
          like_count: ann.like_count || 0,
          comment_count: ann.comment_count || 0,
          has_liked: ann.has_liked || false
        }));
        setAnnouncements(fetchedAnnouncements);
      }

      setLoading(false);

      // --- PUSH NOTIFICATIONS ---
      // Request permission and get token
      const vapidKey = "BKgJD4e72EG2Ij3CkznmOeJZ98BtOqo3OhtAXYwAKfP8mBhoGTCMFZD6pgdh53fF4hBrTuoUcAjMbxblYk24YOU";
      const fcmToken = await requestForToken(vapidKey);

      if (fcmToken) {
        console.log("FCM Token retrieved, saving to backend...");
        await fetch(`${API_BASE}/profile/fcm-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ token: fcmToken })
        });
      }

      if (messaging) {
        onMessage(messaging, (payload) => {
          console.log("Foreground push notification received:", payload);
          setNotifications(prev => [payload.notification, ...prev]);
        });
      }

    } catch (err) {
      console.error('Error loading data:', err);
      setLoading(false);
    }
  }

  function handleImageSelect(e) {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File too large. Maximum 10MB.');
        return;
      }
      setCreateForm({ ...createForm, image: file });
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  }

  function removeImage() {
    setCreateForm({ ...createForm, image: null });
    setImagePreview(null);
  }

  // ✅ UPDATED: Added registration data to FormData
  async function handleCreateAnnouncement(e) {
    e.preventDefault();

    if (!createForm.title.trim() || !createForm.content.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('title', createForm.title.trim());
      formData.append('content', createForm.content.trim());
      formData.append('registration_enabled', createForm.registration_enabled);

      if (createForm.registration_enabled) {
        if (createForm.registration_deadline) {
          formData.append('registration_deadline', createForm.registration_deadline);
        }
        if (createForm.max_registrations) {
          formData.append('max_registrations', createForm.max_registrations);
        }
      }

      if (createForm.image) {
        formData.append('image', createForm.image);
      }

      const res = await fetch(`${API_BASE}/announcements`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        alert('✓ Announcement published successfully!');
        setShowCreateModal(false);
        setCreateForm({
          title: '',
          content: '',
          image: null,
          registration_enabled: false,
          registration_deadline: '',
          max_registrations: ''
        });
        setImagePreview(null);
        loadData();
      } else {
        throw new Error(data.error || 'Failed to publish');
      }
    } catch (err) {
      console.error('Error publishing announcement:', err);
      alert('✗ Failed to publish announcement: ' + err.message);
    }
  }

  async function handleLogout() {
    if (await window.customConfirm('Are you sure you want to sign out?')) {
      localStorage.removeItem("token");
      window.location.href = '/';
    }
  }

  if (loading) {
    return (
      <div className="page-wrapper">
        <div className="loading-container">
          <div className="spinner"></div>
          <p className="loading-text">Loading your feed...</p>
        </div>
      </div>
    );
  }

  const firstName = profile?.name?.split(' ')[0] || profile?.email?.split('@')[0] || 'User';
  const isClubAdmin = profile?.role === 'club_admin';

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <div className="header-logo">
              <img src="/kle-logo.png" alt="KLE Tech" onError={(e) => e.target.style.display = 'none'} />
            </div>
            <div className="header-branding">
              <h1 className="header-title">Club Hub</h1>
              <p className="header-subtitle">KLE Technological University</p>
            </div>
          </div>

          <div className="header-right">
            {/* Admin Dashboard Link - Only for Coordinator */}
            {profile?.email === 'bigbossssz550@gmail.com' && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => window.location.href = '/admin-dashboard.html'}
                style={{ background: '#10B981', padding: '0.5rem' }}
                title="Admin Dashboard"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 4.5V19.5M19.5 12H4.5" stroke="currentColor" strokeWidth="2" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" />
                </svg>
              </button>
            )}

            <button className="btn btn-ghost btn-sm" onClick={handleLogout} title="Sign Out">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #E11D48, #F59E0B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold', color: 'white', boxShadow: '0 4px 12px rgba(225, 29, 72, 0.3)' }}>
              {firstName.charAt(0)}
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: '600', color: '#f8fafc' }}>{firstName}</h2>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '2px 0 0 0' }}>Your Campus Feed</p>
            </div>
          </div>
          <button style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '8px 16px', color: '#fff', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onClick={() => window.location.href='/clubs.html'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>
            Explore
          </button>
        </div>

        <section>
          <h2 className="section-title">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="url(#announcement-gradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0px 2px 10px rgba(225, 29, 72, 0.4))' }}>
              <defs>
                <linearGradient id="announcement-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#E11D48" />
                  <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>
              </defs>
              <circle cx="12" cy="12" r="2"></circle>
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path>
            </svg>
            Latest Announcements
          </h2>

          {announcements.length > 0 ? (
            <div>
              {announcements.map((announcement) => (
                <AnnouncementCard
                  key={announcement.id}
                  announcement={announcement}
                  currentUser={profile}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h3 className="empty-title">No announcements yet</h3>
              <p className="empty-description">Check back later for updates from clubs</p>
              <button className="btn btn-primary" onClick={() => window.location.href = '/clubs.html'} style={{ marginTop: '1.5rem' }}>
                Explore Clubs
              </button>
            </div>
          )}
        </section>

        {/* Professional Footer */}
        <footer style={{ marginTop: '50px', padding: '30px 0 100px 0', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '20px' }}>
            <a href="/about.html" style={{ color: '#94a3b8', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={(e)=>e.currentTarget.style.color='#f8fafc'} onMouseOut={(e)=>e.currentTarget.style.color='#94a3b8'}>About</a>
            <a href="/accessibility.html" style={{ color: '#94a3b8', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={(e)=>e.currentTarget.style.color='#f8fafc'} onMouseOut={(e)=>e.currentTarget.style.color='#94a3b8'}>Accessibility</a>
            <a href="/help.html" style={{ color: '#94a3b8', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={(e)=>e.currentTarget.style.color='#f8fafc'} onMouseOut={(e)=>e.currentTarget.style.color='#94a3b8'}>Help Center</a>
            <a href="/privacy.html" style={{ color: '#94a3b8', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={(e)=>e.currentTarget.style.color='#f8fafc'} onMouseOut={(e)=>e.currentTarget.style.color='#94a3b8'}>Privacy & Terms</a>
          </div>
          
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center', gap: '20px' }}>
            <a href="https://www.linkedin.com/in/adarshhhhhhhrd/" target="_blank" rel="noopener noreferrer" style={{ color: '#0077b5', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', fontWeight: '500', transition: 'transform 0.2s' }} onMouseOver={(e)=>e.currentTarget.style.transform='scale(1.05)'} onMouseOut={(e)=>e.currentTarget.style.transform='scale(1)'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              LinkedIn
            </a>
            <a href="https://instagram.com/_adxrshh.rd/" target="_blank" rel="noopener noreferrer" style={{ color: '#E1306C', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', fontWeight: '500', transition: 'transform 0.2s' }} onMouseOver={(e)=>e.currentTarget.style.transform='scale(1.05)'} onMouseOut={(e)=>e.currentTarget.style.transform='scale(1)'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              Instagram
            </a>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: '500', color: '#f8fafc' }}>Club Hub</span>
            <span style={{ fontSize: '10px' }}>•</span>
            <span>Developed by <strong style={{ color: '#E11D48' }}>Adarsh</strong></span>
          </div>
          <p style={{ margin: '8px 0 0 0', opacity: 0.6, fontSize: '0.8rem' }}>© {new Date().getFullYear()} Club Hub Corporation. All rights reserved.</p>
        </footer>
      </main>

      {/* Modern Bottom Dock Navigation */}
      <nav className="bottom-dock">
        <button className="dock-item active" onClick={() => window.location.href = '/'}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          <span className="dock-label">Home</span>
        </button>

        <button className="dock-item" onClick={() => window.location.href = '/clubs.html'}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span className="dock-label">Explore</span>
        </button>

        <button
          className="dock-fab"
          onClick={() => {
            if (isClubAdmin) setShowCreateModal(true);
            else alert("Restricted: Only Club Admins can create announcements.");
          }}
          title={isClubAdmin ? "Create Announcement" : "Restricted: Club Admins Only"}
          style={{ opacity: isClubAdmin ? 1 : 0.5, filter: isClubAdmin ? 'none' : 'grayscale(100%)' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
            <path d="M12 5V19M5 12H19" />
          </svg>
        </button>

        <button className="dock-item" onClick={() => window.location.href = '/notifications.html'}>
          <div style={{ position: 'relative' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            {notifications.length > 0 && (
              <span style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, backgroundColor: '#E11D48', borderRadius: '50%' }}></span>
            )}
          </div>
          <span className="dock-label">Alerts</span>
        </button>

        <button className="dock-item" onClick={() => window.location.href = '/profile.html?v=2'}>
          <div className="dock-avatar">
            {profile?.profile_picture ? (
              <img src={profile.profile_picture} alt={firstName} />
            ) : (
              firstName.charAt(0).toUpperCase()
            )}
          </div>
          <span className="dock-label">Profile</span>
        </button>
      </nav>

      {/* Create Announcement Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                <span>✨</span>
                Create New Announcement
              </h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAnnouncement} className="modal-form">
              {/* Title Field */}
              <div className="form-field">
                <label>Title</label>
                <input
                  type="text"
                  placeholder="e.g., Tech Workshop - AI & ML"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  maxLength="255"
                  required
                />
              </div>

              {/* Content Field */}
              <div className="form-field">
                <label>Content</label>
                <textarea
                  placeholder="Write your announcement details here..."
                  value={createForm.content}
                  onChange={(e) => setCreateForm({ ...createForm, content: e.target.value })}
                  rows="6"
                  required
                />
              </div>

              {/* Image Upload Field */}
              <div className="form-field">
                <label>Image (Optional)</label>
                <div className="image-upload-zone">
                  {imagePreview ? (
                    <div className="image-preview-box">
                      {createForm.image?.type?.startsWith('video/') ? (
                        <video src={imagePreview} controls style={{ width: '100%', maxHeight: '300px', borderRadius: '8px' }} />
                      ) : (
                        <img src={imagePreview} alt="Preview" />
                      )}
                      <button type="button" className="remove-img-btn" onClick={removeImage}>
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="upload-zone-placeholder" onClick={() => document.getElementById('modalImageInput').click()}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                        <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3M12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p>Click to upload image or video</p>
                      <span className="upload-hint">PNG, JPG, MP4, WEBM up to 10MB</span>
                    </div>
                  )}
                  <input
                    id="modalImageInput"
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleImageSelect}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>

              {/* ✅ REGISTRATION FIELDS - ADD HERE */}
              <div className="form-field">
                <div className="checkbox-field">
                  <input
                    type="checkbox"
                    id="registrationEnabled"
                    checked={createForm.registration_enabled}
                    onChange={(e) => setCreateForm({
                      ...createForm,
                      registration_enabled: e.target.checked
                    })}
                  />
                  <label htmlFor="registrationEnabled" style={{ cursor: 'pointer', marginLeft: '0.5rem' }}>
                    <strong>Enable Student Registration</strong>
                    <span style={{ display: 'block', fontSize: '0.875rem', color: '#6B7280', marginTop: '0.25rem' }}>
                      Allow students to register for this event
                    </span>
                  </label>
                </div>
              </div>

              {/* ✅ REGISTRATION OPTIONS - Only show if enabled */}
              {createForm.registration_enabled && (
                <div className="registration-options">
                  <div className="form-field">
                    <label>Registration Deadline (Optional)</label>
                    <input
                      type="datetime-local"
                      value={createForm.registration_deadline}
                      onChange={(e) => setCreateForm({
                        ...createForm,
                        registration_deadline: e.target.value
                      })}
                    />
                    <span className="field-hint">Students can register until this date & time</span>
                  </div>

                  <div className="form-field">
                    <label>Maximum Registrations (Optional)</label>
                    <input
                      type="number"
                      placeholder="e.g., 50"
                      min="1"
                      value={createForm.max_registrations}
                      onChange={(e) => setCreateForm({
                        ...createForm,
                        max_registrations: e.target.value
                      })}
                    />
                    <span className="field-hint">Leave empty for unlimited registrations</span>
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Publish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}