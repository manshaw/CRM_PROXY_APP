const express = require("express");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 8081);
const CRM_BASE_URL = "https://crmmr.mrealtors.pk";

// Server-side cookie jar: keyed by username, populated after login
const sessionCookies = new Map();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

async function relayResponse(upstreamResponse, res) {
  const body = await upstreamResponse.text();
  const contentType =
    upstreamResponse.headers.get("content-type") || "application/json";

  res.status(upstreamResponse.status);
  res.setHeader("Content-Type", contentType);
  res.send(body);
}

app.post("/checkuserlogin.php", async (req, res) => {
  try {
    const userName = String(req.body.user_name || "").trim();
    const password = String(req.body.password || "");

    if (!userName || !password) {
      return res.status(400).json({
        success: false,
        message: "user_name and password are required",
      });
    }

    const body = new URLSearchParams({
      user_name: userName,
      password,
    });

    const upstreamResponse = await fetch(
      `${CRM_BASE_URL}/checkuserlogin.php`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
      }
    );

    // Capture and store session cookies for subsequent authenticated requests
    const setCookieValues =
      typeof upstreamResponse.headers.getSetCookie === "function"
        ? upstreamResponse.headers.getSetCookie()
        : [];
    const cookieStr = setCookieValues
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
    if (cookieStr) {
      sessionCookies.set(userName, cookieStr);
    }

    await relayResponse(upstreamResponse, res);
  } catch (error) {
    console.error("Login proxy error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to reach the CRM login service",
      error: error.message,
    });
  }
});

app.get("/get_leads.php", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    const limit = Number(req.query.limit || 10);
    const cursorId = req.query.cursor_id;

    if (!username) {
      return res.status(400).json({
        status: false,
        message: "username is required",
      });
    }

    if (!Number.isInteger(limit) || limit < 1) {
      return res.status(400).json({
        status: false,
        message: "limit must be a positive integer",
      });
    }

    const url = new URL(`${CRM_BASE_URL}/get_leads.php`);
    url.searchParams.set("username", username);
    url.searchParams.set("limit", String(limit));

    if (cursorId !== undefined && String(cursorId).trim() !== "") {
      url.searchParams.set("cursor_id", String(cursorId).trim());
    }

    const upstreamResponse = await fetch(url, {
      method: "GET",
    });

    await relayResponse(upstreamResponse, res);
  } catch (error) {
    console.error("Leads proxy error:", error);

    res.status(500).json({
      status: false,
      message: "Unable to reach the CRM leads service",
      error: error.message,
    });
  }
});

app.post("/save_call_tele.php", async (req, res) => {
  try {
    const phoneNumber = String(req.body.phone_number || "").trim();
    const callStartTime = String(req.body.call_start_time || "").trim();
    const callEndTime = String(req.body.call_end_time || "").trim();
    const callDuration = String(req.body.call_duration || "").trim();
    const username = String(req.body.username || "").trim();
    const leadId = String(req.body.lead_id || "").trim();

    if (!phoneNumber || !callStartTime || !callEndTime || !callDuration || !username || !leadId) {
      return res.status(400).json({
        success: false,
        message: "All fields are required: phone_number, call_start_time, call_end_time, call_duration, username, lead_id",
      });
    }

    const body = new URLSearchParams({
      phone_number: phoneNumber,
      call_start_time: callStartTime,
      call_end_time: callEndTime,
      call_duration: callDuration,
      username,
      lead_id: leadId,
    });

    const headers = {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    };

    const storedCookie = sessionCookies.get(username);
    if (storedCookie) {
      headers["Cookie"] = storedCookie;
    }

    const upstreamResponse = await fetch(`${CRM_BASE_URL}/save_call_tele.php`, {
      method: "POST",
      headers,
      body,
    });

    await relayResponse(upstreamResponse, res);
  } catch (error) {
    console.error("save_call_tele proxy error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to reach the CRM save_call_tele service",
      error: error.message,
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "CRM proxy is running",
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Export for Vercel serverless; also start local server when run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CRM proxy app running at http://localhost:${PORT}`);
  });
}

module.exports = app;
