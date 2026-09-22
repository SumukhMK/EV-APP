/**
 * Rider charges, the weekly Wed-to-Tue payment run, receipts, overdue, dunning. Listens for ServiceJobClosedEvent. Money rows are append-only.
 *
 * <p>Stage S6 in docs/BUILD.md — owner: SMK. Empty until that stage starts;
 * this file exists so the boundary is real from day one and nobody puts a
 * class in the wrong module by accident.
 */
package com.evrental.payment;
