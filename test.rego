
package sentinel.servicing_disputes
decision = "ALLOW" { input.amount <= 50 }
reason = "Auto-approved" { input.amount <= 50 }
