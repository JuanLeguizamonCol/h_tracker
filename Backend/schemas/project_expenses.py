# schemas/project_expenses.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import date, datetime

EXPENSE_CATEGORIES = ["Airfare", "Hotel", "Parking / Transportation", "Meals", "Other"]


class ProjectExpenseBase(BaseModel):
    project_id: str
    date: date
    category: str
    amount_usd: float
    description: Optional[str] = None


class ProjectExpenseCreate(ProjectExpenseBase):
    user_id: str


class ProjectExpenseOut(ProjectExpenseBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    invoice_id: Optional[str] = None
    created_at: datetime


class ProjectExpenseWithEmployeeOut(ProjectExpenseOut):
    employee_name: str
