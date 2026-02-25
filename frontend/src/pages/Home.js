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
      if (file.size > 5 * 1024 * 1024) {
        alert('Image too large. Maximum 5MB.');
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

  function logout() {
    if (window.confirm('Are you sure you want to sign out?')) {
      localStorage.removeItem('token');
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

            <button className="btn btn-ghost btn-sm" onClick={logout} title="Sign Out">
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
        <section className="hero-section">
          <div className="hero-content">
            <h2 className="hero-title">Welcome back, {firstName}! 👋</h2>
            <p className="hero-description">
              Stay updated with the latest announcements from clubs across campus.
              Like, comment, and engage with your community!
            </p>
          </div>
        </section>

        <section>
          <h2 className="section-title">
            <span>📢</span>
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

        <button className="dock-item" onClick={() => {
          if (notifications.length > 0) {
            const latest = notifications[0];
            alert(`New Notification: ${latest.title}\n\n${latest.body}`);
            // Clear notifications after viewing
            setNotifications([]);
          } else {
            alert("You have no new notifications.");
          }
        }}>
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

        <button className="dock-item" onClick={() => window.location.href = '/profile.html'}>
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
                      <img src={imagePreview} alt="Preview" />
                      <button type="button" className="remove-img-btn" onClick={removeImage}>
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="upload-zone-placeholder" onClick={() => document.getElementById('modalImageInput').click()}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                        <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3M12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p>Click to upload image</p>
                      <span className="upload-hint">PNG, JPG, GIF up to 5MB</span>
                    </div>
                  )}
                  <input
                    id="modalImageInput"
                    type="file"
                    accept="image/*"
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