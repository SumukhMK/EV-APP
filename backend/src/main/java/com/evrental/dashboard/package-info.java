/**
 * The aggregates the dashboard, Today's Operations and the recovery board are
 * drawn from.
 *
 * <p>This module reads across every other one — vehicles, assignments,
 * service jobs, payment periods — and that is deliberate. The alternative is
 * each module publishing its own summary endpoint, which puts the shape of a
 * screen into five packages and makes a change to one tile a five-file
 * conversation. Nothing here writes, and nothing here is called by another
 * module, so the dependency only ever points one way.
 *
 * <p>Everything is counted in SQL rather than by loading rows and counting in
 * Java. A dashboard that loads the fleet to count it gets slower every month
 * the fleet grows, and these are the first queries on the first screen after
 * login.
 *
 * <p>Tenant scoping is by row-level security, as everywhere else: the
 * statements below carry no {@code tenant_id} predicate and do not need one.
 */
package com.evrental.dashboard;
