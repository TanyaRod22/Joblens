import os
import time
from collections import defaultdict

WINDOW_SECONDS = 60
DEFAULT_LIMIT = 10

_requests: dict[str, list[float]] = defaultdict(list)


def _limit() -> int:
    return int(os.getenv("RATE_LIMIT_PER_MINUTE", str(DEFAULT_LIMIT)))


def is_rate_limited(client_ip: str) -> bool:
    now = time.time()
    window = _requests[client_ip]
    _requests[client_ip] = [timestamp for timestamp in window if now - timestamp < WINDOW_SECONDS]

    if len(_requests[client_ip]) >= _limit():
        return True

    _requests[client_ip].append(now)
    return False
