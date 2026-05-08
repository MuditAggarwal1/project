import { useState, useEffect, useCallback } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SF_CONFIG = {
  clientId: import.meta.env.VITE_SF_CLIENT_ID || "YOUR_CONNECTED_APP_CLIENT_ID",
  redirectUri: import.meta.env.VITE_SF_REDIRECT_URI || window.location.origin,
  loginUrl: import.meta.env.VITE_SF_LOGIN_URL || "https://login.salesforce.com",
  proxyUrl: import.meta.env.VITE_PROXY_URL || "http://localhost:3001",
};

// ─── OAUTH HELPERS ────────────────────────────────────────────────────────────
function buildAuthUrl() {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: SF_CONFIG.clientId,
    redirect_uri: SF_CONFIG.redirectUri,
    scope: "full refresh_token",
    prompt: "login",
  });
  return `${SF_CONFIG.loginUrl}/services/oauth2/authorize?${params}`;
}

// ─── SALESFORCE API ───────────────────────────────────────────────────────────
async function sfFetch(instanceUrl, accessToken, path, options = {}) {
  const res = await fetch(`${instanceUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Salesforce API error ${res.status}: ${err}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getUserInfo(instanceUrl, accessToken) {
  return sfFetch(instanceUrl, accessToken, "/services/oauth2/userinfo");
}

async function getValidationRules(instanceUrl, accessToken) {
  const soql = encodeURIComponent(
    `SELECT Id, ValidationName, Active, Description, ErrorMessage, EntityDefinition.QualifiedApiName 
     FROM ValidationRule 
     WHERE EntityDefinition.QualifiedApiName = 'Account'`
  );
  const data = await sfFetch(
    instanceUrl,
    accessToken,
    `/services/data/v59.0/tooling/query?q=${soql}`
  );
  return data.records || [];
}

async function toggleValidationRule(instanceUrl, accessToken, ruleId, active) {
  return sfFetch(
    instanceUrl,
    accessToken,
    `/services/data/v59.0/tooling/sobjects/ValidationRule/${ruleId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ Metadata: { active } }),
    }
  );
}

async function deployValidationRules(instanceUrl, accessToken, rules) {
  const results = [];
  for (const rule of rules) {
    try {
      await toggleValidationRule(instanceUrl, accessToken, rule.Id, rule.Active);
      results.push({ id: rule.Id, success: true });
    } catch (e) {
      results.push({ id: rule.Id, success: false, error: e.message });
    }
  }
  return results;
}

