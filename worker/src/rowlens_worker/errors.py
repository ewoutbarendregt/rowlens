"""Errors that decide what happens to a job."""


class PermanentError(Exception):
    """Retrying can't help (not a video, too long, …): the job goes dead and the video fails.

    ``reason`` is a stable code the UI translates; the message is for the log.
    """

    def __init__(self, reason: str, message: str = "") -> None:
        super().__init__(message or reason)
        self.reason = reason


class StopRequestedError(Exception):
    """The worker is shutting down; the job goes back to the queue without using up an attempt."""
