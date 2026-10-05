"""One-off: consolidate a duplicate project into the one that should survive.

Moves everything from the source project into the target project:
  - Time entries (project_id + role_id repointed). If, after the move, an
    employee ends up with more than one entry for the same (date, billable)
    in the target project, only the highest-hours one survives — unless a
    losing entry is already linked to an invoice (InvoiceTimeEntry), in which
    case it is kept untouched and flagged instead of silently discarding
    billed history.
  - Project roles: a source role is matched to a target role by name
    (case/whitespace-insensitive). If the target already has one, it's left
    exactly as it is and existing references are repointed to it; otherwise
    the role is copied into the target project.
  - Employee assignments (Staffing): if the employee is already assigned to
    the target project (any role), that assignment is left as-is; otherwise
    their source assignment is copied over, with its role remapped.

The source project, its roles and its (now unreferenced, or still-referenced
by a protected invoiced entry) time entries/assignments are left in place —
nothing here is destroyed, only copied/repointed — except that the source
project is deactivated at the end of a real run so new hours can't be logged
to it going forward.

Defaults to a dry run (prints the plan, writes nothing). Pass --apply to
actually commit. Safe to re-run: a second dry run / apply after a successful
apply should report nothing left to do.

--source and --target are matched by exact project name (case/whitespace
insensitive) and must each resolve to exactly one project, or the script
refuses to guess and exits.

Usage (from the Backend directory, with DATABASE_URL already pointing at the
right database):
    python -m jobs.consolidate_projects --source "Old Project" --target "Keep Project"              # dry run
    python -m jobs.consolidate_projects --source "Old Project" --target "Keep Project" --apply       # for real
"""
import argparse
import sys
from collections import defaultdict
from decimal import Decimal

from config.database import SessionLocal
from models.projects import Project
from models.project_roles import ProjectRole
from models.employee_projects import EmployeeProject
from models.time_entries import TimeEntry
from models.invoice_time_entries import InvoiceTimeEntry
from models.employees import Employee


def _norm(name: str) -> str:
    return " ".join((name or "").split()).strip().lower()


def find_project(db, name: str) -> Project:
    matches = [p for p in db.query(Project).all() if _norm(p.name) == _norm(name)]
    if len(matches) == 0:
        print(f"ERROR: no project named {name!r} found.")
        sys.exit(1)
    if len(matches) > 1:
        print(f"ERROR: {len(matches)} projects named {name!r} found (ids: {[p.id for p in matches]}) — refusing to guess.")
        sys.exit(1)
    return matches[0]


def plan_roles(db, source: Project, target: Project):
    """Returns (role_id_map, to_create, to_reuse) — role_id_map covers every
    source role id, whether it ends up pointing at a newly-created target role
    or an existing one of the same name."""
    target_roles_by_name = {_norm(r.name): r for r in db.query(ProjectRole).filter(ProjectRole.project_id == target.id).all()}
    source_roles = db.query(ProjectRole).filter(ProjectRole.project_id == source.id).all()

    role_id_map = {}
    to_create, to_reuse = [], []
    for role in source_roles:
        existing = target_roles_by_name.get(_norm(role.name))
        if existing:
            role_id_map[role.id] = existing.id
            to_reuse.append((role, existing))
        else:
            to_create.append(role)
    return role_id_map, to_create, to_reuse


def apply_roles(db, target: Project, to_create):
    """Creates the copied roles in target, returns {source_role_id: new_role.id}."""
    created_map = {}
    for role in to_create:
        new_role = ProjectRole(
            project_id=target.id,
            name=role.name,
            hourly_rate_usd=role.hourly_rate_usd,
            min_hours_enabled=role.min_hours_enabled,
            min_hours=role.min_hours,
            min_hours_basis=role.min_hours_basis,
            additional_hours_enabled=role.additional_hours_enabled,
            additional_hours_rate=role.additional_hours_rate,
            fixed_fee_period=role.fixed_fee_period,
            fixed_fee_amount=role.fixed_fee_amount,
        )
        db.add(new_role)
        db.flush()
        created_map[role.id] = new_role.id
    return created_map


def plan_assignments(db, source: Project, target: Project):
    """Returns (to_create, to_skip) — to_skip is assignments where the
    employee is already staffed on target (any role), left untouched."""
    target_user_ids = {
        ep.user_id for ep in db.query(EmployeeProject).filter(EmployeeProject.project_id == target.id).all()
    }
    source_assignments = db.query(EmployeeProject).filter(EmployeeProject.project_id == source.id).all()
    to_create, to_skip = [], []
    for ep in source_assignments:
        (to_skip if ep.user_id in target_user_ids else to_create).append(ep)
    return to_create, to_skip


def apply_assignments(db, target: Project, to_create, role_id_map):
    for ep in to_create:
        db.add(EmployeeProject(
            user_id=ep.user_id,
            project_id=target.id,
            role_id=role_id_map.get(ep.role_id, ep.role_id) if ep.role_id else None,
            allocation_percentage=ep.allocation_percentage,
            start_date=ep.start_date,
            end_date=ep.end_date,
            assigned_by=ep.assigned_by,
        ))


