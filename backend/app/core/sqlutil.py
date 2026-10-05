from sqlalchemy import Date, cast, func, literal_column


def utc_day(column):
    """DATE of a timestamptz column, in UTC.

    'UTC' is inlined instead of bound as a parameter so the identical expression can appear in both
    SELECT and GROUP BY (Postgres treats $1 and $2 as different expressions)."""
    return cast(func.timezone(literal_column("'UTC'"), column), Date)
