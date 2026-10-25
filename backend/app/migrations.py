"""幂等 SQLite 升级：移除旧的作者非空 CHECK，保留 ID、索引及全部关联。"""
from sqlalchemy.schema import CreateTable

from .extensions import db
from .models import Paper


def upgrade_database():
    if db.engine.dialect.name != "sqlite":
        raise RuntimeError("当前升级程序仅支持 SQLite")
    db.session.remove()
    with db.engine.connect() as connection:
        sql = connection.exec_driver_sql("SELECT sql FROM sqlite_master WHERE type='table' AND name='papers'").scalar()
        connection.commit()
        if sql and "ck_paper_authors" in sql:
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
            connection.commit()
            try:
                # 显式 BEGIN：SQLite DDL 也必须参与回滚。
                connection.exec_driver_sql("BEGIN IMMEDIATE")
                ddl = str(CreateTable(Paper.__table__).compile(db.engine))
                connection.exec_driver_sql(ddl.replace("CREATE TABLE papers", "CREATE TABLE papers_stage6", 1))
                columns = ", ".join('"' + column.name + '"' for column in Paper.__table__.columns)
                connection.exec_driver_sql(f"INSERT INTO papers_stage6 ({columns}) SELECT {columns} FROM papers")
                connection.exec_driver_sql("DROP TABLE papers")
                connection.exec_driver_sql("ALTER TABLE papers_stage6 RENAME TO papers")
                for index in Paper.__table__.indexes:
                    index.create(connection)
                if connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall():
                    raise RuntimeError("数据库升级外键检查失败，已回滚")
                connection.commit()
            except Exception:
                connection.rollback()
                raise
            finally:
                connection.exec_driver_sql("PRAGMA foreign_keys=ON")
                connection.commit()
    db.create_all()
