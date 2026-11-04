package com.evrental.service;

/**
 * What the job card says will be done, chosen when it is opened.
 *
 * <p>It is a promise the close keeps: a job that said it needed spare parts
 * cannot close without a priced part line, which is what stops a parts job
 * being settled as if nothing was fitted.
 */
public enum RepairType {
    REPAIR_ONLY,
    SPARE_PARTS,
    REPAIR_AND_SPARE_PARTS;

    public boolean requiresParts() {
        return this != REPAIR_ONLY;
    }
}