// ─── ICONS ────────────────────────────────────────────────────────────────────
const icons = {
  cloud: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  deploy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <span className="toast-icon">{t.type === "success" ? icons.check : icons.x}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ─── TOGGLE SWITCH ────────────────────────────────────────────────────────────
function Toggle({ active, onChange, disabled }) {
  return (
    <button
      className={`toggle ${active ? "toggle--on" : "toggle--off"}`}
      onClick={() => onChange(!active)}
      disabled={disabled}
      aria-label={active ? "Deactivate" : "Activate"}
    >
      <span className="toggle-knob" />
    </button>
  );
}

// ─── VALIDATION RULE CARD ─────────────────────────────────────────────────────
function RuleCard({ rule, onToggle, pending, deploying }) {
  const isPending = pending.has(rule.Id);
  const currentActive = isPending ? !rule.Active : rule.Active;

  return (
    <div className={`rule-card ${currentActive ? "rule-card--active" : "rule-card--inactive"} ${isPending ? "rule-card--pending" : ""}`}>
      <div className="rule-card__header">
        <div className="rule-card__status-dot" />
        <h3 className="rule-card__name">{rule.ValidationName}</h3>
        <span className={`rule-card__badge ${currentActive ? "badge--on" : "badge--off"}`}>
          {currentActive ? "ACTIVE" : "INACTIVE"}
        </span>
      </div>

      {rule.Description && (
        <p className="rule-card__desc">{rule.Description}</p>
      )}

      <div className="rule-card__error">
        <span className="rule-card__error-label">Error Message</span>
        <span className="rule-card__error-text">{rule.ErrorMessage || "—"}</span>
      </div>

      <div className="rule-card__footer">
        <span className="rule-card__id">ID: {rule.Id}</span>
        {isPending && <span className="rule-card__pending-tag">⚡ Pending Deploy</span>}
        <Toggle active={currentActive} onChange={() => onToggle(rule)} disabled={deploying} />
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [rules, setRules] = useState([]);
  const [pending, setPending] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [phase, setPhase] = useState("idle");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const addToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  // ── Handle OAuth Authorization Code callback ──
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const error = urlParams.get("error");
    const errorDesc = urlParams.get("error_description");

    if (error) {
      setAuthError(`OAuth Error: ${errorDesc || error}`);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (!code) return;

    // Clear code from URL immediately
    window.history.replaceState({}, document.title, window.location.pathname);
    setAuthLoading(true);

    // Exchange code for token via local proxy server (server.js)
    fetch(`${SF_CONFIG.proxyUrl}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        clientId: SF_CONFIG.clientId,
        redirectUri: SF_CONFIG.redirectUri,
        loginUrl: SF_CONFIG.loginUrl,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.access_token) {
          const authData = {
            accessToken: data.access_token,
            instanceUrl: data.instance_url,
          };
          setAuth(authData);
          sessionStorage.setItem("sf_auth", JSON.stringify(authData));
          return getUserInfo(authData.instanceUrl, authData.accessToken);
        } else {
          throw new Error(data.error_description || data.error || "Token exchange failed");
        }
      })
      .then((info) => {
        if (info) setUser(info);
        addToast("Successfully logged in to Salesforce!");
      })
      .catch((e) => {
        setAuthError("Login failed: " + e.message);
        addToast("Login failed: " + e.message, "error");
      })
      .finally(() => setAuthLoading(false));
  }, []);

  // ── Restore session ──
  useEffect(() => {
    const stored = sessionStorage.getItem("sf_auth");
    if (stored && !auth) {
      const authData = JSON.parse(stored);
      setAuth(authData);
      getUserInfo(authData.instanceUrl, authData.accessToken)
        .then((info) => setUser(info))
        .catch(() => {
          sessionStorage.removeItem("sf_auth");
          setAuth(null);
        });
    }
  }, []);

  const handleLogin = () => {
    setAuthError("");
    window.location.href = buildAuthUrl();
  };

  const handleLogout = () => {
    sessionStorage.removeItem("sf_auth");
    setAuth(null);
    setUser(null);
    setRules([]);
    setPending(new Map());
    setPhase("idle");
  };

  const handleFetchRules = async () => {
    if (!auth) return;
    setLoading(true);
    setPhase("fetching");
    try {
      const fetched = await getValidationRules(auth.instanceUrl, auth.accessToken);
      setRules(fetched.map((r) => ({ ...r, _original: r.Active })));
      setPending(new Map());
      setPhase("done");
      addToast(`Fetched ${fetched.length} validation rule(s)`);
    } catch (e) {
      addToast("Failed to fetch rules: " + e.message, "error");
      setPhase("idle");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (rule) => {
    setPending((prev) => {
      const next = new Map(prev);
      if (next.has(rule.Id)) {
        next.delete(rule.Id);
      } else {
        next.set(rule.Id, rule.Active);
      }
      return next;
    });
  };

  const handleSetAll = (activate) => {
    const next = new Map();
    rules.forEach((r) => {
      if (r.Active !== activate) next.set(r.Id, r.Active);
    });
    setPending(next);
  };

  const handleDeploy = async () => {
    if (!auth || pending.size === 0) return;
    setDeploying(true);
    const toChange = rules
      .filter((r) => pending.has(r.Id))
      .map((r) => ({ ...r, Active: !r.Active }));
    try {
      const results = await deployValidationRules(auth.instanceUrl, auth.accessToken, toChange);
      const failed = results.filter((r) => !r.success);
      if (failed.length === 0) {
        setRules((prev) =>
          prev.map((r) =>
            pending.has(r.Id) ? { ...r, Active: !r.Active, _original: !r.Active } : r
          )
        );
        setPending(new Map());
        addToast(`Successfully deployed ${results.length} rule(s) to Salesforce!`);
      } else {
        addToast(`${failed.length} rule(s) failed to deploy`, "error");
      }
    } catch (e) {
      addToast("Deploy failed: " + e.message, "error");
    } finally {
      setDeploying(false);
    }
  };

  const activeCount = rules.filter((r) =>
    pending.has(r.Id) ? !r.Active : r.Active
  ).length;

  if (authLoading) {
    return (
      <div className="app">
        <div className="bg-grid" />
        <div className="bg-glow" />
        <div className="auth-loading">
          <div className="loader" />
          <p>Connecting to Salesforce…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toast toasts={toasts} />
      <div className="app">
        <div className="bg-grid" />
        <div className="bg-glow" />

        <header className="header">
          <div className="header__brand">
            <span className="header__icon">{icons.cloud}</span>
            <div>
              <h1 className="header__title">SF Rules<span className="header__title-accent">Manager</span></h1>
              <p className="header__subtitle">Salesforce Validation Rules · Tooling API</p>
            </div>
          </div>
          {auth && user && (
            <div className="header__user">
              <span className="header__user-icon">{icons.user}</span>
              <div className="header__user-info">
                <span className="header__user-name">{user.preferred_username || user.email}</span>
                <span className="header__user-org">{user.organization_id}</span>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={handleLogout}>
                {icons.logout} Logout
              </button>
            </div>
          )}
        </header>

        <main className="main">
          {!auth ? (
            <div className="login-screen">
              <div className="login-card">
                <div className="login-card__icon">{icons.shield}</div>
                <h2 className="login-card__title">Connect to Salesforce</h2>
                <p className="login-card__desc">
                  Log in with your Salesforce credentials to manage validation rules directly from this dashboard.
                </p>
                {authError && (
                  <div className="auth-error">
                    <span className="auth-error__icon">{icons.x}</span>
                    <span>{authError}</span>
                  </div>
                )}
                <button className="btn btn--primary btn--lg" onClick={handleLogin}>
                  <span className="btn__sfdc-dot" />
                  Login with Salesforce
                </button>
                <p className="login-card__note">
                  Uses OAuth 2.0 Authorization Code Flow — your credentials are never stored here.
                </p>
              </div>

              <div className="setup-box">
                <h3 className="setup-box__title">⚙️ Both servers must be running</h3>
                <ol className="setup-box__list">
                  <li>Terminal 1 → <code>npm run dev</code> (React app on port 3000)</li>
                  <li>Terminal 2 → <code>node server.js</code> (Proxy on port 3001)</li>
                  <li>Callback URL in Salesforce must be: <code>http://localhost:3000</code></li>
                  <li><code>VITE_SF_CLIENT_ID</code> must be set in your <code>.env</code> file</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="dashboard">
              <div className="stats-bar">
                <div className="stat">
                  <span className="stat__num">{rules.length}</span>
                  <span className="stat__label">Total Rules</span>
                </div>
                <div className="stat">
                  <span className="stat__num stat__num--green">{activeCount}</span>
                  <span className="stat__label">Active</span>
                </div>
                <div className="stat">
                  <span className="stat__num stat__num--dim">{rules.length - activeCount}</span>
                  <span className="stat__label">Inactive</span>
                </div>
                <div className="stat">
                  <span className="stat__num stat__num--amber">{pending.size}</span>
                  <span className="stat__label">Pending</span>
                </div>
              </div>

              <div className="toolbar">
                <button className="btn btn--primary" onClick={handleFetchRules} disabled={loading}>
                  {loading ? <span className="spinner" /> : icons.refresh}
                  {phase === "done" ? "Refresh Rules" : "Get Validation Rules"}
                </button>
                {rules.length > 0 && (
                  <>
                    <button className="btn btn--outline btn--green" onClick={() => handleSetAll(true)} disabled={deploying}>
                      {icons.check} Enable All
                    </button>
                    <button className="btn btn--outline btn--red" onClick={() => handleSetAll(false)} disabled={deploying}>
                      {icons.x} Disable All
                    </button>
                    <button
                      className={`btn btn--deploy ${pending.size > 0 ? "btn--deploy--active" : ""}`}
                      onClick={handleDeploy}
                      disabled={pending.size === 0 || deploying}
                    >
                      {deploying ? <span className="spinner" /> : icons.deploy}
                      Deploy to Salesforce
                      {pending.size > 0 && <span className="btn__badge">{pending.size}</span>}
                    </button>
                  </>
                )}
              </div>

              {phase === "idle" && (
                <div className="empty-state">
                  <div className="empty-state__icon">{icons.cloud}</div>
                  <p>Click <strong>Get Validation Rules</strong> to load your Account rules.</p>
                </div>
              )}
              {phase === "fetching" && loading && (
                <div className="empty-state">
                  <div className="loader" />
                  <p>Querying Salesforce Tooling API…</p>
                </div>
              )}
              {phase === "done" && rules.length === 0 && (
                <div className="empty-state">
                  <p>No validation rules found on the Account object.</p>
                  <p className="empty-state__hint">Go to Salesforce Setup → Object Manager → Account → Validation Rules.</p>
                </div>
              )}
              {phase === "done" && rules.length > 0 && (
                <div className="rules-grid">
                  {rules.map((rule) => (
                    <RuleCard key={rule.Id} rule={rule} onToggle={handleToggle} pending={pending} deploying={deploying} />
                  ))}
                </div>
              )}

              {pending.size > 0 && (
                <div className="pending-banner">
                  <span>⚡ {pending.size} unsaved change{pending.size > 1 ? "s" : ""} — click <strong>Deploy to Salesforce</strong> to apply.</span>
                  <button className="btn btn--ghost btn--sm" onClick={() => setPending(new Map())}>Discard</button>
                </div>
              )}
            </div>
          )}
        </main>

        <footer className="footer">
          <span>SF Rules Manager · OAuth 2.0 Authorization Code Flow + Tooling API · React + Express</span>
        </footer>
      </div>
    </>
  );
}
