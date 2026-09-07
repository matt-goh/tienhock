# Conversational security answers

Updated for the [5 September remediation](SECURITY_REMEDIATION_2026-09-05.md) and [production rollout](DEPLOYMENT_READINESS_2026-09-06.md), completed on 7 September Malaysia time. The restricted database role and security backend are live; both frontend domains serve the cookie-session release. An independent recovery copy and restore were verified. Live mobile downloads passed, while interactive sign-in, installed-phone submission and ongoing protected-backup policies still need checking.

**“Can somebody just sabotage all the data anytime they want?”**

“The APIs require authentication, and ordinary database access is restricted. Restoring a backup is reserved for four administrator accounts. Authorized users can still damage business records, especially with shared credentials, so we also need recovery copies. We have tested an independent copy, but ongoing protected retention still needs work.”

The [restore reinstatement](DEPLOYMENT_READINESS_2026-09-06.md#restore-feature-verification) restores the administrator workflow through a dedicated server helper; publish its frontend/backend changes before describing that button as available in production.

**“What did you actually improve?”**

“I removed executable input from backup commands and payroll SQL, moved session tokens into HttpOnly cookies, added login throttling, and fixed the identified transactions. Profile edits preserve passwords and API replies no longer expose their hashes.”

**“Why bother if the employees are trusted?”**

“Trusted employees can still make mistakes or have credentials stolen. We kept shared passwords as an explicit small-business tradeoff, so logs identify the account used but don’t prove which person acted. Data integrity and recoverable backups remain essential.”

**“What stops an ordinary user from becoming an administrator?”**

“The server restricts administrative actions to four staff IDs. However, someone who knows the shared password and an administrator’s login IC can impersonate that account. The restriction helps, but unique credentials would be needed for stronger separation.”

**“Can you recover from an attack?”**

“We restored an independent production backup into a separate database and checked its row counts and accounting totals. Daily backups and failure handling are deployed, but we still need to verify the next scheduled run and establish ongoing protected retention. I wouldn’t promise recovery from an untested backup.”

**“Does Cloudflare make the app secure?”**

“It gives us the public entry point and HTTPS. I still have to enforce permissions, validate inputs, protect credentials and keep the origin restricted. Those responsibilities remain in the application and server configuration.”

**“Are there known limitations?”**

“Yes. We retain shared office passwords by owner decision and a shared mobile key for compatibility. Both can enable impersonation; the mobile key can still change permitted sales data. Credential rotation, MFA verification and protected recovery setup are also outstanding.”

**“Does this meet enterprise security standards?”**

“I use OWASP guidance and document what I verified and what remains. I don’t claim certification or complete compliance. For this small business, I prioritise account protection, data integrity and recovery, then demonstrate those controls with evidence.”

**“How would you handle a suspected breach?”**

“I’d restrict affected access, preserve logs, revoke compromised credentials and establish what changed. Then I’d fix the entry point and restore or reconcile from a verified clean copy, with the business owner involved.”

Avoid claiming that every edit is audited, every query is safe, backups are immutable, MFA is enabled, or recovery is guaranteed. Those statements need specific evidence.
