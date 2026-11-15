import logging
import firebase_admin
from firebase_admin import credentials, messaging
from ..config import settings

log = logging.getLogger(__name__)
_ready = False
if settings.firebase_credentials:
    try:
        firebase_admin.initialize_app(credentials.Certificate(settings.firebase_credentials))
        _ready = True
    except Exception as e:  # missing file etc.
        log.warning("FCM disabled: %s", e)


def send_push(tokens: list, title: str, body: str, data: dict | None = None) -> list:
    """Returns the list of tokens that are no longer valid so callers can delete them."""
    if not _ready or not tokens:
        return []
    bad = []
    for t in tokens:
        try:
            messaging.send(messaging.Message(
                token=t, data={k: str(v) for k, v in (data or {}).items()},
                notification=messaging.Notification(title=title, body=body)))
        except (messaging.UnregisteredError, messaging.SenderIdMismatchError):
            bad.append(t)
        except Exception as e:
            log.error("push failed: %s", e)
    return bad
