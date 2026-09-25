package com.evrental.service;

/**
 * Who pays, matching ServiceLiability in
 * frontend/app/src/types/serviceJob.ts.
 *
 * <p>Null until the job closes — deciding this *is* what closing a job means,
 * and the database says so (chk_sj_closed_has_liability). Two of the three
 * raise a charge against the rider; COMPANY is the fleet absorbing it.
 */
public enum ServiceLiability {
    /** Taken out of the rider's deposit. */
    DEPOSIT,
    /** Billed to the rider on the next payment run. */
    RIDER,
    /** The fleet absorbs it. No charge is raised. */
    COMPANY;

    /** Whether closing with this liability owes the rider a charge. */
    public boolean raisesCharge() {
        return this != COMPANY;
    }
}
