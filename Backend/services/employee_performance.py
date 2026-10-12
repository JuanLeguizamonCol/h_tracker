"""Employee performance report — the Reports page's "Performance" tab.

Combines, per employee and over a month-aligned window (last 12 months by
default), the hours they logged with the performance reviews completed in that
window:

  - monthly hours (total / billable) for every month in the window
  - avg monthly hours      = hours over the *complete* months they were employed
                             (the current, still-running month is shown but not
                             averaged, so it doesn't drag the average down)
  - billable %             = billable / total hours
  - utilization %          = billable hours / capacity, where capacity is
                             Employee.max_weekly_hours prorated by weekdays over
                             the same complete employed months
  - review score           = mean of the JOINT overall averages of their reviews
                             completed in the window (same rule as the annual
                             measurement in services/performance_reviews.py)
  - self vs manager gap    = mean(self overall − manager overall) over those reviews
  - approved time off hours, open (not completed) reviews, projects worked

Plus a per-project roll-up of the reviews completed in the window.
"""
import calendar
from collections import defaultdict
from datetime import date
from typing import Dict, List, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from models.clients import Client
from models.employees import Employee
from models.performance_reviews import PerformanceReview
from models.projects import Project
from models.pto_requests import PtoRequest
from models.time_entries import TimeEntry
from services.performance_reviews import compute_averages


def _mean(values) -> Optional[float]:
    v = [x for x in values if x is not None]
    return round(sum(v) / len(v), 2) if v else None


def month_end(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def _weekdays(start: date, end: date) -> int:
    days = (end - start).days + 1
    full_weeks, rest = divmod(days, 7)
    count = full_weeks * 5
    for i in range(rest):
        if (start.weekday() + i) % 7 < 5:
            count += 1
    return count


def default_window(today: date) -> tuple[date, date]:
    """The current month and the 11 before it."""
    y, m = today.year, today.month - 11
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1), month_end(today.year, today.month)


def build_months(start: date, end: date, today: date) -> List[dict]:
    months = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        first, last = date(y, m, 1), month_end(y, m)
        months.append({
            "key": f"{y:04d}-{m:02d}",
            "label": first.strftime("%b %Y"),
            "start": first,
            "end": last,
            # Only finished months count toward averages and capacity.
            "complete": last < today,
            "workdays": _weekdays(first, last),
        })
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return months


def _employed_in(emp: Employee, month: dict) -> bool:
    if emp.start_date and emp.start_date > month["end"]:
        return False
    if emp.end_date and emp.end_date < month["start"]:
        return False
    return True


