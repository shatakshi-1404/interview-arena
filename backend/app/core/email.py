import logging
from typing import Protocol

logger = logging.getLogger("interviewarena.email")


class EmailSender(Protocol):
    def send_password_reset(self, to_email: str, reset_url: str) -> None: ...


class ConsoleEmailSender:
    """Development sender: logs the link instead of emailing it.
    Swap for an SMTP/provider-backed implementation in production."""

    def send_password_reset(self, to_email: str, reset_url: str) -> None:
        logger.warning("PASSWORD RESET for %s -> %s", to_email, reset_url)


def get_email_sender() -> EmailSender:
    return ConsoleEmailSender()
