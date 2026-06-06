import React, { useState, useEffect } from 'react';
import AnnouncementCard from '../components/AnnouncementCard';
import BroadcastChannel from '../components/BroadcastChannel';
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
  const [currentView, setCurrentView] = useState('feed');
  const token = localStorage.getItem('token');

  // ✅ CORRECT: Registration fields in state
  const [createForm, setCreateForm] = useState({
    content: '',
    image: null,
    registration_enabled: false,
    registration_deadline: '',
    max_registrations: '',
    custom_fields: []
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

    if (!createForm.content.trim()) {
      alert('Please write a description');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('content', createForm.content.trim());
      formData.append('registration_enabled', createForm.registration_enabled);

      if (createForm.registration_enabled) {
        if (createForm.registration_deadline) {
          formData.append('registration_deadline', createForm.registration_deadline);
        }
        if (createForm.max_registrations) {
          formData.append('max_registrations', createForm.max_registrations);
        }
        if (createForm.custom_fields.length > 0) {
          formData.append('custom_fields', JSON.stringify(createForm.custom_fields));
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
        alert('✓ Published successfully!');
        setShowCreateModal(false);
        setCreateForm({
          content: '',
          image: null,
          registration_enabled: false,
          registration_deadline: '',
          max_registrations: '',
          custom_fields: []
        });
        setImagePreview(null);
        loadData();
      } else {
        throw new Error(data.error || 'Failed to publish');
      }
    } catch (err) {
      console.error('Error publishing:', err);
      alert('✗ Failed to publish: ' + err.message);
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

  // ==================== BROADCAST CHANNEL VIEW ====================
  if (currentView === 'broadcast') {
    return <BroadcastChannel onBack={() => setCurrentView('feed')} />;
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <div className="header-logo">
              <img src="/kle-logo.jpg" alt="KLE Tech" onError={(e) => e.target.style.display = 'none'} />
            </div>
            <div className="header-branding">
              <h1 className="header-title">Club Hub</h1>
              <p className="header-subtitle">KLE Technological University</p>
            </div>
          </div>

          <div className="header-right">
            {(profile?.email === 'bigbossssz550@gmail.com' || profile?.email === '01fe23bci050@kletech.ac.in') && (
              <button
                className="header-icon-btn"
                onClick={() => window.location.href = '/admin-dashboard.html'}
                title="Admin Dashboard"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
              </button>
            )}

            <button className="header-icon-btn" onClick={() => setCurrentView('broadcast')} title="Broadcast Channels">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="feed-main">
        {announcements.length > 0 ? (
          <div className="feed-list">
            {announcements.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                currentUser={profile}
              />
            ))}
          </div>
        ) : (
          <div className="feed-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" style={{opacity:0.4}}>
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
            <p>No announcements yet</p>
            <span>Check back later for club updates</span>
          </div>
        )}

        <footer style={{ marginTop: '40px', padding: '20px 16px 100px', textAlign: 'center', color: '#475569', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{ fontWeight: '600', color: '#94a3b8' }}>Club Hub</span>
            <span style={{ fontSize: '8px', color: '#475569' }}>·</span>
            <span>by <strong style={{ color: '#E11D48', fontWeight: '600' }}>Adarsh</strong></span>
          </div>
          <p style={{ margin: 0, opacity: 0.5 }}>© {new Date().getFullYear()}</p>
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
                New Post
              </h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form onSubmit={handleCreateAnnouncement} className="modal-form">
              {/* Content/Description Field */}
              <div className="form-field">
                <label>Description</label>
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

              {/* Custom Registration Fields */}
              {createForm.registration_enabled && (
                <div className="registration-options" style={{ marginTop: '10px' }}>
                  <div className="form-field">
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Custom Registration Fields</span>
                      <button
                        type="button"
                        onClick={() => setCreateForm({
                          ...createForm,
                          custom_fields: [...createForm.custom_fields, { field_name: '', field_type: 'text', is_required: true }]
                        })}
                        style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10B981',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          borderRadius: '8px',
                          padding: '6px 14px',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          fontWeight: '600',
                          transition: 'all 0.2s'
                        }}
                      >
                        + Add Field
                      </button>
                    </label>
                    <span className="field-hint">Ask students for extra info like phone number, team name, etc.</span>

                    {createForm.custom_fields.map((field, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        marginTop: '10px',
                        padding: '10px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.08)'
                      }}>
                        <input
                          type="text"
                          placeholder="Field name (e.g. Phone Number)"
                          value={field.field_name}
                          onChange={(e) => {
                            const updated = [...createForm.custom_fields];
                            updated[idx].field_name = e.target.value;
                            setCreateForm({ ...createForm, custom_fields: updated });
                          }}
                          style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#f8fafc', fontSize: '0.9rem' }}
                        />
                        <select
                          value={field.field_type}
                          onChange={(e) => {
                            const updated = [...createForm.custom_fields];
                            updated[idx].field_type = e.target.value;
                            setCreateForm({ ...createForm, custom_fields: updated });
                          }}
                          style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#f8fafc', fontSize: '0.85rem', minWidth: '80px' }}
                        >
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="phone">Phone</option>
                          <option value="email">Email</option>
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={field.is_required}
                            onChange={(e) => {
                              const updated = [...createForm.custom_fields];
                              updated[idx].is_required = e.target.checked;
                              setCreateForm({ ...createForm, custom_fields: updated });
                            }}
                          />
                          Req
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = createForm.custom_fields.filter((_, i) => i !== idx);
                            setCreateForm({ ...createForm, custom_fields: updated });
                          }}
                          style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
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