def employee_performance(db: Session, start: date, end: date, today: date) -> dict:
    months = build_months(start, end, today)
    month_keys = [m["key"] for m in months]

    # ---- hours per employee per month (all statuses; billable split) ----
    month_expr = func.to_char(TimeEntry.date, "YYYY-MM") if db.bind.dialect.name == "postgresql" else func.strftime("%Y-%m", TimeEntry.date)
    hours_rows = (
        db.query(TimeEntry.user_id, month_expr, TimeEntry.billable, func.sum(TimeEntry.hours))
        .filter(TimeEntry.date >= start, TimeEntry.date <= end)
        .group_by(TimeEntry.user_id, month_expr, TimeEntry.billable)
        .all()
    )
    monthly: Dict[str, Dict[str, Dict[str, float]]] = defaultdict(lambda: defaultdict(lambda: {"total": 0.0, "billable": 0.0}))
    for user_id, month_key, billable, hours in hours_rows:
        cell = monthly[user_id][month_key]
        cell["total"] += float(hours or 0)
        if billable:
            cell["billable"] += float(hours or 0)

    projects_count = dict(
        db.query(TimeEntry.user_id, func.count(func.distinct(TimeEntry.project_id)))
        .filter(TimeEntry.date >= start, TimeEntry.date <= end)
        .group_by(TimeEntry.user_id)
        .all()
    )
    project_hours = {
        (u, p): float(h or 0)
        for u, p, h in db.query(TimeEntry.user_id, TimeEntry.project_id, func.sum(TimeEntry.hours))
        .filter(TimeEntry.date >= start, TimeEntry.date <= end)
        .group_by(TimeEntry.user_id, TimeEntry.project_id)
        .all()
    }

    pto_hours = dict(
        db.query(PtoRequest.user_id, func.sum(PtoRequest.hours))
        .filter(PtoRequest.status == "approved", PtoRequest.start_date >= start, PtoRequest.start_date <= end)
        .group_by(PtoRequest.user_id)
        .all()
    )

    # ---- reviews ----
    completed = (
        db.query(PerformanceReview)
        .filter(
            PerformanceReview.status == "completed",
            PerformanceReview.review_date >= start,
            PerformanceReview.review_date <= end,
        )
        .order_by(PerformanceReview.review_date.desc())
        .all()
    )
    open_counts = dict(
        db.query(PerformanceReview.employee_id, func.count(PerformanceReview.id))
        .filter(PerformanceReview.status != "completed")
        .group_by(PerformanceReview.employee_id)
        .all()
    )
    project_ids = {r.project_id for r in completed}
    project_info = {
        pid: (pname, cname)
        for pid, pname, cname in db.query(Project.id, Project.name, Client.name)
        .outerjoin(Client, Client.id == Project.client_id)
        .filter(Project.id.in_(project_ids))
        .all()
    } if project_ids else {}

    reviews_by_emp: Dict[str, List[dict]] = defaultdict(list)
    for r in completed:
        pname, cname = project_info.get(r.project_id, ("Unknown", None))
        reviews_by_emp[r.employee_id].append({
            "id": r.id,
            "project_id": r.project_id,
            "project_name": pname,
            "client_name": cname,
            "review_date": r.review_date,
            "hours_in_window": project_hours.get((r.employee_id, r.project_id), 0.0),
            "self": compute_averages(r.self_scores or {})[1],
            "manager": compute_averages(r.manager_scores or {})[1],
            "joint": compute_averages(r.joint_scores or {})[1],
        })

    # ---- who to include: active employees + anyone with hours/reviews in the window ----
    involved = set(monthly) | set(reviews_by_emp)
    included = Employee.is_active.is_(True)
    if involved:
        included = or_(included, Employee.id.in_(involved))
    employees = db.query(Employee).filter(included).all()

    rows = []
    for emp in employees:
        cells = monthly.get(emp.id, {})
        total = sum(c["total"] for c in cells.values())
        billable = sum(c["billable"] for c in cells.values())
        averaged = [m for m in months if m["complete"] and _employed_in(emp, m)]
        avg_monthly = round(sum(cells.get(m["key"], {"total": 0})["total"] for m in averaged) / len(averaged), 2) if averaged else None
        weekly_cap = float(emp.max_weekly_hours or 40)
        capacity = sum(weekly_cap * m["workdays"] / 5 for m in averaged)
        billable_in_averaged = sum(cells.get(m["key"], {"billable": 0})["billable"] for m in averaged)
        reviews = reviews_by_emp.get(emp.id, [])
        gaps = [r["self"] - r["manager"] for r in reviews if r["self"] is not None and r["manager"] is not None]
        rows.append({
            "employee_id": emp.id,
            "name": emp.name,
            "title": emp.title,
            "location": emp.location,
            "is_active": bool(emp.is_active),
            "max_weekly_hours": weekly_cap,
            "monthly": {k: {"total": round(cells[k]["total"], 2), "billable": round(cells[k]["billable"], 2)} for k in month_keys if k in cells},
            "total_hours": round(total, 2),
            "billable_hours": round(billable, 2),
            "avg_monthly_hours": avg_monthly,
            "billable_pct": round(billable / total * 100, 1) if total else None,
            "utilization_pct": round(billable_in_averaged / capacity * 100, 1) if capacity else None,
            "projects_count": int(projects_count.get(emp.id, 0)),
            "pto_hours": round(float(pto_hours.get(emp.id) or 0), 2),
            "reviews": reviews,
            "reviews_count": len(reviews),
            "review_score": _mean(r["joint"] for r in reviews),
            "self_manager_gap": _mean(gaps),
            "open_reviews": int(open_counts.get(emp.id, 0)),
        })
    rows.sort(key=lambda r: r["name"].lower())

    # ---- per-project roll-up of the reviews completed in the window ----
    by_project: Dict[str, List[dict]] = defaultdict(list)
    for emp_id, reviews in reviews_by_emp.items():
        for r in reviews:
            by_project[r["project_id"]].append({**r, "employee_id": emp_id})
    projects = []
    for pid, rs in by_project.items():
        pname, cname = project_info.get(pid, ("Unknown", None))
        projects.append({
            "project_id": pid,
            "name": pname,
            "client_name": cname,
            "reviews_count": len(rs),
            "employees_reviewed": len({r["employee_id"] for r in rs}),
            "joint_avg": _mean(r["joint"] for r in rs),
            "self_avg": _mean(r["self"] for r in rs),
            "manager_avg": _mean(r["manager"] for r in rs),
            "hours_in_window": round(sum(r["hours_in_window"] for r in rs), 2),
        })
    projects.sort(key=lambda p: (-(p["joint_avg"] or 0), p["name"].lower()))

    return {
        "start": start,
        "end": end,
        "months": [{k: m[k] for k in ("key", "label", "complete", "workdays")} for m in months],
        "employees": rows,
        "projects": projects,
    }
