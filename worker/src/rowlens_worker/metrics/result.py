from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class MetricStatus(StrEnum):
    OK = "ok"
    REFUSED = "refused"


@dataclass(frozen=True, slots=True)
class MetricResult:
    """A metric value plus the evidence it was derived from, or a refusal with a reason.

    `evidence_frames` are frame indices in the CFR playback rendition, so the UI can jump to them.
    `parameters` records every tunable that influenced the value, for traceability.
    """

    name: str
    unit: str
    status: MetricStatus
    value: float | None = None
    confidence: float | None = None
    reason: str | None = None
    evidence_frames: tuple[int, ...] = ()
    parameters: dict[str, float | int | str] = field(default_factory=dict)

    @classmethod
    def refused(
        cls, name: str, unit: str, reason: str, parameters: dict[str, float | int | str]
    ) -> MetricResult:
        return cls(
            name=name, unit=unit, status=MetricStatus.REFUSED, reason=reason, parameters=parameters
        )
