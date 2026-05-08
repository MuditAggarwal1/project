// server.js — Token exchange proxy for Salesforce OAuth 2.0
// Run with: node server.js
// Runs on http://localhost:3001

import express from "express";
import cors from "cors";

const app = express();
const PORT = 3001;

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "SF Rules Manager proxy running" });
});

// ── Token exchange endpoint ───────────────────────────────────────────────────
// Receives the authorization code from the React app
// Exchanges it with Salesforce for an access token
// Returns the token back to the React app
app.post("/token", async (req, res) => {
  const { code, clientId, redirectUri, loginUrl } = req.body;

  if (!code || !clientId || !redirectUri || !loginUrl) {
    return res.status(400).json({ error: "Missing required fields: code, clientId, redirectUri, loginUrl" });
  }

  const tokenUrl = `${loginUrl}/services/oauth2/token`;

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
  });

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Salesforce token error:", data);
      return res.status(response.status).json(data);
    }

    console.log("✅ Token exchange successful for:", data.id || "unknown user");
    res.json(data);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).json({ error: "Proxy server error", detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   SF Rules Manager — Token Proxy             ║
║   Running on http://localhost:${PORT}           ║
║                                              ║
║   Waiting for OAuth code exchange...         ║
╚══════════════════════════════════════════════╝
  `);
});
