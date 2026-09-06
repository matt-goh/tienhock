# Conversational security answers

Updated for the [5 September remediation](SECURITY_REMEDIATION_2026-09-05.md). The changes are in the repository. The [6 September preparation](DEPLOYMENT_READINESS_2026-09-06.md) verified the restricted database role, an independent recovery copy, a restore and backend checks with restored data. Production application rollout, installed-phone verification and ongoing protected-backup policies remain pending. Do not describe the application changes as live before deployment.

**“Can somebody just sabotage all the data anytime they want?”**

“The APIs require authentication, and I’ve fixed the identified injection paths and restricted backup administration. Shared staff passwords and the legacy mobile key remain weaknesses, so I wouldn’t claim sabotage is impossible. Deployment and ongoing backup protection are still pending; we have verified one independent recovery copy and restore.”

After deployment, with the independently stored recovery copy and continued backup checks:

“Ordinary sessions cannot administer office access or restore the database, but shared credentials mean administrator impersonation remains possible. Staff can still edit business records, so we also keep protected, tested recovery copies. The legacy mobile key is another remaining limitation.”

**“What did you actually improve?”**

“I removed executable input from backup commands and payroll SQL, moved session tokens into HttpOnly cookies, added login throttling, and fixed the identified transactions. Profile edits preserve passwords and API replies no longer expose their hashes.”

**“Why bother if the employees are trusted?”**

“Trusted employees can still make mistakes or have credentials stolen. We kept shared passwords as an explicit small-business tradeoff, so logs identify the account used but don’t prove which person acted. Data integrity and recoverable backups remain essential.”

**“What stops an ordinary user from becoming an administrator?”**

“The server restricts administrative actions to four staff IDs. However, someone who knows the shared password and an administrator’s login IC can impersonate that account. The restriction helps, but unique credentials would be needed for stronger separation.”

**“Can you recover from an attack?”**

“We now have daily backup code and visible failure handling. I’m not promising recovery until a copy is protected from the app’s credentials and we’ve rehearsed restoring the database and its documents. A scheduled job alone isn’t enough evidence.”

**“Does Cloudflare make the app secure?”**

“It gives us the public entry point and HTTPS. I still have to enforce permissions, validate inputs, protect credentials and keep the origin restricted. Those responsibilities remain in the application and server configuration.”

**“Are there known limitations?”**

“Yes. We retain shared office passwords by owner decision and a shared mobile key for compatibility. Both can enable impersonation; the mobile key can still change permitted sales data. Credential rotation, MFA verification and protected recovery setup are also outstanding.”

**“Does this meet enterprise security standards?”**

“I use OWASP guidance and document what I verified and what remains. I don’t claim certification or complete compliance. For this small business, I prioritise account protection, data integrity and recovery, then demonstrate those controls with evidence.”

**“How would you handle a suspected breach?”**

“I’d restrict affected access, preserve logs, revoke compromised credentials and establish what changed. Then I’d fix the entry point and restore or reconcile from a verified clean copy, with the business owner involved.”

Avoid claiming that every edit is audited, every query is safe, backups are immutable, MFA is enabled, or recovery is guaranteed. Those statements need specific evidence.
