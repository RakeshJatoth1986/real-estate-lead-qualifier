from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

# Railway provides DATABASE_URL as postgres:// but SQLAlchemy needs postgresql://
DATABASE_URL = settings.DATABASE_URL
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite needs check_same_thread=False; PostgreSQL does not
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.models import lead, agent  # noqa: F401
    Base.metadata.create_all(bind=engine)
    # Add new columns if they don't exist (safe to run repeatedly)
    migrations = [
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_status VARCHAR(50)",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS expected_conversion_date TIMESTAMP",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS agent_notes TEXT",
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS hashed_pin VARCHAR(200)",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(__import__('sqlalchemy').text(sql))
                conn.commit()
            except Exception:
                conn.rollback()
