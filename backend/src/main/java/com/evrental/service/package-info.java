/**
 * Service jobs: a bike's visit to the workshop, from intake to QC release.
 *
 * <p>Stage S4 in docs/BUILD.md — owner: SMK. Four tables (V006), the nine
 * queues, the QC gate and the cost lines that become a rider's charge.
 * Full design in docs/backend/SERVICE_MANAGEMENT.md.
 *
 * <p>Two rules hold the module to the rest of the system. It never writes
 * vehicles.state — every move goes through VehicleTransitions.transitionState(),
 * which is what writes the lifecycle log. And other modules reach it through
 * ServiceJobFacade and nothing else, so the handshake with S5 is one method
 * wide.
 */
package com.evrental.service;
