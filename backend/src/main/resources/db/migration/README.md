# Writing a migration here

Three rules, and the second and third have each already cost us a broken
database.

## 1. Add row-level security with the helper

```sql
SELECT enable_tenant_rls('your_table');
```

Not a hand-written `CREATE POLICY`. The helper adds `FORCE`, and without
`FORCE` the role that owns the table — which is the role the application
connects as — ignores its own policy. A policy that does not apply to the
connection actually in use is worse than no policy, because it reads as
protection.

## 2. A data migration must set the tenant bypass first

**Any `UPDATE` or `DELETE` against a table with RLS silently affects zero rows
unless the transaction has a tenant set.** Flyway sets none. So this:

```sql
UPDATE users SET role = 'FLEET_ADMIN' WHERE role = 'TENANT_ADMIN';
```

reports `UPDATE 0` on a database that has users, and the migration carries on
as though it had worked. Add the sentinel first:

```sql
SELECT set_config('app.tenant_id', '*', true);   -- the super-admin bypass

UPDATE users SET role = 'FLEET_ADMIN' WHERE role = 'TENANT_ADMIN';
```

`true` makes it transaction-local, so it ends with the migration.

### This is not hypothetical — see V005

`V005__fleet_admin_role.sql` drops `chk_user_role`, renames the role, and adds
the constraint back with the new name. It has no bypass, so on any database
that already had users the `UPDATE` touched nothing and the `ADD CONSTRAINT`
then failed on the rows it was supposed to have fixed:

```
ERROR: check constraint "chk_user_role" of relation "users"
       is violated by some row
```

The whole migration rolls back, Flyway stops, and the application will not
start — it stays stuck at V004 on every boot.

**It is not fixed in place.** Editing an applied migration changes its
checksum, and V005 *did* apply cleanly on Neon and in CI — both of which ran it
against an empty `users` table, where a no-op `UPDATE` is indistinguishable
from a successful one. Editing it now would break the environments where it
worked in order to help the ones where it did not.

**If your local database is stuck on this:** the data down there is demo seed
that `BootstrapData` and `DevFleetSeeder` regenerate, so wipe it.

```bash
cd backend
docker compose down -v && docker compose up -d
./mvnw spring-boot:run          # applies V001..V007 cleanly, reseeds
```

A deployment with real users in that state needs the rename applied by hand,
in one transaction with the bypass set, and V005 marked applied in
`flyway_schema_history`. Ask before doing that to anything that matters.

## 3. `ADD CONSTRAINT` is validated under RLS too — and it fails *silently*

Rule 2 is about `UPDATE` and `DELETE` touching zero rows. This is the nastier
sibling, because there is no error at all.

`ALTER TABLE ... ADD CONSTRAINT` validates by scanning the table, and that
scan is subject to RLS like any other read. With no tenant set, the migration
role sees **zero rows**, finds nothing to object to, and Postgres records the
constraint as *validated*:

```sql
-- On a database that already has service_jobs rows:
ALTER TABLE service_jobs
  ADD CONSTRAINT fk_service_jobs_rider FOREIGN KEY (rider_id) REFERENCES riders (id);
-- ALTER TABLE.  No error.  convalidated = true.  And it is not true.
```

You now have a constraint the database believes it is enforcing while the data
breaks it. Joins quietly drop the orphans, and the damage surfaces much later
at the worst moment: **`pg_dump`/restore aborts**, because a restore
revalidates as superuser with RLS bypassed and finally sees the rows.

Note that rule 2's sentinel does *not* save you here. `set_config('app.tenant_id', '*', true)`
works for a bypass the policy itself understands, but it is easy to reach for
it, see `ALTER TABLE`, and assume the scan was real.

**What to do instead.** Pick one, deliberately:

- **`NOT VALID`** — if pre-existing rows may legitimately violate it. The
  constraint is honestly recorded as unvalidated, `pg_dump` round-trips it,
  and *every new insert and update is still fully enforced*. Reconcile the
  history later, then `VALIDATE CONSTRAINT` as a superuser. This is what
  **V008** does for the two rider FKs, and the comment there explains why.
- **Validate for real** — drop RLS around the `ALTER` so the scan sees
  everything and fails loudly on bad rows:

  ```sql
  ALTER TABLE t DISABLE ROW LEVEL SECURITY;
  ALTER TABLE t ADD CONSTRAINT ...;
  ALTER TABLE t ENABLE ROW LEVEL SECURITY;
  ALTER TABLE t FORCE ROW LEVEL SECURITY;   -- FORCE is not restored by ENABLE
  ```

  Use this when the constraint must hold over existing data and you would
  rather the deploy stop than proceed on a false guarantee.

Either way, never let `ALTER TABLE` report success and walk away. Check:

```sql
SELECT conname, convalidated FROM pg_constraint WHERE conname = 'your_constraint';
```

## Numbering

Next free number wins; check the directory, not the design documents. The
service-management design says V003 and the charge ledger says nothing —
they landed as **V006** and **V007**, because V003 went to vehicles, V004 to
vehicle imports and V005 to the role rename.