def plan_time_entries(db, source: Project, target: Project, role_id_map):
    """Moves every source entry's project_id (in-memory, not yet committed)
    then groups ALL of target's entries (pre-existing + moved) by
    (user_id, date, billable) to find duplicates. Returns:
      moved_count, dup_groups (list of {key, kept, discarded, invoice_protected})
    `invoice_protected` entries are duplicates that WOULD be discarded by the
    hours rule but are linked to an invoice, so they're kept instead.
    """
    source_entries = db.query(TimeEntry).filter(TimeEntry.project_id == source.id).all()
    moved_count = len(source_entries)
    for te in source_entries:
        te.project_id = target.id
        if te.role_id:
            te.role_id = role_id_map.get(te.role_id, te.role_id)
    db.flush()

    invoiced_entry_ids = {
        row[0] for row in db.query(InvoiceTimeEntry.time_entry_id)
        .join(TimeEntry, TimeEntry.id == InvoiceTimeEntry.time_entry_id)
        .filter(TimeEntry.project_id == target.id).all()
    }

    all_target_entries = db.query(TimeEntry).filter(TimeEntry.project_id == target.id).all()
    groups = defaultdict(list)
    for te in all_target_entries:
        groups[(te.user_id, te.date, te.billable)].append(te)

    dup_groups = []
    for key, rows in groups.items():
        if len(rows) <= 1:
            continue
        protected = [r for r in rows if r.id in invoiced_entry_ids]
        candidates = protected if protected else rows
        # Highest hours wins; ties broken by most-recently-created.
        naive_keep = max(rows, key=lambda r: (Decimal(r.hours), r.created_at))
        keep = max(candidates, key=lambda r: (Decimal(r.hours), r.created_at))
        discard = [r for r in rows if r.id != keep.id]
        # Never actually discard an invoice-linked row — keep it alongside, flagged.
        to_delete = [r for r in discard if r.id not in invoiced_entry_ids]
        kept_protected = [r for r in discard if r.id in invoiced_entry_ids]
        dup_groups.append({
            "key": key, "keep": keep, "delete": to_delete, "protected_extra": kept_protected,
            # True whenever the invoice-protection rule changed the outcome from
            # plain "highest hours wins" — always worth a human's eyes.
            "overrode_hours_rule": keep.id != naive_keep.id,
        })
    return moved_count, dup_groups


def run(source_name: str, target_name: str, apply: bool):
    db = SessionLocal()
    try:
        source = find_project(db, source_name)
        target = find_project(db, target_name)
        print(f"Source: {source.name!r} (id={source.id}, code={source.project_code}, active={source.is_active})")
        print(f"Target: {target.name!r} (id={target.id}, code={target.project_code}, active={target.is_active})")
        if source.id == target.id:
            print("ERROR: source and target resolved to the same project.")
            sys.exit(1)

        role_id_map, roles_to_create, roles_to_reuse = plan_roles(db, source, target)
        assignments_to_create, assignments_to_skip = plan_assignments(db, source, target)

        print(f"\nRoles: {len(roles_to_create)} to copy, {len(roles_to_reuse)} already exist in target (left as-is)")
        for r in roles_to_create:
            print(f"  + copy role {r.name!r} (${r.hourly_rate_usd}/h)")
        for src_r, tgt_r in roles_to_reuse:
            print(f"  = reuse existing target role {tgt_r.name!r} for source role {src_r.name!r}")

        print(f"\nAssignments: {len(assignments_to_create)} to copy, {len(assignments_to_skip)} already staffed on target (left as-is)")
        emp_names = {e.id: e.name for e in db.query(Employee).all()}
        for ep in assignments_to_create:
            print(f"  + copy assignment for {emp_names.get(ep.user_id, ep.user_id)}")
        for ep in assignments_to_skip:
            print(f"  = skip {emp_names.get(ep.user_id, ep.user_id)} — already assigned to target")

        if apply:
            created_role_map = apply_roles(db, target, roles_to_create)
            role_id_map.update(created_role_map)
            apply_assignments(db, target, assignments_to_create, role_id_map)

        moved_count, dup_groups = plan_time_entries(db, source, target, role_id_map)
        print(f"\nTime entries: {moved_count} moved from source into target.")
        if dup_groups:
            print(f"Found {len(dup_groups)} (employee, date, billable) groups with more than one entry after the move:")
        for g in dup_groups:
            user_id, date, billable = g["key"]
            label = "billable" if billable else "non-billable"
            name = emp_names.get(user_id, user_id)
            print(f"  {name} — {date} ({label}): keep {g['keep'].hours}h (id={g['keep'].id})")
            if g["overrode_hours_rule"]:
                print("      *** NOT the highest-hours entry — kept instead because it's linked to an invoice ***")
            for r in g["delete"]:
                print(f"      - discard {r.hours}h (id={r.id})")
            for r in g["protected_extra"]:
                print(f"      ! KEEPING {r.hours}h (id={r.id}) too — it's linked to an invoice, not discarded")

        if not apply:
            print("\nDRY RUN — nothing written. Re-run with --apply to commit.")
            db.rollback()
            return

        for g in dup_groups:
            for r in g["delete"]:
                db.delete(r)
        source.is_active = False
        db.commit()
        print(f"\nApplied. {source.name!r} has been deactivated.")
    finally:
        db.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="Project to empty out (exact name)")
    ap.add_argument("--target", required=True, help="Project to keep (exact name)")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    run(args.source, args.target, args.apply)
