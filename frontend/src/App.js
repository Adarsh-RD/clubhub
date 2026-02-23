// frontend/src/App.js
import React, { useEffect, useState } from "react";
import Home from "./pages/Home";
import "./App.css";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000";

function Logo() {
  return (
    <div className="auth-logo">
      <img
        src="/kle-logo.png"
        alt="KLE Tech"
        onError={(e) => {
          e.target.style.display = 'none';
        }}
      />
    </div>
  );
}

function Input({ label, type = "text", icon, ...props }) {
  return (
    <div className="input-field">
      <label className="input-label">{label}</label>
      <div className="input-wrapper">
        {icon && <span className="input-icon">{icon}</span>}
        <input className="input" type={type} {...props} />
      </div>
    </div>
  );
}

function AuthCard({
  onSendCode,
  onVerifyAndSetPassword,
  onLogin,
  state,
  actions,
}) {
  const { view, email, code, password, confirm, msg } = state;
  const { setEmail, setCode, setPassword, setConfirm, setView } = actions;

  return (
    <div className="auth-card">
      <Logo />

      <div className="auth-header">
        <h1 className="auth-title">Club Hub</h1>
        <p className="auth-subtitle">KLE Technological University</p>
      </div>

      {view === "choose" && (
        <div className="hero-entrance">
          <p className="auth-description">
            Your vibe check passed. Discover, connect, and pull up to events
            across KLE Tech.
          </p>
          <div className="live-counter">
            <span className="live-dot"></span>
            420+ students pulling up right now 🔥
          </div>
          <div className="auth-buttons">
            <button className="btn btn-primary btn-large btn-glow-cyan" onClick={() => setView("login")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              Sign In
            </button>
            <button className="btn btn-secondary btn-large btn-glass" onClick={() => setView("signup-email")}>
              Sign Up
            </button>
          </div>
          <p className="auth-footer-text">
            Join the movement. By signing up, you agree to our community guidelines.
          </p>
        </div>
      )}

      {view === "login" && (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            onLogin();
          }}
        >
          <p className="form-title">Welcome back!</p>

          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.email@kletech.ac.in"
            required
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            }
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            }
          />

          <div className="auth-buttons">
            <button className="btn btn-primary btn-large" type="submit">
              Sign in
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="link-button"
            onClick={() => setView("signup-email")}
          >
            Don't have an account? <strong>Sign up</strong>
          </button>
        </form>
      )}

      {view === "signup-email" && (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSendCode();
          }}
        >
          <p className="form-title">Create your account</p>
          <p className="form-subtitle">Join Club Hub to stay connected with your campus community</p>

          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.email@kletech.ac.in"
            required
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            }
          />

          <div className="auth-buttons">
            <button className="btn btn-primary btn-large" type="submit">
              Send verification code
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="link-button"
            onClick={() => setView("choose")}
          >
            ← Back
          </button>
        </form>
      )}

      {view === "signup-code" && (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            onVerifyAndSetPassword();
          }}
        >
          <p className="form-title">Verify your email</p>
          <p className="form-subtitle">
            We sent a 6-digit code to <strong>{email}</strong>
          </p>

          <Input
            label="Verification Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter 6-digit code"
            maxLength="6"
            required
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="8" y1="12" x2="16" y2="12"></line>
                <line x1="8" y1="8" x2="16" y2="8"></line>
                <line x1="8" y1="16" x2="16" y2="16"></line>
              </svg>
            }
          />
          <Input
            label="Create Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            required
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            }
          />
          <Input
            label="Confirm Password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter password"
            required
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            }
          />

          <div className="auth-buttons">
            <button className="btn btn-primary btn-large" type="submit">
              Create account
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="link-button"
            onClick={() => setView("choose")}
          >
            Cancel
          </button>
        </form>
      )}

      {msg && (
        <div className={`status-message ${msg.includes('✗') ? 'error' : msg.includes('✓') ? 'success' : 'loading'}`}>
          {msg}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.user) {
          setProfile(j.user);
          setView("app");
        } else {
          setToken(null);
          localStorage.removeItem("token");
          setView("choose");
        }
      })
      .catch(() => {
        setToken(null);
        localStorage.removeItem("token");
        setView("choose");
      });
  }, [token]);

  async function sendCode() {
    setMsg("📤 Sending verification code...");
    try {
      const r = await fetch(`${API_BASE}/auth/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to send code");
      setMsg("✓ Code sent! Check your email inbox.");
      setView("signup-code");
    } catch (err) {
      setMsg("✗ Error: " + err.message);
    }
  }

  async function verifyAndSetPassword() {
    setMsg("🔄 Verifying your account...");
    if (password.length < 6) {
      setMsg("✗ Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setMsg("✗ Passwords do not match");
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password, confirm }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Verification failed");
      setToken(j.token);
      localStorage.setItem("token", j.token);
      const visibleEmail = (j.user && (j.user.email || j.user.sub)) || email;
      localStorage.setItem("user_email", visibleEmail);
      setProfile(j.user);
      setMsg("✓ Welcome to Club Hub!");
      setView("app");
    } catch (err) {
      setMsg("✗ Error: " + err.message);
    }
  }

  async function login() {
    setMsg("🔄 Signing you in...");
    try {
      const r = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Login failed");
      setToken(j.token);
      localStorage.setItem("token", j.token);
      const visibleEmail = (j.user && (j.user.email || j.user.sub)) || email;
      localStorage.setItem("user_email", visibleEmail);
      setProfile(j.user);
      setMsg("✓ Welcome back!");
      setView("app");
    } catch (err) {
      setMsg("✗ Error: " + err.message);
    }
  }

  function logout() {
    setToken(null);
    localStorage.removeItem("token");
    setProfile(null);
    setEmail("");
    setPassword("");
    setCode("");
    setConfirm("");
    setMsg("");
    setView("choose");
  }

  // Show auth screen if not logged in
  if (view !== "app") {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <AuthCard
            onSendCode={sendCode}
            onVerifyAndSetPassword={verifyAndSetPassword}
            onLogin={login}
            state={{ view, email, code, password, confirm, msg }}
            actions={{ setEmail, setCode, setPassword, setConfirm, setView }}
          />
        </div>
      </div>
    );
  }

  return <Home />;
}