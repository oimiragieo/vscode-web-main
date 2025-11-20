import { Router } from "express"
import { CookieKeys } from "../../common/http"
import { authenticated, getCookieOptions, redirect } from "../http"
import { sanitizeString } from "../util"
import { createAuditEvent, logAuditEvent } from "../audit"
import { AuditEventType } from "../services/types"

export const router = Router()

// SECURITY FIX: Changed logout from GET to POST to prevent CSRF attacks
// A malicious website could log users out by including: <img src="https://your-ide.com/logout">
// Now requires an authenticated POST request, preventing cross-site logout attacks

router.post<{}, undefined, { to?: string }, {}>("/", async (req, res) => {
  // Must use the *identical* properties used to set the cookie.
  res.clearCookie(CookieKeys.Session, getCookieOptions(req))

  // AUDIT: Log successful logout
  await logAuditEvent(
    createAuditEvent(AuditEventType.UserLogout, req, "success", {
      method: "POST",
      to: sanitizeString(req.body?.to) || "/",
    }),
  )

  const to = sanitizeString(req.body?.to) || "/"
  return redirect(req, res, to, { to: undefined, base: undefined, href: undefined })
})

// Backwards compatibility: Support GET requests but show deprecation notice
// TODO: Remove this after clients are updated to use POST
router.get<{}, undefined, undefined, { base?: string; to?: string }>("/", async (req, res) => {
  // Log deprecation warning
  console.warn("DEPRECATED: GET /logout is deprecated and will be removed. Use POST /logout instead.")

  res.clearCookie(CookieKeys.Session, getCookieOptions(req))

  // AUDIT: Log logout via deprecated GET method
  await logAuditEvent(
    createAuditEvent(AuditEventType.UserLogout, req, "success", {
      method: "GET",
      deprecated: true,
      to: sanitizeString(req.query.to) || "/",
    }),
  )

  const to = sanitizeString(req.query.to) || "/"
  return redirect(req, res, to, { to: undefined, base: undefined, href: undefined })
})
