from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    risk_score = Column(Float, nullable=False)
    risk_level = Column(String(20), nullable=False)
    document_type = Column(String(50), default="Synthetic Specimen ID")
    summary_findings = Column(Text, nullable=False)
    recommendation = Column(Text, nullable=False)
