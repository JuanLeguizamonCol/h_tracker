"""069 - One shared Manager Review per performance review; no Final Submission

The review flow was self-assessment → one independent evaluation per assigned
reviewer → a "Final Submission" (joint_review) they agreed together. Now the
Manager Review is a single evaluation every assigned reviewer edits, and it is
the official one — there's no separate Final Submission stage anymore.

The shared Manager Review lives in the existing joint_scores / joint_notes
columns (they were already the official figures read by Analytics/Reports),
plus three new notes columns for the reviewer notes on the self-assessment's
reflection fields. Data:
  - status joint_review → in_review (reviewers keep editing the shared review)
  - a not-yet-completed review with no joint scores yet gets them seeded from
    its reviewers' independent evaluations (per-item average, rounded to a
    whole 1–5 score — the same rule the old joint stage was seeded with);
    item notes are carried over too
  - the new manager_*_notes columns are filled from the reviewers' own notes
    (prefixed with the reviewer's name when there was more than one)
  - evaluation format "managers_directors" is renamed "seniors_managers"
    (now labelled "Seniors and Managers Review")

Revision ID: 069
Revises: 068
Create Date: 2026-11-17
"""
from alembic import op
import sqlalchemy as sa

revision = '069'
down_revision = '068'
branch_labels = None
depends_on = None

NOTE_FIELDS = (
    ("strengths_notes", "manager_strengths_notes"),
    ("improvement_notes", "manager_improvement_notes"),
    ("development_notes", "manager_development_notes"),
)


def _combine(entries):
    """entries: [(reviewer_name, text)] → one text; names only when > 1 author."""
    entries = [(n, t.strip()) for n, t in entries if t and t.strip()]
    if not entries:
        return None
    if len(entries) == 1:
        return entries[0][1]
    return "\n\n".join(f"{n or 'Reviewer'}: {t}" for n, t in entries)


def upgrade():
    for _, column in NOTE_FIELDS:
        op.add_column('performance_reviews', sa.Column(column, sa.Text(), nullable=True))

    conn = op.get_bind()
    reviews_t = sa.table(
        'performance_reviews',
        sa.column('id', sa.String), sa.column('status', sa.String),
        sa.column('joint_scores', sa.JSON), sa.column('evaluation_format', sa.String),
        *[sa.column(c, sa.Text) for _, c in NOTE_FIELDS],
    )
    rr_t = sa.table(
        'performance_review_reviewers',
        sa.column('review_id', sa.String), sa.column('reviewer_id', sa.String),
        sa.column('scores', sa.JSON), sa.column('created_at', sa.DateTime),
        *[sa.column(f, sa.Text) for f, _ in NOTE_FIELDS],
    )
    emp_t = sa.table('employees', sa.column('id', sa.String), sa.column('name', sa.String))

    conn.execute(reviews_t.update().where(reviews_t.c.evaluation_format == 'managers_directors')
                 .values(evaluation_format='seniors_managers'))

    names = {r.id: r.name for r in conn.execute(sa.select(emp_t.c.id, emp_t.c.name))}
    rows_by_review = {}
    for row in conn.execute(sa.select(rr_t).order_by(rr_t.c.created_at)):
        rows_by_review.setdefault(row.review_id, []).append(row)

    for review in conn.execute(sa.select(reviews_t)).fetchall():
        rows = rows_by_review.get(review.id, [])
        values = {}
        if review.status == 'joint_review':
            values['status'] = 'in_review'
        if review.status != 'completed' and not review.joint_scores:
            by_key = {}
            for row in rows:
                for key, entry in (row.scores or {}).items():
                    agg = by_key.setdefault(key, {"scores": [], "notes": []})
                    if (entry or {}).get("score") is not None:
                        agg["scores"].append(float(entry["score"]))
                    agg["notes"].append((names.get(row.reviewer_id), (entry or {}).get("notes")))
            seeded = {}
            for key, agg in by_key.items():
                score = None
                if agg["scores"]:
                    score = max(1, min(5, round(sum(agg["scores"]) / len(agg["scores"]))))
                seeded[key] = {"score": score, "notes": _combine(agg["notes"])}
            if seeded:
                values['joint_scores'] = seeded
        for field, column in NOTE_FIELDS:
            if getattr(review, column) is None:
                combined = _combine([(names.get(r.reviewer_id), getattr(r, field)) for r in rows])
                if combined:
                    values[column] = combined
        if values:
            conn.execute(reviews_t.update().where(reviews_t.c.id == review.id).values(**values))


def downgrade():
    op.execute("UPDATE performance_reviews SET evaluation_format = 'managers_directors' "
               "WHERE evaluation_format = 'seniors_managers'")
    for _, column in NOTE_FIELDS:
        op.drop_column('performance_reviews', column)
