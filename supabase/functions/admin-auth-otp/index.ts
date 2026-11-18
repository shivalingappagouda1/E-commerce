
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "";
const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": APP_ORIGIN,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
    },
  });
}

async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );

  return Array.from(
    new Uint8Array(signature),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function sessionIdFromJwt(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    const normalized = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const decoded = atob(
      normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="),
    );

    const claims = JSON.parse(decoded);
    const value = claims?.session_id;

    return typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value,
        )
      ? value
      : null;
  } catch {
    return null;
  }
}

// Uniformly sample an integer in [0, 100,000,000), avoiding modulo bias.
function randomOtp(): string {
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / 100_000_000) * 100_000_000;
  const value = new Uint32Array(1);

  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);

  return String(value[0] % 100_000_000).padStart(8, "0");
}

async function sendBrevoEmail(
  to: string,
  otp: string,
): Promise<void> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const sender = Deno.env.get("BREVO_SENDER_EMAIL");

  if (!apiKey || !sender) {
    throw new Error("Email provider is not configured.");
  }

  const response = await fetch(
    "https://api.brevo.com/v3/smtp/email",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        sender: {
          name: "ShopKart Security",
          email: sender,
        },
        to: [{ email: to }],
        subject: "Your ShopKart admin sign-in code",
        textContent:
          `Your ShopKart administrator verification code is ${otp}. It expires in 5 minutes. Do not share this code.`,
        htmlContent:
          `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
            <h2>ShopKart administrator verification</h2>
            <p>Use this code to finish signing in:</p>
            <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px 0">${otp}</div>
            <p>This code expires in 5 minutes. Do not share it with anyone.</p>
          </div>`,
      }),
    },
  );

  if (!response.ok) {
    const providerMessage = await response.text();

    console.error(
      "Brevo send failed:",
      response.status,
      providerMessage.slice(0, 500),
    );

    throw new Error("Brevo email delivery failed.");
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  // Strict Origin validation: reject missing or mismatched origins.
  if (
    !APP_ORIGIN ||
    !origin ||
    origin !== APP_ORIGIN
  ) {
    return new Response(
      "Origin not allowed or APP_ORIGIN is not configured.",
      { status: 403 },
    );
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders(),
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const hashSecret = Deno.env.get("OTP_HASH_SECRET");

    if (
      !supabaseUrl ||
      !anonKey ||
      !serviceRoleKey ||
      !hashSecret ||
      hashSecret.length < 32
    ) {
      console.error("Missing or weak Edge Function configuration.");

      return json(
        { error: "Server configuration is incomplete." },
        500,
      );
    }

    const authorization = req.headers.get("Authorization") ?? "";
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!bearer) {
      return json({ error: "Authentication required." }, 401);
    }

    let body: { action?: unknown; code?: unknown };

    try {
      body = await req.json();
    } catch {
      return json(
        { error: "Request body must be valid JSON." },
        400,
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return json({ error: "Invalid request body." }, 400);
    }

    // Validate the current Supabase Auth user.
    const authClient = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${bearer}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: authData, error: authError } =
      await authClient.auth.getUser(bearer);

    if (authError || !authData.user) {
      return json(
        { error: "Invalid or expired session. Sign in again." },
        401,
      );
    }

    const user = authData.user;

    const sessionId = sessionIdFromJwt(bearer);

    if (!sessionId) {
      return json(
        {
          error:
            "Could not identify this login session. Sign in again.",
        },
        401,
      );
    }

    if (!user.email) {
      return json(
        { error: "Your account has no email address." },
        400,
      );
    }

    // Service-role client is used only inside this trusted function.
    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    // Verify the user's actual profile role.
    const { data: profile, error: profileError } =
      await adminClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError) {
      console.error(
        "Profile lookup failed:",
        profileError.message,
      );

      return json(
        { error: "Could not verify administrator access." },
        500,
      );
    }

    if (profile?.role !== "admin") {
      return json(
        { error: "This account is not an administrator." },
        403,
      );
    }

    const action = body.action;

    // Check whether this Auth session has completed OTP verification.
    if (action === "status") {
      const { data, error } = await adminClient.rpc(
        "admin_otp_session_status",
        {
          p_user_id: user.id,
          p_session_id: sessionId,
        },
      );

      if (error) {
        console.error(
          "OTP status RPC failed:",
          error.message,
        );

        throw new Error("OTP status check failed.");
      }

      return json({ verified: data === true });
    }

    // Generate and email a new OTP.
    if (action === "start") {
      const otp = randomOtp();

      const otpHash = await hmacSha256Hex(
        hashSecret,
        `${user.id}:${sessionId}:${otp}`,
      );

      const { data, error } = await adminClient.rpc(
        "admin_otp_issue",
        {
          p_user_id: user.id,
          p_session_id: sessionId,
          p_otp_hash: otpHash,
        },
      );

      if (error) {
        if (
          error.message.toLowerCase().includes("cooldown")
        ) {
          return json(
            {
              error:
                "Please wait 60 seconds before requesting another code.",
            },
            429,
          );
        }

        console.error(
          "OTP issue RPC failed:",
          error.message,
        );

        throw new Error("OTP issue failed.");
      }

      if (data !== true) {
        return json(
          { error: "Unable to issue a verification code." },
          429,
        );
      }

      try {
        await sendBrevoEmail(user.email, otp);
      } catch (emailError) {
        // Cancel only this undelivered challenge.
        const { error: cancelError } = await adminClient.rpc(
          "admin_otp_cancel_issue",
          {
            p_user_id: user.id,
            p_session_id: sessionId,
            p_otp_hash: otpHash,
          },
        );

        if (cancelError) {
          console.error(
            "Could not cancel undelivered OTP:",
            cancelError.message,
          );
        }

        throw emailError;
      }

      return json({
        sent: true,
        expiresIn: 300,
        resendAfter: 60,
      });
    }

    // Verify the submitted OTP.
    if (action === "verify") {
      const normalized =
        typeof body.code === "string"
          ? body.code.trim()
          : "";

      if (!/^\d{8}$/.test(normalized)) {
        return json(
          { error: "Enter the 8-digit verification code." },
          400,
        );
      }

      const candidateHash = await hmacSha256Hex(
        hashSecret,
        `${user.id}:${sessionId}:${normalized}`,
      );

      const { data, error } = await adminClient.rpc(
        "admin_otp_verify",
        {
          p_user_id: user.id,
          p_session_id: sessionId,
          p_otp_hash: candidateHash,
        },
      );

      if (error) {
        console.error(
          "OTP verification RPC failed:",
          error.message,
        );

        throw new Error("OTP verification failed.");
      }

      if (data !== true) {
        return json(
          {
            error:
              "The code is incorrect, expired, or the attempt limit was reached.",
          },
          400,
        );
      }

      return json({ verified: true });
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    // Keep technical details in server logs only.
    console.error("admin-auth-otp internal error:", error);

    return json(
      { error: "An unexpected error occurred. Please try again." },
      500,
    );
  }
});
